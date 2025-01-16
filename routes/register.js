var express = require('express');
var router = express.Router();
var db = require('../db');
var bcrypt = require('bcrypt'); 
const multer = require('multer');
var img = multer({ dest: 'img/'});

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
    console.log('Uploaded File:', req.file);
    const { username, password, email, role, full_name, nick_name, title, birthday, address, phone, line, major,studentId, graduation_year, degree} = req.body;
    
    const image_path = req.file ? req.file.path.replace(/\\/g, '/') : null;        
    console.log('Image Path:', image_path);

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

        if (parseInt(role) === 3) {
            // เพิ่มข้อมูลลงในตาราง profile
            const queryProfile = 'INSERT INTO profiles (user_id, full_name, nick_name, title, birthday, address, phone, line, email, studentId, graduation_year, image_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
            await db.promise().query(queryProfile, [user_id, full_name, nick_name, title, birthday, address, phone, line, email, studentId, graduation_year, image_path]);
                   
        }

        // เพิ่มข้อมูลลงในตาราง alumni
        const queryAlumni = 'INSERT INTO alumni (user_id, major_id) VALUES (?, ?)';
        await db.promise().query(queryAlumni, [user_id, major]);

        // ตรวจสอบและเพิ่มข้อมูล degree
        if (Array.isArray(degree) && degree.length > 0) {
            const queryDegree = 'INSERT INTO user_degree (user_id, degree_id) VALUES ?';
            const degreeData = degree.map(degreeId => [user_id, degreeId]);

            await db.promise().query(queryDegree, [degreeData]); 
        } else {
            console.log('No degree selected or invalid degree array');
        }

        return res.status(201).json({ message: 'ลงทะเบียนสำเร็จ' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'ไม่สามารถลงทะเบียนได้' });
    }
   
    });
    

//ดึงข้อมูลสาขามาแสดง
router.get('/major', async (req, res) => {
    try {
        const [rows] = await db.promise().query('SELECT major_id, major_name  FROM major');
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

