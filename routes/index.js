var express = require('express');
var router = express.Router();
var db = require('../db');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const { logUserAction } = require('../logUserAction');


router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'กรุณากรอก username และ password' });
  }

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

    if (!user.password) {
      return res.status(500).json({ success: false, message: 'Password hash is missing in database' });
    }

    bcrypt.compare(password, user.password, (err, match) => {
      if (err) {
        console.error('Error comparing passwords:', err);
        return res.status(500).json({ success: false, message: 'Error comparing password' });
      }

      if (!match) {
        return res.status(401).json({ success: false, message: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" });
      }

      if (parseInt(user.is_active) === 0) {
        return res.status(403).json({ success: false, message: "บัญชีของคุณถูกระงับการใช้งาน" });
      }

      // บันทึก session
      req.session.user = { id: user.user_id, username: user.username, role: user.role_id };

      // บังคับเปลี่ยนรหัสครั้งแรกเฉพาะ alumni (role=3) ที่ถูกสร้างโดย admin
      const firstLogin = parseInt(user.role_id) === 3 && user.is_first_login === 1;

      res.json({
        success: true,
        message: 'เข้าสู่ระบบสำเร็จ!',
        userId: user.user_id,
        role: user.role_id,
        username: user.username,
        image_path: user.image_path,
        firstLogin
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
// const password = "Admin12345678";
// bcrypt.hash(password, 10, (err, hash) => {
//   if (err) throw err;
//   console.log("Hashed password:", hash);

//   const query = 'UPDATE login SET password = ? WHERE username = ?';
//   db.query(query, [hash, 'ad_min'], (err, result) => {
//     if (err) throw err;
//     console.log('Password updated!');
//   });
// }); 


// เปลี่ยนรหัสผ่านเมื่อเข้าระบบครั้งแรก
router.post('/change-password', (req, res) => {
  const { userId, newPassword } = req.body;

  // ตรวจสอบข้อมูลที่รับมา
  if (!userId || !newPassword) {
    return res.status(400).send("Missing required fields");
  }

  bcrypt.hash(newPassword, 10, (err, hashedPassword) => {
    if (err) return res.status(500).send('Error hashing password');

    db.query(
      'UPDATE login SET password = ?, is_first_login = FALSE WHERE user_id = ?',
      [hashedPassword, userId],
      (err, results) => {
        if (err) return res.status(500).send('Database error');
        return res.status(200).send('เปลี่ยนรหัสผ่านสำเร็จ');
      }
    );
  });
});

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

  // console.log("📨 Email ที่รับมา:", email);
  // console.log("🔧 OTP:", otp, "| หมดอายุ:", otpExpiry);

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
          console.error("อัปเดต OTP ล้มเหลว:", err);
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

    // console.log("🔐 ตรวจ OTP:", {
    //   storedOtp,
    //   clientOtp: otp,
    //   otpExpiry: otpExpiry.format(),
    //   now: now.format()
    // });

    if (String(storedOtp) !== String(otp).trim() || now.isAfter(otpExpiry)) {
      return res.status(400).json({ success: false, message: "OTP ไม่ถูกต้องหรือหมดอายุ" });
    }


    bcrypt.hash(newPassword, 10, (err, hashedPassword) => {
      if (err) return res.status(500).json({ success: false, message: "ไม่สามารถเข้ารหัสรหัสผ่านได้" });

      db.query("UPDATE login SET password = ? WHERE user_id = ?", [hashedPassword, user.user_id], (err) => {
        if (err) return res.status(500).json({ success: false, message: "ไม่สามารถรีเซ็ตรหัสผ่านได้" });

        // ค่าใน DB เป็น NULL หลังรีเซ็ต
        db.query("UPDATE users SET otp = NULL, otp_expiry = NULL WHERE user_id = ?", [user.user_id], (err) => {
          if (err) return res.status(500).json({ success: false, message: "ไม่สามารถล้าง OTP ได้" });

          res.json({ success: true, message: "รีเซ็ตรหัสผ่านสำเร็จ กรุณาเข้าสู่ระบบใหม่" });
        });
      });
    });
  });
});


// ตรวจสอบรหัสนักศึกษา
router.post('/check-studentId', (req, res) => {
  const { studentId } = req.body;
  if (!studentId) return res.status(400).json({ message: 'กรุณาระบุรหัสนักศึกษา' });
  // console.log('Received studentId:', studentId);

  let query = '';
  let param = '';

  if (/^\d{9}-\d$/.test(studentId)) {
    // กรณีใส่รหัสเต็ม เช่น 653380253-3
    query = `
      SELECT e.studentId, e.graduation_year, 
             p.full_name, d.degree_name, m.major_name
      FROM educations e
      JOIN profiles p ON e.user_id = p.user_id
      JOIN degree d ON e.degree_id = d.degree_id
      JOIN major m ON e.major_id = m.major_id
      WHERE e.studentId = ?
    `;
    param = studentId;
  } else if (/^\d{3}-\d$/.test(studentId)) {
    // กรณีใส่ 4 ตัวท้าย เช่น 253-3
    query = `
      SELECT e.studentId, e.graduation_year, 
             p.full_name, d.degree_name, m.major_name
      FROM educations e
      JOIN profiles p ON e.user_id = p.user_id
      JOIN degree d ON e.degree_id = d.degree_id
      JOIN major m ON e.major_id = m.major_id
      WHERE e.studentId LIKE ?
    `;
    param = `%${studentId}`;
  } else {
    return res.status(400).json({ message: 'รูปแบบรหัสไม่ถูกต้อง' });
  }

  db.query(query, [param], (err, results) => {
    if (err) {
      console.error('เกิดข้อผิดพลาดในการตรวจสอบรหัสนักศึกษา:', err);
      return res.status(500).json({ success: false, message: 'Database error' });
    }

    if (results.length > 0) {
      return res.status(200).json({ success: true, message: 'พบรหัสนักศึกษาในระบบ', data: results[0] });
    } else {
      return res.status(404).json({ success: false, message: 'ไม่พบรหัสนักศึกษาในระบบ' });
    }
  });
});


module.exports = router;
