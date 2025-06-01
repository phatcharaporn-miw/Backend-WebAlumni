var express = require('express');
var router = express.Router();
var db = require('../db');
var bcrypt = require('bcrypt');
var bcrypt = require('bcrypt');
const multer = require('multer');
var img = multer({ dest: 'img/'});
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
            cb(null, path.join(__dirname, '..', 'img'));
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

// Route สำหรับลงทะเบียนผู้ใช้ใหม่
router.post('/register', upload.single('image_path'), async (req, res) => {
    console.log(req.body);
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
        
    const image_path = `/img/${req.file.filename}`;        
    // console.log('Image Path:', image_path);

     // ตรวจสอบรูปแบบรหัสผ่าน
    if (!validatePassword(password)) {
        return res.status(400).json({
            message: 'รหัสผ่านต้องมีอักขระพิมพ์ใหญ่ พิมพ์เล็ก และตัวเลข และต้องมีความยาวอย่างน้อย 8 ตัวอักษร',
        });
    }

    try {
        // ตรวจสอบว่ามีผู้ใช้นี้เคยลงทะเบียนแล้วหรือไม่
        const queryCheckUser = 'SELECT * FROM login WHERE username = ?';
        const [results] = await db.promise().query(queryCheckUser, [username]);

        if (results.length > 0) {
            return res.status(400).json({ message: "ชื่อผู้ใช้นี้มีผู้ใช้งานแล้ว!" });
        }

        // สร้าง hash ของรหัสผ่าน
        const hashedPassword = await bcrypt.hash(password, 10);

        // สร้างข้อมูลผู้ใช้ในตาราง users
        const queryUser = 'INSERT INTO users (role_id, created_at, updated_at) VALUES (?, NOW(), NOW())';
        const [userResult] = await db.promise().query(queryUser, [role]);
        const user_id = userResult.insertId;

        // เพิ่มข้อมูลในตาราง login
        const queryLogin = 'INSERT INTO login (user_id, username, password) VALUES (?, ?, ?)';
        await db.promise().query(queryLogin, [user_id, username, hashedPassword]);

        if (parseInt(role) === 1 || parseInt(role) === 2 || parseInt(role) === 4) {
            // ลงข้อมูล profiles เฉพาะ role 1,2,4
            const queryProfile = `
                INSERT INTO profiles (user_id, full_name, title, email, image_path)
                VALUES (?, ?, ?, ?, ?)
            `;
            await db.promise().query(queryProfile, [
                user_id,
                full_name,
                title,
                email,
                image_path
            ]);
            console.log('เพิ่มข้อมูลใน profiles สำเร็จ');

            const educations = JSON.parse(req.body.education || '[]');
            if (parseInt(role) === 4 && educations.length > 0) {
                const edu = educations[0]; // สมมุติว่า role 4 มีแค่ 1 รายการ
                const queryEducation = `
                    INSERT INTO educations (user_id, degree_id, studentId, major_id, student_year)
                    VALUES (?, ?, ?, ?, ?)
                `;
                await db.promise().query(queryEducation, [
                    user_id,
                    edu.degree || null,
                    edu.studentId || null,
                    edu.major || null,
                    edu.student_year || null
                ]);
                console.log('เพิ่มข้อมูล education สำหรับ role 4 สำเร็จ');
            }

        } else if (parseInt(role) === 3) {
            // ลงข้อมูล profile + alumni + educations สำหรับ role 3
            const queryProfile = `
                INSERT INTO profiles (
                    user_id, full_name, nick_name, title, birthday, address,
                    phone, line, email, image_path
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
            await db.promise().query(queryProfile, [
                user_id,
                full_name || null,
                nick_name || null,
                title || null,
                birthday || null,
                address || null,
                phone || null,
                line || null,
                email || null,
                image_path || null,
            ]);
        
            const educations = JSON.parse(req.body.education || '[]');
        
            if (Array.isArray(educations) && educations.length > 0) {
                const queryEducation = `
                    INSERT INTO educations (user_id, degree_id, studentId, graduation_year, major_id)
                    VALUES ?
                `;
                const educationData = educations.map((edu) => [
                    user_id,
                    edu.degree || null,
                    edu.studentId || null,
                    edu.graduation_year || null,
                    edu.major || null,
                ]);
                await db.promise().query(queryEducation, [educationData]);
                console.log('เพิ่มข้อมูล education สำเร็จ');
            }
            
            const major = educations.length > 0 ? educations[0].major : null;
            if (major) {
                const queryAlumni = `INSERT INTO alumni (user_id, major_id) VALUES (?, ?)`;
                await db.promise().query(queryAlumni, [user_id, major]);
                console.log('เพิ่มข้อมูลใน alumni สำเร็จ');
            }
        } else {
            // ถ้า role ไม่ใช่ 1,2,3,4
            return res.status(400).json({ message: 'Role ที่เลือกไม่ถูกต้อง' });
        }               

            return res.status(201).json({ 
                    message: 'ลงทะเบียนสำเร็จ',
                    user_id: user_id
            });
                
            } catch (err) {
                console.error(err);
                res.status(500).json({ message: 'ไม่สามารถลงทะเบียนได้' });
            }
});

//ดึงข้อมูลสาขามาแสดง
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
