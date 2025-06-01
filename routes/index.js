var express = require('express');
var router = express.Router();
var db = require('../db');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const { logUserAction }= require('../logUserAction'); 

router.post('/login', (req, res) => {
  const { username, password } = req.body;

  const query = `
    SELECT login.*, role.role_id, profiles.image_path, users.is_active
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

    // ตรวจสอบสถานะผู้ใช้ (is_active)
    if (parseInt(user.is_active) === 0) {
      return res.status(403).json({ success: false, message: "บัญชีของคุณถูกระงับการใช้งาน" });
    }

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
       const ip = req.ip;
       logUserAction(user.user_id, 'login', ip);
     
      req.session.save(err => {
        if (err) {
          console.error('Session save error:', err);
          return res.status(500).json({ success: false, message: 'Session error' });
        }

        // ส่ง response กลับ
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
});

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

// สร้าง transport สำหรับส่งอีเมล
var transport = nodemailer.createTransport({
  host: "sandbox.smtp.mailtrap.io",
  port: 2525,
  auth: {
    user: "890a09f6088d79",
    pass: "1bad5ab925e61b"
  }
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

// ลืมรหัสผ่าน
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
dayjs.extend(utc);
dayjs.extend(timezone);

router.post("/forgot-password", (req, res) => {
  const { email } = req.body;
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const otpExpiry = dayjs().tz("Asia/Bangkok").add(10, "minute").format("YYYY-MM-DD HH:mm:ss");

  console.log("📨 Email ที่รับมา:", email);
  console.log("🔧 OTP:", otp, "| หมดอายุ:", otpExpiry);

  const sql = `
    SELECT u.user_id FROM users u
    JOIN profiles p ON u.user_id = p.user_id
    WHERE p.email = ?
  `;

  db.query(sql, [email], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: "Database error" });
    if (!result || result.length === 0) return res.status(400).json({ success: false, message: "ไม่พบอีเมลในระบบ" });

    const userId = result[0].user_id;

    console.log("📦 จะอัปเดต OTP:", { otp, otpExpiry, userId });

db.query(
  `UPDATE users SET otp = ?, otp_expiry = ? WHERE user_id = ?`,
  [otp, otpExpiry, userId],
  (err, updateResult) => {
    if (err) {
      console.error("❌ อัปเดต OTP ล้มเหลว:", err);
      return res.status(500).json({ success: false, message: "อัปเดต OTP ไม่สำเร็จ" });
    }

    console.log("✅ OTP ถูกอัปเดตแล้ว:", updateResult);
        transport.sendMail({
          from: '"Alumni System" <no-reply@alumni.com>',
          to: email,
          subject: "OTP สำหรับรีเซ็ตรหัสผ่าน",
          html: `<p>รหัส OTP ของคุณคือ: <strong>${otp}</strong> (หมดอายุใน 10 นาที)</p>`,
        }, (err, info) => {
          if (err) return res.status(500).json({ success: false, message: "ส่งอีเมลไม่สำเร็จ" });
          console.log("📤 ส่งอีเมลสำเร็จ:", info.messageId);
          res.json({ success: true });
        });
      }
    );
  });
});


// รีเซ็ตรหัสผ่าน
router.post("/reset-password", (req, res) => {
  const { email, otp, newPassword } = req.body;

  const query = `
    SELECT u.user_id, u.otp, u.otp_expiry FROM users u
    JOIN profiles p ON u.user_id = p.user_id
    WHERE p.email = ?
  `;

  db.query(query, [email], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: "เกิดข้อผิดพลาดภายในระบบ" });
    if (results.length === 0) return res.status(400).json({ success: false, message: "ไม่พบอีเมล" });

    const user = results[0];
    const storedOtp = user.otp;
    const otpExpiry = dayjs(user.otp_expiry).tz("Asia/Bangkok");
    const now = dayjs().tz("Asia/Bangkok");

    console.log("🔐 ตรวจ OTP:", {
      storedOtp,
      clientOtp: otp,
      otpExpiry: otpExpiry.format(),
      now: now.format()
    });

    if (String(storedOtp) !== String(otp).trim() || now.isAfter(otpExpiry)) {
      return res.status(400).json({ success: false, message: "OTP ไม่ถูกต้องหรือหมดอายุ" });
    }


    bcrypt.hash(newPassword, 10, (err, hashedPassword) => {
      if (err) return res.status(500).json({ success: false, message: "ไม่สามารถเข้ารหัสรหัสผ่านได้" });

      db.query("UPDATE login SET password = ? WHERE user_id = ?", [hashedPassword, user.user_id], (err) => {
        if (err) return res.status(500).json({ success: false, message: "ไม่สามารถรีเซ็ตรหัสผ่านได้" });

        db.query("UPDATE users SET otp = NULL, otp_expiry = NULL WHERE user_id = ?", [user.user_id], (err) => {
          if (err) return res.status(500).json({ success: false, message: "ไม่สามารถล้าง OTP ได้" });

          res.json({ success: true, message: "รีเซ็ตรหัสผ่านสำเร็จ กรุณาเข้าสู่ระบบใหม่" });
        });
      });
    });
  });
});

module.exports = router;
