var express = require('express');
var router = express.Router();
var db = require('../db');
const bcrypt = require('bcrypt');
const passport = require('passport');


router.post('/login', (req, res) => {
    const { username, password } = req.body;

    const query = `
      SELECT login.*, role.role_id, profiles.image_path
FROM login
JOIN users ON login.user_id = users.user_id
JOIN role ON users.role_id = role.role_id
JOIN profiles ON users.user_id = profiles.user_id
WHERE login.username = ?
    `;

    db.query(query, [username], (err, results) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ success: false, message: 'Database error' });
        }

        if (results.length === 0) {
            return res.status(401).json({ success: false, message: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" });
        }

        const user = results[0];

        // ตั้งค่า session ให้กับ user
        req.session.user = {
            id: user.user_id,
            username: user.username,
            role: user.role_id,
        };

        console.log('Session after login:', req.session);  // ตรวจสอบ session ที่บันทึกแล้ว

        res.json({
            success: true,
            message: 'เข้าสู่ระบบสำเร็จ!',
            userId: user.user_id,
            role: user.role_id,
            username: user.username,
            image_path: user.image_path  // ตรวจสอบว่า image_path ถูกส่งไป
        });

    });
});


//เอาไว้เช็คการ hash password
// const password = "admin";
// bcrypt.hash(password, 10, (err, hash) => {
//   if (err) throw err;
//   console.log("Hashed password:", hash);

//   const query = 'UPDATE login SET password = ? WHERE username = ?';
//   db.query(query, [hash, 'admin'], (err, result) => {
//     if (err) throw err;
//     console.log('Password updated!');
//   });
// }); 

// Logout Route
router.get('/logout', (req, res) => {
    // ลบ session ทั้งหมดเพื่อออกจากระบบ
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ message: "เกิดข้อผิดพลาดในการออกจากระบบ" });
        }
        // ลบ cookie ที่เก็บ session ID
        res.clearCookie('connect.sid');

        return res.status(200).json({ message: "ออกจากระบบสำเร็จ!" });
    });
});


module.exports = router;
