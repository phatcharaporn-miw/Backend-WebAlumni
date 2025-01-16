var express = require('express');
var router = express.Router();
var db = require('../db');
const bcrypt = require('bcrypt');
const passport = require('passport');


router.post('/login', (req, res) => {
  const { username, password } = req.body;

  const query = `
    SELECT login.*, role.role_id
    FROM login
    JOIN users ON login.user_id = users.user_id
    JOIN role ON users.role_id = role.role_id
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
      // check session ว่ามีการบันทึกหรือไม่
      console.log('Session data:', req.session);

      // ส่งข้อมูลกลับไปที่ frontend
      res.json({ 
        success: true, 
        message: 'เข้าสู่ระบบสำเร็จ!', 
        userId: user.user_id, 
        role: user.role_id, 
        
      });
    });
  });
});



//เอาไว้เช็คการ hash password
// const password = "12345";
// bcrypt.hash(password, 10, (err, hash) => {
//   if (err) throw err;
//   console.log("Hashed password:", hash);

//   const query = 'UPDATE login SET password = ? WHERE username = ?';
//   db.query(query, [hash, 'president'], (err, result) => {
//     if (err) throw err;
//     console.log('Password updated!');
//   });
// });

// Google OAuth Routes
router.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/' }),
  function (req, res) {
    res.redirect('/');
  }
);

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
