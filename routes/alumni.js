var express = require('express');
var router = express.Router();
var db = require('../db');
const multer = require('multer');
const xlsx = require('xlsx');
const bcrypt = require('bcrypt');

const upload = multer({ dest: "uploads/" });


const majorMap = {
  cs: 'วิทยาการคอมพิวเตอร์',
  it: 'เทคโนโลยีสารสนเทศ',
  gis: 'ภูมิสารสนเทศศาสตร์',
  cy: 'ความปลอดภัยไซเบอร์',
  ai: 'ปัญญาประดิษฐ์'
};

router.get('/major/:major', (req, res) => {
  const majorName = majorMap[req.params.major];

  if (!majorName) {
    return res.status(400).json({ message: 'ไม่พบสาขาที่ร้องขอ' });
  }

  const query = `
    SELECT 
      profiles.full_name,
      educations.graduation_year,
      educations.entry_year,
      educations.studentId,
      educations.degree_id,
      major.major_name
    FROM educations
    JOIN profiles ON educations.user_id = profiles.user_id
    JOIN major ON educations.major_id = major.major_id
    JOIN users ON educations.user_id = users.user_id
    WHERE major.major_name = ? AND users.role_id = 3
  `;

  db.query(query, [majorName], (err, results) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ message: 'เกิดข้อผิดพลาดในเซิร์ฟเวอร์' });
    }
    res.json(results);
  });
});

// แสดงศิษย์เก่าดีเด่น
router.get("/outstanding-alumni", (req, res) => {
  const queryOutstanding = 
  `
    SELECT 
        u.user_id,
        p.full_name AS name,
        p.image_path,
        COUNT(DISTINCT w.webboard_id) AS post_count,
        COUNT(DISTINCT c.comment_id) AS comment_count,
        COUNT(DISTINCT ep.participant_id) AS event_count,
        IFNULL(SUM(d.amount), 0) AS total_donations,
        -- น้ำหนักคะแนนรวม
        (COUNT(DISTINCT w.webboard_id) * 2 +
        COUNT(DISTINCT c.comment_id) +
        COUNT(DISTINCT ep.participant_id) * 3 +
        IFNULL(SUM(d.amount), 0) / 100) AS engagement_score
    FROM users u
    JOIN profiles p ON u.user_id = p.user_id
    LEFT JOIN webboard w ON w.user_id = u.user_id
    LEFT JOIN comment c ON c.user_id = u.user_id
    LEFT JOIN participants ep ON ep.user_id = u.user_id
    LEFT JOIN donations d ON d.user_id = u.user_id
    WHERE u.role_id = 3 AND u.deleted_at IS NULL
    GROUP BY u.user_id
    ORDER BY engagement_score DESC
    LIMIT 5;
  `;
  db.query(queryOutstanding, (err, results) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ message: 'เกิดข้อผิดพลาดในเซิร์ฟเวอร์' });
    }
    res.json(results);
  }); 
});
  
// ดึงข้อมูลผู้ใช้ตาม ID
router.get('/:userId', (req, res) => {
    const { userId } = req.params;

    const query = `
        SELECT 
            users.user_id, 
            users.role_id,  
            role.role_name,
            users.is_active,
            profiles.full_name, 
            profiles.email, 
            profiles.phone, 
            profiles.address,
            profiles.image_path,
            educations.education_id,
            educations.degree_id,
            educations.major_id,
            educations.studentId,
            educations.graduation_year,
            educations.entry_year,
            degree.degree_name,
            major.major_name
        FROM users 
        LEFT JOIN profiles ON users.user_id = profiles.user_id
        LEFT JOIN role ON users.role_id = role.role_id
        LEFT JOIN educations ON users.user_id = educations.user_id
        LEFT JOIN degree ON educations.degree_id = degree.degree_id
        LEFT JOIN major ON educations.major_id = major.major_id
        WHERE users.user_id = ? AND users.deleted_at IS NULL
    `;

    const queryactivity = `
        SELECT 
            participants.activity_id,
            activity.activity_name,
            activity.activity_date,
            activity.description,
            (
                SELECT activity_image.image_path 
                FROM activity_image 
                WHERE activity_image.activity_id = activity.activity_id 
                LIMIT 1
            ) AS image_path,
            COALESCE(end_date, activity_date) AS end_date, 
            CASE
                WHEN COALESCE(end_date, activity_date) < CURDATE() THEN 1
                WHEN activity.activity_date > CURDATE() THEN 0
                ELSE 2
            END AS status
        FROM participants
        JOIN activity ON participants.activity_id = activity.activity_id
        WHERE participants.user_id = ?
    `;

    const queryWebboard = `
        SELECT webboard_id, title, created_at
        FROM webboard
        WHERE user_id = ? AND deleted_at IS NULL
    `;

    db.query(query, [userId], (err, results) => {
        if (err) {
            console.error('Error fetching user profile:', err);
            return res.status(500).json({ success: false, message: 'Database error' });
        }

        if (results.length === 0) {
            console.warn('No user found with user_id:', userId);
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const userInfo = {
            user_id: results[0].user_id,
            role_id: results[0].role_id,
            role_name: results[0].role_name,
            is_active: results[0].is_active,
            full_name: results[0].full_name,
            email: results[0].email,
            phone: results[0].phone,
            address: results[0].address,
            image_path: results[0].image_path,
            educations: results.map(edu => ({
                degree: edu.degree_id,
                degree_name: edu.degree_name,
                major: edu.major_id,
                major_name: edu.major_name,
                studentId: edu.studentId,
                graduation_year: edu.graduation_year,
                entry_year: edu.entry_year,
            }))
        };

        db.query(queryactivity, [userId], (errAct, actResults) => {
            if (errAct) {
                console.error("Error fetching activities:", errAct);
                return res.status(500).json({ success: false, message: 'Error fetching activities' });
            }

            db.query(queryWebboard, [userId], (errPost, postResults) => {
                if (errPost) {
                    console.error("Error fetching posts:", errPost);
                    return res.status(500).json({ success: false, message: 'Error fetching posts' });
                }

                userInfo.activities = actResults || [];
                userInfo.posts = postResults || [];

                res.status(200).json({ success: true, data: userInfo, fullName: userInfo.full_name });
            });
        });
    });
});

// อัปโหลด Excel
// router.post("/upload-excel", upload.single("excelFile"), (req, res) => {
//     try {
//         // อ่านไฟล์ Excel
//         const workbook = xlsx.readFile(req.file.path);
//         const sheetName = workbook.SheetNames[0];
//         const sheet = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

//         if (sheet.length === 0) {
//             return res.status(400).json({ success: false, message: "ไฟล์ไม่มีข้อมูล" });
//         }

//         // วนบันทึกข้อมูล
//         sheet.forEach((row) => {
//             const {
//                 full_name,
//                 title,
//                 email,
//                 degree_id,
//                 major_id,
//                 studentId,
//                 graduation_year,
//                 entry_year,
//             } = row;

//             if (!full_name || !email) return; // ข้ามถ้าไม่มีข้อมูลหลัก

//             // แทรกข้อมูลในตาราง users ก่อน (เพื่อสร้าง user_id)
//             db.query(
//                 "INSERT INTO users (role_id, created_at, updated_at) VALUES (?, NOW(), NOW())",
//                 [3], // role 3 = alumni
//                 (err, userResult) => {
//                     if (err) {
//                         console.error("Insert users error:", err);
//                         return;
//                     }

//                     const userId = userResult.insertId;

//                     // บันทึกลง profiles
//                     db.query(
//                         "INSERT INTO profiles (user_id, full_name, title, email, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())",
//                         [userId, full_name, title, email],
//                         (err) => {
//                             if (err) console.error("Insert profiles error:", err);
//                         }
//                     );

//                     // บันทึกลง educations
//                     db.query(
//                         "INSERT INTO educations (user_id, degree_id, major_id, studentId, graduation_year, entry_year, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())",
//                         [userId, degree_id, major_id, studentId, graduation_year, entry_year],
//                         (err) => {
//                             if (err) console.error("Insert educations error:", err);
//                         }
//                     );
//                 }
//             );
//         });

//         res.json({ success: true, message: "นำเข้าข้อมูลสำเร็จ!" });
//     } catch (error) {
//         console.error(error);
//         res.status(500).json({ success: false, message: "เกิดข้อผิดพลาดขณะนำเข้าไฟล์" });
//     }
// });

router.post("/upload-excel", upload.single("excelFile"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "กรุณาเลือกไฟล์" });

    const workbook = xlsx.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(sheet);

    if (!rows.length) return res.status(400).json({ message: "ไฟล์ว่าง" });

    const defaultPassword = "alumnicollegeofcomputing";
    const hashedPassword = await bcrypt.hash(defaultPassword, 10);

    let insertedCount = 0;
    let skippedCount = 0;

    for (const row of rows) {
  const { studentId, full_name,title, email, degree_id, major_id, entry_year, graduation_year } = row;
  if (!studentId) continue;

  // ตรวจสอบว่ามี username อยู่แล้ว
  const [exist] = await db.promise().query(
    "SELECT COUNT(*) AS count FROM login WHERE username = ?",
    [studentId]
  );

  if (exist[0].count > 0) {
    skippedCount++;
    continue;
  }

  //สร้าง users
  const [userResult] = await db.promise().query(
    "INSERT INTO users (role_id, is_active, created_at) VALUES (?, ?, NOW())",
    [3, 1]
  );
  const userId = userResult.insertId;

  //สร้าง login
  await db.promise().query(
    "INSERT INTO login (user_id, username, password, is_first_login) VALUES (?, ?, ?, ?)",
    [userId, studentId, hashedPassword, 1]
  );

  //สร้าง profiles
  await db.promise().query(
    "INSERT INTO profiles (user_id, full_name, title, email, created_at) VALUES (?, ?, ?, ?, NOW())",
    [userId, full_name || "", title,  email || ""]
  );

  //เพิ่ม education
  await db.promise().query(
    "INSERT INTO educations (user_id, studentId, degree_id, major_id, entry_year, graduation_year) VALUES (?, ?, ?, ?, ?, ?)",
    [userId, studentId, degree_id, major_id, entry_year || null, graduation_year || null]
  );

  insertedCount++;
}


    res.json({
      success: true,
      message: `เพิ่มศิษย์เก่าใหม่ ${insertedCount} รายการ, ข้าม ${skippedCount} รายการ`,
      note: "รหัสผ่านเริ่มต้น: alumnicollegeofcomputing",
    });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ message: "เกิดข้อผิดพลาดระหว่างอัปโหลด" });
  }
});

module.exports = router;