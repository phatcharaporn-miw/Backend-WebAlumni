var express = require('express');
var router = express.Router();
var db = require('../db');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const { logUserAction } = require('../logUserAction');

router.post('/login', (req, res) => {
  console.log("Login request body:", req.body);
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
      req.session.user = {
        id: user.user_id,
        username: user.username,
        role: user.role_id,
        is_active: user.is_active,  
        image_path: user.image_path  
      };

      console.log("Session after login:", req.session.user);

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

// router.post('/login', (req, res) => {
//   console.log("Login request body:", req.body);
//   const { username, password } = req.body;

//   if (!username || !password) {
//     return res.status(400).json({ success: false, message: 'กรุณากรอก username และ password' });
//   }

//   const query = `
//     SELECT login.*, role.role_id, profiles.image_path, users.is_active
//     FROM login
//     JOIN users ON login.user_id = users.user_id
//     JOIN role ON users.role_id = role.role_id
//     JOIN profiles ON users.user_id = profiles.user_id
//     WHERE login.username = ?
//   `;

//   db.query(query, [username], (err, results) => {
//     if (err) {
//       console.error('Database error:', err);
//       return res.status(500).json({ success: false, message: 'Database error' });
//     }

//     if (results.length === 0) {
//       return res.status(401).json({ success: false, message: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" });
//     }

//     const user = results[0];

//     //ตรวจสอบว่าถ้าเป็น first login และรหัสผ่านตรงกับค่า default
//     const defaultPassword = "alumnicollegeofcomputing";
//     const isDefaultPassword = password === defaultPassword && user.is_first_login === 1;

//     if (isDefaultPassword) {
//       req.session.user = {
//         id: user.user_id,
//         username: user.username,
//         role: user.role_id,
//         is_active: user.is_active,
//         image_path: user.image_path
//       };

//       return res.json({
//         success: true,
//         message: "เข้าสู่ระบบครั้งแรก โปรดเปลี่ยนรหัสผ่านใหม่",
//         userId: user.user_id,
//         role: user.role_id,
//         username: user.username,
//         image_path: user.image_path,
//         firstLogin: true
//       });
//     }

//     // ตรวจสอบรหัสผ่านจริงจาก bcrypt
//     bcrypt.compare(password, user.password, (err, match) => {
//       if (err) {
//         console.error('Error comparing passwords:', err);
//         return res.status(500).json({ success: false, message: 'Error comparing password' });
//       }

//       if (!match) {
//         return res.status(401).json({ success: false, message: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" });
//       }

//       if (parseInt(user.is_active) === 0) {
//         return res.status(403).json({ success: false, message: "บัญชีของคุณถูกระงับการใช้งาน" });
//       }

//       req.session.user = {
//         id: user.user_id,
//         username: user.username,
//         role: user.role_id,
//         is_active: user.is_active,
//         image_path: user.image_path
//       };

//       const firstLogin = parseInt(user.role_id) === 3 && user.is_first_login === 1;

//       res.json({
//         success: true,
//         message: 'เข้าสู่ระบบสำเร็จ!',
//         userId: user.user_id,
//         role: user.role_id,
//         username: user.username,
//         image_path: user.image_path,
//         firstLogin
//       });
//     });
//   });
// });

// Logout Route

router.post('/logout', (req, res) => {
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
// const password = "Phatcha12345678";
// bcrypt.hash(password, 10, (err, hash) => {
//   if (err) throw err;
//   console.log("Hashed password:", hash);

//   const query = 'UPDATE login SET password = ? WHERE username = ?';
//   db.query(query, [hash, 'phatcha'], (err, result) => {
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

  const sql = `
    SELECT u.user_id FROM users u
    JOIN profiles p ON u.user_id = p.user_id
    WHERE p.email = ?
  `;

  db.query(sql, [email], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: "Database error" });
    if (!result || result.length === 0) return res.status(400).json({ success: false, message: "ไม่พบอีเมลในระบบ" });

    const userId = result[0].user_id;

    console.log("จะอัปเดต OTP:", { otp, otpExpiry, userId });

    db.query(
      `UPDATE users SET otp = ?, otp_expiry = ? WHERE user_id = ?`,
      [otp, otpExpiry, userId],
      (err, updateResult) => {
        if (err) {
          console.error("อัปเดต OTP ล้มเหลว:", err);
          return res.status(500).json({ success: false, message: "อัปเดต OTP ไม่สำเร็จ" });
        }

        console.log("OTP ถูกอัปเดตแล้ว:", updateResult);
        transport.sendMail({
          from: '"Alumni System" <no-reply@alumni.com>',
          to: email,
          subject: "OTP สำหรับรีเซ็ตรหัสผ่าน",
          html: `<p>รหัส OTP ของคุณคือ: <strong>${otp}</strong> (หมดอายุใน 10 นาที)</p>`,
        }, (err, info) => {
          if (err) return res.status(500).json({ success: false, message: "ส่งอีเมลไม่สำเร็จ" });
          console.log(" ส่งอีเมลสำเร็จ:", info.messageId);
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


// ตรวจสอบชื่อ-นามสกุล
router.post('/check-fullName', (req, res) => {
  const { full_name } = req.body;
  if (!full_name) return res.status(400).json({ message: 'กรุณาระบุชื่อ-นามสกุล' });

  // ทำความสะอาด input เพื่อป้องกัน SQL Injection (ใช้ parameterized query)
  const cleanedFullName = full_name.trim();

  // ค้นหาโดยใช้ LIKE เพื่อรองรับการค้นหาแบบบางส่วน
  const query = `
    SELECT e.studentId, e.graduation_year, 
           p.full_name, d.degree_name, m.major_name
    FROM educations e
    JOIN profiles p ON e.user_id = p.user_id
    JOIN degree d ON e.degree_id = d.degree_id
    JOIN major m ON e.major_id = m.major_id
    WHERE p.full_name LIKE ?
  `;
  const param = `%${cleanedFullName}%`;

  db.query(query, [param], (err, results) => {
    if (err) {
      console.error('เกิดข้อผิดพลาดในการตรวจสอบชื่อ-นามสกุล:', err);
      return res.status(500).json({ success: false, message: 'Database error' });
    }

    if (results.length > 0) {
      // หากพบผลลัพธ์มากกว่า 1 รายการ
      if (results.length > 1) {
        return res.status(200).json({
          success: true,
          message: 'พบข้อมูลศิษย์เก่ามากกว่า 1 รายการ กรุณาระบุข้อมูลเพิ่มเติม',
          data: results,
        });
      }
      // หากพบผลลัพธ์ 1 รายการ
      return res.status(200).json({
        success: true,
        message: 'พบข้อมูลศิษย์เก่าในระบบ',
        data: results[0],
      });
    } else {
      return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลศิษย์เก่าในระบบ' });
    }
  });
});

//-----------------------รายละเอียดแดชบอร์ด-------------------------
// จำนวนผู้เข้าร่วมทั้งหมด
router.get("/participants/activities", (req, res) => {
  const sql = `
    SELECT 
      a.activity_id,
      a.activity_name,
      a.activity_date,  
      COUNT(p.participant_id) AS total_participants
    FROM activity a
    LEFT JOIN participants p ON a.activity_id = p.activity_id
    WHERE p.participant_id IS NOT NULL 
    GROUP BY a.activity_id, a.activity_name, a.activity_date
    ORDER BY a.activity_date DESC;
  `;

  db.query(sql, (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ success: false, message: "Database error" });
    }
    res.json(result); 
  });
});

// ดึงยอดบริจาครวมทั้งหมด (เฉพาะที่จ่ายสำเร็จ)
router.get('/donations', (req, res) => { 
  const query = `
    SELECT 
      p.project_id,
      p.project_name,
      p.description,
      p.donation_type,
      p.status,
      p.image_path,
      p.start_date,
      p.end_date,
      SUM(d.amount) AS current_amount
    FROM donationproject p
    JOIN donations d ON p.project_id = d.project_id
    WHERE d.payment_status = 'paid'
    GROUP BY 
      p.project_id, p.project_name, p.description, p.donation_type, p.status, p.image_path
    HAVING current_amount > 0
    ORDER BY current_amount DESC
  `;

  console.log(query);

  db.query(query, (err, results) => {
    if (err) {
      console.error('Database query failed:', err);
      return res.status(500).json({ error: 'Database query failed' });
    }
    res.json(results);
  });
});


// แสดงเฉพาะกิจกรรมที่กำลังดำเนินการ
router.get('/activities/ongoing', (req, res) => {
  const queryActivity = `
      SELECT 
        activity_id,
        activity_name,
        activity_date,
        description,
        (
          SELECT activity_image.image_path 
          FROM activity_image 
          WHERE activity_image.activity_id = activity.activity_id 
          LIMIT 1
        ) AS image_path,
        COALESCE(end_date, activity_date) AS end_date,
        start_time,
        end_time,
        max_participants,
        department_restriction,
        check_alumni,
        created_at,
        updated_at,
        deleted_at,
        CASE
          WHEN CURDATE() > COALESCE(end_date, activity_date) THEN 1
          WHEN CURDATE() < activity_date THEN 0
          ELSE 2
        END AS status,
        (SELECT COUNT(*) FROM participants WHERE participants.activity_id = activity.activity_id) AS current_participants
      FROM activity
      WHERE deleted_at IS NULL
      HAVING status = 2
    `;

  db.query(queryActivity, (err, results) => {
    if (err) {
      console.error('เกิดข้อผิดพลาดในการดึงกิจกรรม:', err);
      return res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงกิจกรรม' });
    }

    res.status(200).json({
      success: true,
      data: results
    });
  });
});

// แก้ route /donate
router.get('/donate/ongoing', (req, res) => {
    const query = `
      SELECT * 
      FROM donationproject 
      WHERE status = '1'
      ORDER BY start_date DESC
    `;
    db.query(query, (err, results) => {
        if (err) {
            console.error('Database query failed:', err);
            return res.status(500).json({ error: 'Database query failed' });
        }
        res.json(results);
    });
});

router.get("/alumni-all", (req, res) => {
    const query = `
        SELECT 
            u.user_id,
            u.role_id,
            r.role_name,
            u.is_active,
            p.full_name,
            p.email,
            p.phone,
            p.address,
            p.image_path,
            e.education_id,
            e.degree_id,
            e.major_id,
            e.studentId,
            e.graduation_year,
            e.entry_year,
            d.degree_name,
            m.major_name
        FROM users u
        LEFT JOIN profiles p ON u.user_id = p.user_id
        LEFT JOIN role r ON u.role_id = r.role_id
        LEFT JOIN educations e ON u.user_id = e.user_id
        LEFT JOIN degree d ON e.degree_id = d.degree_id
        LEFT JOIN major m ON e.major_id = m.major_id
        WHERE u.role_id = 3
        ORDER BY p.full_name, e.graduation_year;
    `;

    db.query(query, (err, result) => {
        if (err) {
            console.error("Database query failed:", err);
            return res.status(500).json({ success: false, message: "Database error" });
        }

        // รวมการศึกษาของแต่ละ alumni เป็น array
        const alumniMap = {};
        result.forEach(row => {
            if (!alumniMap[row.user_id]) {
                alumniMap[row.user_id] = {
                    user_id: row.user_id,
                    role_id: row.role_id,
                    role_name: row.role_name,
                    is_active: row.is_active,
                    full_name: row.full_name,
                    email: row.email,
                    phone: row.phone,
                    address: row.address,
                    image_path: row.image_path,
                    educations: []
                };
            }
            if (row.education_id) {
                alumniMap[row.user_id].educations.push({
                    education_id: row.education_id,
                    degree_id: row.degree_id,
                    degree_name: row.degree_name,
                    major_id: row.major_id,
                    major_name: row.major_name,
                    studentId: row.studentId,
                    graduation_year: row.graduation_year,
                    entry_year: row.entry_year
                });
            }
        });

        res.json({ success: true, data: Object.values(alumniMap) });
    });
});


module.exports = router;
