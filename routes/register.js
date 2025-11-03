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

// Route สำหรับลงทะเบียนผู้ใช้ใหม่
// router.post('/register', upload.single('image_path'), async (req, res) => {
//     console.log(req.body);
//     const {
//         username,
//         password,
//         email,
//         role,
//         full_name,
//         nick_name,
//         title,
//         birthday,
//         address,
//         phone,
//         line
//     } = req.body;
    
//     const image_path = req.file ? `uploads/${req.file.filename}` : 'uploads/default-profile.png';

//     if (!validatePassword(password)) {
//         return res.status(400).json({
//             message: 'รหัสผ่านต้องมีอักขระพิมพ์ใหญ่ พิมพ์เล็ก และตัวเลข และต้องมีความยาวอย่างน้อย 8 ตัวอักษร',
//         });
//     }

//     try {
//         const queryCheckUser = 'SELECT * FROM login WHERE username = ?';
//         const [results] = await db.promise().query(queryCheckUser, [username]);
//         if (results.length > 0) {
//             return res.status(400).json({ message: "ชื่อผู้ใช้นี้มีผู้ใช้งานแล้ว!" });
//         }
//         // สร้าง hash ของรหัสผ่าน
//         const hashedPassword = await bcrypt.hash(password, 10);

//         // สร้างข้อมูลผู้ใช้ในตาราง users
//         const queryUser = 'INSERT INTO users (role_id, created_at, updated_at) VALUES (?, NOW(), NOW())';
//         const [userResult] = await db.promise().query(queryUser, [role]);
//         const user_id = userResult.insertId;

//         // เพิ่มข้อมูลในตาราง login
//         const queryLogin = 'INSERT INTO login (user_id, username, password) VALUES (?, ?, ?)';
//         await db.promise().query(queryLogin, [user_id, username, hashedPassword]);

//         if (parseInt(role) === 1 || parseInt(role) === 2 || parseInt(role) === 4) {
//             // สำหรับ role 1, 2, หรือ 4: เพิ่มแค่ข้อมูล username, password และรูปภาพ
//             console.log('Role 1 หรือ 2 กรอกแค่ username, password และ image_path เท่านั้น');

//             const queryProfile = 'INSERT INTO profiles (user_id, image_path) VALUES (?, ?)';
//             await db.promise().query(queryProfile, [user_id, image_path]);

//         } else if (parseInt(role) === 3) {
//             // สำหรับ role 3: กรอกข้อมูลทั้งหมด
//             const { full_name, nick_name, title, birthday, address, phone, line, email, studentId, graduation_year, major, degree } = req.body;

//             // เพิ่มข้อมูลในตาราง profiles
//             const queryProfile = 'INSERT INTO profiles (user_id, full_name, nick_name, title, birthday, address, phone, line, email, image_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
//             await db.promise().query(queryProfile, [user_id, full_name, nick_name, title, birthday, address, phone, line, email, image_path]);

//             // เพิ่มข้อมูลในตาราง alumni สำหรับผู้ที่มี role 3
//             const queryAlumni = 'INSERT INTO alumni (user_id, major_id) VALUES (?, ?)';
//             await db.promise().query(queryAlumni, [user_id, major]);

//             // ตรวจสอบและเพิ่มข้อมูล degree สำหรับ role 3
//             if (Array.isArray(degree) && degree.length > 0) {
//                 const queryDegree = 'INSERT INTO user_degree (user_id, degree_id) VALUES ?';
//                 const degreeData = degree.map(degreeId => [user_id, degreeId]);
//                 await db.promise().query(queryDegree, [degreeData]);

//         const hashedPassword = await bcrypt.hash(password, 10);

//         // กำหนด is_first_login
//         let isFirstLogin = 0; // default
//         if (parseInt(role) === 3) {
//             // role=3 สมัครเอง → ไม่บังคับเปลี่ยนรหัส
//             isFirstLogin = 0;
//         }

//         // สร้าง user
//         const queryUser = 'INSERT INTO users (role_id, created_at, updated_at) VALUES (?, NOW(), NOW())';
//         const [userResult] = await db.promise().query(queryUser, [role]);
//         const user_id = userResult.insertId;

//         // เพิ่ม login
//         const queryLogin = 'INSERT INTO login (user_id, username, password, is_first_login) VALUES (?, ?, ?, ?)';
//         await db.promise().query(queryLogin, [user_id, username, hashedPassword, isFirstLogin]);

//         // เพิ่ม profiles
//         if ([1,2,4].includes(parseInt(role))) {
//             const queryProfile = `
//                 INSERT INTO profiles (user_id, full_name, title, email, image_path)
//                 VALUES (?, ?, ?, ?, ?)
//             `;
//             await db.promise().query(queryProfile, [user_id, full_name, title, email, image_path]);

//             if (parseInt(role) === 4) {
//                 const educations = JSON.parse(req.body.education || '[]');
//                 if (educations.length > 0) {
//                     const edu = educations[0];
//                     const queryEducation = `
//                         INSERT INTO educations (user_id, degree_id, studentId, major_id, student_year)
//                         VALUES (?, ?, ?, ?, ?)
//                     `;
//                     await db.promise().query(queryEducation, [
//                         user_id,
//                         edu.degree || null,
//                         edu.studentId || null,
//                         edu.major || null,
//                         edu.student_year || null
//                     ]);
//                 }
//             }
//         } else if (parseInt(role) === 3) {
//             // profiles + alumni + educations สำหรับ role 3 สมัครเอง
//             const queryProfile = `
//                 INSERT INTO profiles (
//                     user_id, full_name, nick_name, title, birthday, address,
//                     phone, line, email, image_path
//                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
//             `;
//             await db.promise().query(queryProfile, [
//                 user_id,
//                 full_name || null,
//                 nick_name || null,
//                 title || null,
//                 birthday || null,
//                 address || null,
//                 phone || null,
//                 line || null,
//                 email || null,
//                 image_path || null,
//             ]);

//             // ใส่ education
//             const educations = JSON.parse(req.body.education || '[]');
//             if (Array.isArray(educations) && educations.length > 0) {
//                 const queryEducation = `
//                     INSERT INTO educations (user_id, degree_id, studentId, graduation_year, entry_year, major_id)
//                     VALUES ?
//                 `;
//                 const educationData = educations.map((edu) => [
//                     user_id,
//                     edu.degree || null,
//                     edu.studentId || null,
//                     edu.graduation_year || null,
//                     edu.entry_year || null,
//                     edu.major || null,
//                 ]);
//                 await db.promise().query(queryEducation, [educationData]);

//                 // เพิ่ม alumni table
//                 const major = educations[0].major;
//                 if (major) {
//                     const queryAlumni = `INSERT INTO alumni (user_id, major_id) VALUES (?, ?)`;
//                     await db.promise().query(queryAlumni, [user_id, major]);
//                 }
//             }
//         } else {
//             return res.status(400).json({ message: 'Role ที่เลือกไม่ถูกต้อง' });
//         }

//         return res.status(201).json({
//             message: 'ลงทะเบียนสำเร็จ',
//             user_id: user_id
//         });
        

//     }}} catch (error) {
//         console.error('Error during registration:', error);
//         return res.status(500).json({ message: 'เกิดข้อผิดพลาดในการลงทะเบียน' });
//     }

// });

//สำหรับลงทะเบียนผู้ใช้ใหม่
router.post('/register', upload.single('image_path'), async (req, res) => {
  try {
    console.log('📩 Register data:', req.body);

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

    // เพิ่มใน users
    const [userResult] = await db.promise().query(
      'INSERT INTO users (role_id, created_at, updated_at) VALUES (?, NOW(), NOW())',
      [role]
    );
    const user_id = userResult.insertId;

    // เพิ่ม login
    await db.promise().query(
      'INSERT INTO login (user_id, username, password, is_first_login) VALUES (?, ?, ?, ?)',
      [user_id, username, hashedPassword, isFirstLogin]
    );

    // เพิ่มข้อมูลโปรไฟล์
    if ([1, 2, 4].includes(parseInt(role))) {
      await db.promise().query(
        `INSERT INTO profiles (user_id, full_name, title, email, image_path)
         VALUES (?, ?, ?, ?, ?)`,
        [user_id, full_name || null, title || null, email || null, image_path]
      );

      // Officer (role=4) → อาจมีข้อมูลการศึกษา
      if (parseInt(role) === 4 && req.body.education) {
        const educations = JSON.parse(req.body.education || '[]');
        if (educations.length > 0) {
          const edu = educations[0];
          await db.promise().query(
            `INSERT INTO educations (user_id, degree_id, studentId, major_id, entry_year, graduation_year)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              user_id,
              edu.degree || null,
              edu.studentId || null,
              edu.major || null,
              edu.entry_year || null,
              edu.graduation_year || null
            ]
          );
        }
      }

    } else if (parseInt(role) === 3) {
      //Alumni
      await db.promise().query(
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

      // เพิ่มข้อมูลการศึกษา
      const educations = JSON.parse(req.body.education || '[]');
      if (educations.length > 0) {
        const queryEducation = `
          INSERT INTO educations (user_id, degree_id, studentId, graduation_year, entry_year, major_id)
          VALUES ?
        `;
        const data = educations.map(e => [
          user_id,
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
