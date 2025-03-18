var express = require('express');
var router = express.Router();
var db = require('../db');
var bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');

// การตั้งค่า multer สำหรับการอัปโหลดไฟล์
const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => {
            // เก็บไฟล์ในโฟลเดอร์ img ที่อยู่ใน root ของโปรเจกต์
            cb(null, path.join(__dirname, '..', 'img'));
        },
        filename: (req, file, cb) => {
            // ตั้งชื่อไฟล์เป็น timestamp ตามด้วยชื่อไฟล์เดิม
            cb(null, `${Date.now()}-${file.originalname}`);
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
    const { username, password, email, role, full_name, nick_name, title, birthday, address, phone, line, major, studentId, graduation_year, degree } = req.body;
    
    // ตรวจสอบว่าได้ส่งข้อมูลสำคัญมาครบหรือไม่
    if (!username || !password || !role) {
        return res.status(400).json({ message: 'กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน' });
    }

    // ตรวจสอบไฟล์ที่อัปโหลด และเก็บชื่อไฟล์เท่านั้น
    const image_path = req.file ? req.file.filename : null; // ใช้ชื่อไฟล์ที่เก็บใน system
    console.log('Uploaded Image Filename:', image_path);

    try {
        // ตรวจสอบว่ามีผู้ใช้ที่ใช้ชื่อผู้ใช้นี้แล้วหรือไม่
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
            // สำหรับ role 1, 2, หรือ 4: เพิ่มแค่ข้อมูล username, password และรูปภาพ
            console.log('Role 1 หรือ 2 กรอกแค่ username, password และ image_path เท่านั้น');

            const queryProfile = 'INSERT INTO profiles (user_id, image_path) VALUES (?, ?)';
            await db.promise().query(queryProfile, [user_id, image_path]);

        } else if (parseInt(role) === 3) {
            // สำหรับ role 3: กรอกข้อมูลทั้งหมด
            const { full_name, nick_name, title, birthday, address, phone, line, email, studentId, graduation_year, major, degree } = req.body;

            // เพิ่มข้อมูลในตาราง profiles
            const queryProfile = 'INSERT INTO profiles (user_id, full_name, nick_name, title, birthday, address, phone, line, email, studentId, graduation_year, image_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
            await db.promise().query(queryProfile, [user_id, full_name, nick_name, title, birthday, address, phone, line, email, studentId, graduation_year, image_path]);

            // เพิ่มข้อมูลในตาราง alumni สำหรับผู้ที่มี role 3
            const queryAlumni = 'INSERT INTO alumni (user_id, major_id) VALUES (?, ?)';
            await db.promise().query(queryAlumni, [user_id, major]);

            // ตรวจสอบและเพิ่มข้อมูล degree สำหรับ role 3
            if (Array.isArray(degree) && degree.length > 0) {
                const queryDegree = 'INSERT INTO user_degree (user_id, degree_id) VALUES ?';
                const degreeData = degree.map(degreeId => [user_id, degreeId]);
                await db.promise().query(queryDegree, [degreeData]);
            }
        } else {
            return res.status(400).json({ message: 'Role ที่เลือกไม่ถูกต้อง' });
        }

        return res.status(201).json({ message: 'ลงทะเบียนสำเร็จ' });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'ไม่สามารถลงทะเบียนได้' });
    }
});

// Route สำหรับดึงข้อมูลสาขามาแสดง
router.get('/major', async (req, res) => {
    try {
        const [rows] = await db.promise().query('SELECT major_id, major_name FROM major');
        if (rows.length === 0) {
            return res.status(404).json({ message: "ไม่มีข้อมูลสาขาในระบบ" });
        }
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching majors:', error);
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการดึงข้อมูลสาขา' });
    }
});

module.exports = router;
