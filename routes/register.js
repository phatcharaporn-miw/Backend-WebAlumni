var express = require('express');
var router = express.Router();
var db = require('../db');
const bcrypt = require('bcryptjs');
const multer = require('multer');
// var img = multer({ dest: 'img/'});
const path = require('path');

function validatePassword(password) {
    const pattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
    return pattern.test(password);
}

// การตั้งค่า multer สำหรับการอัปโหลดไฟล์
const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => {
            // เก็บไฟล์ในโฟลเดอร์ img ที่อยู่ใน root ของโปรเจกต์
            cb(null, path.join(__dirname, '..', 'uploads'));
        },
        filename: (req, file, cb) => {
            // ใช้ชื่อไฟล์เดิม
            cb(null, file.originalname);
        },
    }),
    fileFilter: (req, file, cb) => {
        // ตรวจสอบว่าไฟล์ที่อัปโหลดเป็นไฟล์รูปภาพหรือไม่
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('กรุณาอัปโหลดไฟล์รูปภาพเท่านั้น'), false);
        }
    },
    limits: { fileSize: 5 * 1024 * 1024 },  // จำกัดขนาดไฟล์ 5MB
});


//สำหรับลงทะเบียนผู้ใช้ใหม่
router.post('/register', upload.single('image_path'), async (req, res) => {
    try {
        // console.log('Register data:', req.body);

        const {
            username,
            password,
            email,
            role,
            full_name,
            nick_name,
            title,
            birthday,
            address,
            phone,
            line
        } = req.body;

        const image_path = req.file ? `uploads/${req.file.filename}` : 'uploads/default-profile.png';

        // ตรวจสอบรูปแบบรหัสผ่าน
        if (!validatePassword(password)) {
            return res.status(400).json({
                message: 'รหัสผ่านต้องมีอักขระพิมพ์ใหญ่ พิมพ์เล็ก ตัวเลข และยาวอย่างน้อย 8 ตัวอักษร',
            });
        }

        // ตรวจสอบว่ามี username ซ้ำหรือไม่
        const [exist] = await db.promise().query('SELECT * FROM login WHERE username = ?', [username]);
        if (exist.length > 0) {
            return res.status(400).json({ message: 'ชื่อผู้ใช้นี้มีผู้ใช้งานแล้ว!' });
        }

        // เข้ารหัสรหัสผ่าน
        const hashedPassword = await bcrypt.hash(password, 10);

        // กำหนดค่าเริ่มต้นของ is_first_login
        // role=3 (ศิษย์เก่า) → ไม่ต้องเปลี่ยนรหัสหลังสมัคร
        // role=1,2,4 (แอดมิน, ประธาน, เจ้าหน้าที่) → ให้เปลี่ยนรหัสตอนแรก
        const isFirstLogin = parseInt(role) === 3 ? 0 : 1;

        // 1. เพิ่มใน users
        const [userResult] = await db.promise().query(
            'INSERT INTO users (role_id, created_at, updated_at) VALUES (?, NOW(), NOW())',
            [role]
        );
        const user_id = userResult.insertId;

        // 2. เพิ่ม login
        await db.promise().query(
            'INSERT INTO login (user_id, username, password, is_first_login) VALUES (?, ?, ?, ?)',
            [user_id, username, hashedPassword, isFirstLogin]
        );

        let profile_id = null;

        if ([1, 2, 4].includes(parseInt(role))) {
            // Admin, President, Officer
            const [profileResult] = await db.promise().query( // <--- ดึง profileResult
                `INSERT INTO profiles (user_id, full_name, title, email, image_path)
                VALUES (?, ?, ?, ?, ?)`,
                [user_id, full_name || null, title || null, email || null, image_path]
            );
            profile_id = profileResult.insertId; // ดึง profile_id

            // Officer (role=4) → อาจมีข้อมูลการศึกษา
            if (parseInt(role) === 4 && req.body.education) {
                const educations = JSON.parse(req.body.education || '[]');
                if (educations.length > 0) {
                    const edu = educations[0];
                    await db.promise().query(
                        `INSERT INTO educations (profiles_id, degree_id, studentId, major_id, entry_year, graduation_year, student_year)
                        VALUES (?, ?, ?, ?, ?, ?, ?)`,
                        [
                            profile_id, 
                            edu.degree || null,
                            edu.studentId || null,
                            edu.major || null,
                            edu.entry_year || null,
                            edu.graduation_year || null,
                            edu.student_year || null
                        ]
                    );
                }
            }

        } else if (parseInt(role) === 3) {
            // Alumni
            const [profileResult] = await db.promise().query( // <--- ดึง profileResult
                `INSERT INTO profiles (
                    user_id, full_name, nick_name, title, birthday, address,
                    phone, line, email, image_path
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    user_id,
                    full_name || null,
                    nick_name || null,
                    title || null,
                    birthday || null,
                    address || null,
                    phone || null,
                    line || null,
                    email || null,
                    image_path
                ]
            );
            profile_id = profileResult.insertId; // <--- ดึง profile_id

            // เพิ่มข้อมูลการศึกษา
            const educations = JSON.parse(req.body.education || '[]');
            if (educations.length > 0) {
                const queryEducation = `
                    INSERT INTO educations (profiles_id, degree_id, studentId, graduation_year, entry_year, major_id)
                    VALUES ?
                `;
                const data = educations.map(e => [
                    profile_id, // <--- ใช้ profile_id แทน user_id
                    e.degree || null,
                    e.studentId || null,
                    e.graduation_year || null,
                    e.entry_year || null,
                    e.major || null
                ]);
                await db.promise().query(queryEducation, [data]);

                // เพิ่มใน alumni table
                const major = educations[0].major;
                if (major) {
                    await db.promise().query(
                        'INSERT INTO alumni (user_id, major_id) VALUES (?, ?)',
                        [user_id, major]
                    );
                }
            }

        } else {
            return res.status(400).json({ message: 'Role ที่เลือกไม่ถูกต้อง' });
        }

        return res.status(201).json({
            message: 'ลงทะเบียนสำเร็จ',
            user_id,
        });

    } catch (error) {
        console.error('Error during registration:', error);
        return res.status(500).json({ message: 'เกิดข้อผิดพลาดในการลงทะเบียน' });
    }
});

// Route สำหรับดึงข้อมูลสาขามาแสดง
router.get('/major', async (req, res) => {
    try {
        const [rows] = await db.promise().query('SELECT major_id, major_name FROM major');
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: "ไม่มีข้อมูลสาขาในระบบ" });
        }
        res.status(200).json({ success: true, major: rows });  
    } catch (error) {
        console.error('Error fetching majors:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการดึงข้อมูลสาขา' });
    }
});

module.exports = router;
