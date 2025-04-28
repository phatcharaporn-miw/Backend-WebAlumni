var express = require('express');
var router = express.Router();
var db = require('../db');
var bcrypt = require('bcrypt'); 
const multer = require('multer');
var img = multer({ dest: 'img/'});

function validatePassword(password) {
    const pattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
    return pattern.test(password);
}

// การตั้งค่า multer
const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => {
            cb(null, 'img/'); 
        },
        filename: (req, file, cb) => {
            cb(null, `${Date.now()}-${file.originalname}`); // ตั้งชื่อไฟล์
        },
    }),
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true); 
        } else {
            cb(new Error('กรุณาอัปโหลดไฟล์รูปภาพเท่านั้น'), false);
        }
    },
    limits: { fileSize: 5 * 1024 * 1024 }, // จำกัดขนาดไฟล์ 5MB
});

// ใช้ async/await ในการจัดการคำขอ
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
        line,
        major,
        studentId,
        graduation_year,
        degree
    } = req.body;
        
    const image_path = req.file ? req.file.path.replace(/\\/g, '/') : null;        
    console.log('Image Path:', image_path);

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
        
        // hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        const queryUser = 'INSERT INTO users (role_id, created_at, updated_at) VALUES (?, NOW(), NOW())';
        const [userResult] = await db.promise().query(queryUser, [role]);
        const user_id = userResult.insertId;

        // เพิ่มข้อมูลลงในตาราง login
        const queryLogin = 'INSERT INTO login (user_id, username, password) VALUES (?, ?, ?)';
        await db.promise().query(queryLogin, [user_id, username, hashedPassword]);

        if (parseInt(role) === 1 || parseInt(role) === 2 || parseInt(role) === 4) {
            // สำหรับ role 1 และ 2: เพิ่มแค่ข้อมูล username, password, และรูปภาพ
            console.log('Role 1 หรือ 2 กรอกแค่ username, password และ image_path เท่านั้น');
            
            // เพิ่มข้อมูลแค่ในตาราง login และ profiles
            const queryProfile = 'INSERT INTO profiles (user_id, full_name, image_path) VALUES (?, ?, ?)';
            await db.promise().query(queryProfile, [user_id, full_name, image_path]);
           
            // สำหรับ role 3
        } else if (parseInt(role) === 3) {
            // เพิ่มข้อมูลใน profiles
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
        
            // เพิ่มข้อมูล alumni
            try {
                const educations = JSON.parse(req.body.education || '[]');
                const major = educations.length > 0 ? educations[0].major : null; // ดึง major ตัวแรกจาก education
            
                if (!major || isNaN(major)) {
                    return res.status(400).json({ message: "ข้อมูล major_id ไม่ถูกต้อง" });
                }
            
                const [majorCheck] = await db.promise().query('SELECT major_id FROM major WHERE major_id = ?', [major]);
                if (majorCheck.length > 0) {
                    return res.status(400).json({ message: 'ไม่พบ major_id นี้ในระบบ' });
                } 
                const queryAlumni = 'INSERT INTO alumni (user_id, major_id) VALUES (?, ?)';
                await db.promise().query(queryAlumni, [user_id, major]);
            
                console.log('เพิ่มข้อมูลใน alumni สำเร็จ');
            } catch (err) {
                console.error('เกิดข้อผิดพลาดในการเพิ่มข้อมูลใน alumni:', err);
                return res.status(500).json({ message: 'ไม่สามารถเพิ่มข้อมูลใน alumni ได้', error: err.message });
            }            
            
           // เพิ่มข้อมูล education
            let educations = [];
            try {
                educations = JSON.parse(req.body.education || '[]');
            } catch (err) {
                return res.status(400).json({ message: 'รูปแบบข้อมูลการศึกษาผิดพลาด' });
            }

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
                console.log('Educations:', educations);
            }
                  
                } else {
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

