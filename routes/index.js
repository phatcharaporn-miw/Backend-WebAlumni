var express = require('express');
var router = express.Router();
var db = require('../db');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const { logUserAction, logActivity }= require('../logUserAction'); 

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

    bcrypt.compare(password, user.password, (err, match) => {
      if (err) {
        console.error('Error comparing passwords:', err);
        return res.status(500).json({ success: false, message: 'Error comparing password' });
      }

      if (!match) {
        return res.status(401).json({ success: false, message: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" });
      }
     // บันทึก session
      req.session.user = {
        id: user.user_id,
        username: user.username,
        role: user.role_id,    
      };

       // บันทึก log login
      //  const ip = req.ip;
      //  logUserAction(user.user_id, 'login', ip);

      // ส่งข้อมูลกลับไปที่ frontend
      res.json({ 
        success: true, 
        message: 'เข้าสู่ระบบสำเร็จ!', 
        userId: user.user_id, 
        role: user.role_id,
        username: user.username,   
        image_path: user.image_path, 
      });      
    });
  });
});

//เอาไว้เช็คการ hash password
// const password = "Admin1234";
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
    // ลบ cookie 
    res.clearCookie('connect.sid');

    return res.status(200).json({ message: "ออกจากระบบสำเร็จ!" });
  });
});

// ลืมรหัสผ่าน
// router.post('/forgot-password', (req, res) => {
//   const { email } = req.body;

//   const otp = Math.floor(100000 + Math.random() * 900000); // สร้างรหัส OTP 6 หลัก

//   // ค้นหา user_id จากอีเมลในตาราง profiles
//   const queryFindUserId = `
//     SELECT users.user_id 
//     FROM users
//     JOIN profiles ON users.user_id = profiles.user_id
//     WHERE profiles.email = ?
//   `;

//   db.query(queryFindUserId, [email], (err, results) => {
//     if (err) {
//       console.error('Error finding user_id:', err);
//       return res.status(500).json({ success: false, message: 'Database error while finding user_id' });
//     }

//     if (results.length === 0) {
//       return res.status(404).json({ success: false, message: 'ไม่พบอีเมลในระบบ' });
//     }

//     const userId = results[0].user_id;

//     // บันทึก OTP ลงในตาราง users
//     const queryUpdateOtp = `UPDATE users SET otp = ? WHERE user_id = ?`;
//     db.query(queryUpdateOtp, [otp, userId], (err) => {
//       if (err) {
//         console.error('Error updating OTP:', err);
//         return res.status(500).json({ success: false, message: 'Database error while updating OTP' });
//       }

//       // ส่ง OTP ไปยังอีเมล
//       sendEmail(email, `Your OTP is ${otp}`); // ฟังก์ชันส่งอีเมล
//       res.json({ success: true, message: "OTP ถูกส่งไปยังอีเมลของคุณแล้ว" });
//     });
//   });
// });

// // รีเซ็ตรหัสผ่าน
// router.post('/reset-password', (req, res) => {
//   const { username, oldPassword, otp, newPassword } = req.body;

//   // ตรวจสอบว่า username และ otp ถูกต้อง
//   const queryFindUser = `
//     SELECT login.*, users.otp 
//     FROM login
//     JOIN users ON login.user_id = users.user_id
//     WHERE login.username = ? AND users.otp = ?
//   `;

//   db.query(queryFindUser, [username, otp], (err, results) => {
//     if (err) {
//       console.error('Database error:', err);
//       return res.status(500).json({ success: false, message: 'Database error' });
//     }

//     if (results.length === 0) {
//       return res.status(400).json({ success: false, message: 'OTP หรือชื่อผู้ใช้ไม่ถูกต้อง' });
//     }

//     const user = results[0];

//     // ตรวจสอบรหัสผ่านเก่า
//     bcrypt.compare(oldPassword, user.password, (err, match) => {
//       if (err) {
//         console.error('Error comparing passwords:', err);
//         return res.status(500).json({ success: false, message: 'Error comparing password' });
//       }

//       if (!match) {
//         return res.status(400).json({ success: false, message: 'รหัสผ่านเก่าไม่ถูกต้อง' });
//       }

//       // แฮชรหัสผ่านใหม่
//       bcrypt.hash(newPassword, 10, (err, hashedPassword) => {
//         if (err) {
//           console.error('Error hashing password:', err);
//           return res.status(500).json({ success: false, message: 'Error hashing password' });
//         }

//         // อัปเดตรหัสผ่านใหม่และล้าง OTP
//         const queryUpdatePassword = `
//           UPDATE login 
//           JOIN users ON login.user_id = users.user_id
//           SET login.password = ?, users.otp = NULL
//           WHERE login.username = ?
//         `;

//         db.query(queryUpdatePassword, [hashedPassword, username], (err) => {
//           if (err) {
//             console.error('Error updating password:', err);
//             return res.status(500).json({ success: false, message: 'Database error while updating password' });
//           }

//           res.json({ success: true, message: 'รีเซ็ตรหัสผ่านสำเร็จ' });
//         });
//       });
//     });
//   });
// });

module.exports = router;
