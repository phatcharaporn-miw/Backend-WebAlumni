var express = require('express');
var router = express.Router();
var db = require('../db');
var { LoggedIn, checkActiveUser } = require('../middlewares/auth');
const bcrypt = require('bcryptjs');
var multer = require('multer');
const path = require('path');
const { SystemlogAction } = require('../logUserAction');
const util = require('util'); // เพิ่มบนสุดของไฟล์
const dbQuery = util.promisify(db.query).bind(db); // แปลง db.query เป็น promise 

// การตั้งค่า multer สำหรับการอัปโหลดไฟล์
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      // เก็บไฟล์ในโฟลเดอร์ uploads ที่อยู่ใน root ของโปรเจกต์
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


router.get('/profile', LoggedIn, checkActiveUser, (req, res) => {
  if (!req.session.user || !req.session.user.id) {
    return res.status(401).json({ success: false, message: 'กรุณาเข้าสู่ระบบ' });
  }

  const userId = req.session.user.id;

  // ดึง profile พร้อม profiles_id
  const profileQuery = `
    SELECT 
        users.user_id, 
        users.role_id, 
        profiles.profiles_id,
        profiles.full_name, 
        profiles.image_path,
        profiles.nick_name,
        profiles.title,
        profiles.birthday,
        profiles.self_description,
        profiles.address,
        profiles.phone,
        profiles.email,
        profiles.line,
        alumni.major_id,
        major.major_name AS alumni_major_name
    FROM users
    JOIN profiles ON users.user_id = profiles.user_id
    LEFT JOIN alumni ON users.user_id = alumni.user_id
    LEFT JOIN major ON alumni.major_id = major.major_id
    WHERE users.user_id = ?
  `;

  db.query(profileQuery, [userId], (err, profileResults) => {
    if (err) {
      console.error('Database error (profile):', err);
      return res.status(500).json({ success: false, message: 'Database error' });
    }

    if (profileResults.length === 0) {
      return res.status(404).json({ success: false, message: 'ไม่พบผู้ใช้' });
    }

    const userProfile = profileResults[0];
    const profileId = userProfile.profiles_id; 

    // ดึงข้อมูลการศึกษาจาก profiles_id 
    const educationQuery = `
      SELECT 
          e.education_id,
          e.degree_id,
          d.degree_name,
          e.major_id,
          m.major_name AS education_major_name,
          e.studentId,
          e.graduation_year,
          e.entry_year,
          e.student_year
      FROM educations e
      LEFT JOIN degree d ON e.degree_id = d.degree_id
      LEFT JOIN major m ON e.major_id = m.major_id
      WHERE e.profiles_id = ?
    `;

    db.query(educationQuery, [profileId], (err, educationResults) => {
      if (err) {
        console.error('Database error (educations):', err);
        return res.status(500).json({ success: false, message: 'Database error' });
      }

      // ส่งข้อมูลกลับไป
      res.json({
        success: true,
        user: {
          user_id: userProfile.user_id,
          username: req.session.user.username,
          full_name: userProfile.full_name,
          nick_name: userProfile.nick_name,
          title: userProfile.title,
          birthday: userProfile.birthday,
          address: userProfile.address,
          phone: userProfile.phone,
          email: userProfile.email,
          line: userProfile.line,
          image_path: userProfile.image_path,
          // profilePicture: userProfile.image_path 
          //   ? `http://10.198.200.71/api/${userProfile.image_path.replace(/^\/+/, '')}` 
          //   : 'http://10.198.200.71/api/uploads/default-profile.png',
          profilePicture: userProfile.image_path
            ? `http://localhost:3001/${userProfile.image_path.replace(/^\/+/, '')}`
            : 'http://localhost:3001/uploads/default-profile.png',
          role: userProfile.role_id,
          educations: educationResults.map(edu => ({
            education_id: edu.education_id,
            degree: edu.degree_id,
            degree_name: edu.degree_name,
            major: edu.major_id,
            major_name: edu.education_major_name,
            studentId: edu.studentId,
            graduation_year: edu.graduation_year,
            entry_year: edu.entry_year,
            student_year: edu.student_year,
          })),
        },
      });
    });
  });
});


// username และ password ของผู้ใช้
router.get('/login-info', LoggedIn, checkActiveUser, (req, res) => {
  const userId = req.session.user?.id;

  const query = `SELECT username, password FROM login WHERE user_id = ?`;

  db.query(query, [userId], (err, results) => {
    if (err) {
      console.error('Error fetching login info:', err);
      return res.status(500).json({ success: false, message: 'Database error' });
    }

    if (results.length === 0) {
      return res.status(404).json({ success: false, message: 'ไม่พบข้อมูล' });
    }

    res.status(200).json({ success: true, loginInfo: results[0] });
  });
});

//ส่วนของการแก้ไขข้อมูลส่วนตัว
router.post('/edit-profile', (req, res) => {
  const {
    password, email, full_name, nick_name, title,
    birthday, address, phone, line, self_description,
    major, educations
  } = req.body;

  if (!req.session.user || !req.session.user.id) {
    return res.status(401).json({ success: false, message: 'กรุณาเข้าสู่ระบบ' });
  }

  const userId = req.session.user.id;

  const profileSql = `
    UPDATE profiles SET 
      email = ?, full_name = ?, nick_name = ?, title = ?, 
      birthday = ?, address = ?, phone = ?, line = ?, self_description = ?
    WHERE user_id = ?`;
  const profileValues = [
    email || null, full_name || null, nick_name || null, title || null,
    birthday || null, address || null, phone || null, line || null,
    self_description || null, userId
  ];

  db.query(profileSql, profileValues, (err) => {
    if (err) {
      console.error('เกิดข้อผิดพลาดในการอัปเดต profiles:', err);
      return res.status(500).json({ message: 'เกิดข้อผิดพลาดในการอัปเดต profiles' });
    }

    // ถ้ามีรหัสผ่านใหม่
    if (password) {
      bcrypt.hash(password, 10, (err, hashedPassword) => {
        if (err) {
          console.error('เกิดข้อผิดพลาดในการเข้ารหัส:', err);
          return res.status(500).json({ message: 'ไม่สามารถเข้ารหัสผ่านได้' });
        }

        db.query('UPDATE users SET password = ? WHERE user_id = ?', [hashedPassword, userId], (err) => {
          if (err) {
            console.error('เกิดข้อผิดพลาดในการอัปเดตรหัสผ่าน:', err);
            return res.status(500).json({ message: 'อัปเดตรหัสผ่านไม่สำเร็จ' });
          }
          updateMajorAndEducations();
        });
      });
    } else {
      updateMajorAndEducations();
    }

    function updateMajorAndEducations() {
      if (major) {
        db.query('UPDATE alumni SET major_id = ? WHERE user_id = ?', [major, userId], (err) => {
          if (err) {
            console.error('เกิดข้อผิดพลาดในการอัปเดต major:', err);
            return res.status(500).json({ message: 'ไม่สามารถอัปเดต major ได้' });
          }
        });
      }

      if (!Array.isArray(educations) || educations.length === 0) {
        return res.json({ success: true, message: 'แก้ไขข้อมูลสำเร็จ' });
      }

      const role_id = req.session.user.userRole;

      const promises = educations.map((edu) => {
        const {
          education_id, degree, major: eduMajor, studentId,
          graduation_year, entry_year, student_year
        } = edu;

        const gradYear = graduation_year?.trim() || null;
        const entryYear = entry_year?.trim() || null;
        const studYear = student_year?.trim() || null;

        if (education_id) {
          // 🔸 เปลี่ยน WHERE user_id → WHERE profiles_id
          let updateSql = `
            UPDATE educations SET 
              degree_id = ?, major_id = ?, studentId = ?, graduation_year = ?, entry_year = ?`;

          const updateValues = [degree || null, eduMajor || null, studentId || null, gradYear, entryYear];

          if (parseInt(role_id) === 4) {
            updateSql += `, student_year = ?`;
            updateValues.push(studYear);
          }

          updateSql += ` WHERE education_id = ? AND profiles_id = ?`;
          updateValues.push(education_id, userId);

          return new Promise((resolve, reject) => {
            db.query(updateSql, updateValues, (err) => {
              if (err) {
                console.error('เกิดข้อผิดพลาดในการอัปเดต education:', err);
                reject(err);
              } else {
                resolve();
              }
            });
          });
        } else {
          // 🔸 INSERT ให้ใส่ profiles_id แทน user_id
          return new Promise((resolve, reject) => {
            const insertSql = `
              INSERT INTO educations 
                (profiles_id, degree_id, major_id, studentId, graduation_year, entry_year${parseInt(role_id) === 4 ? ', student_year' : ''})
              VALUES (?, ?, ?, ?, ?, ?${parseInt(role_id) === 4 ? ', ?' : ''})`;

            const insertValues = parseInt(role_id) === 4
              ? [userId, degree || null, eduMajor || null, studentId || null, gradYear || null, entryYear || null, studYear || null]
              : [userId, degree || null, eduMajor || null, studentId || null, gradYear || null, entryYear || null];

            db.query(insertSql, insertValues, (err) => {
              if (err) {
                console.error('เกิดข้อผิดพลาดในการเพิ่ม education:', err);
                reject(err);
              } else {
                resolve();
              }
            });
          });
        }
      });

      Promise.all(promises)
        .then(() => {
          res.json({ success: true, message: 'แก้ไขข้อมูลสำเร็จ' });
        })
        .catch(() => {
          res.status(500).json({ message: 'เกิดข้อผิดพลาดในการแก้ไขข้อมูลการศึกษา' });
        });
    }
  });
});


router.post('/update-profile-image', upload.single('image_path'), async (req, res) => {
  const user_id = req.session.user?.id;
  // const { user_id } = req.body;
  const file = req.file;

  console.log("user_id:", user_id);
  console.log("file:", file);

  if (!user_id) {
    return res.status(401).json({ message: 'ไม่ได้เข้าสู่ระบบ' });
  }

  if (!file) {
    return res.status(400).json({ message: 'กรุณาอัปโหลดรูปภาพ' });
  }

  const image_path = `uploads/${file.filename}`;

  try {
    const [result] = await db.promise().query(
      'UPDATE profiles SET image_path = ? WHERE user_id = ?',
      [image_path, user_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'ไม่พบผู้ใช้ หรือไม่มีการอัปเดต' });
    }

    res.status(200).json({ message: 'อัปเดตรูปสำเร็จ', newImagePath: image_path });
  } catch (err) {
    console.error("Error updating profile image:", err);
    res.status(500).json({ message: 'อัปเดตรูปไม่สำเร็จ' });
  }
});


//กระทู้ที่เคยสร้าง
router.get('/webboard-user/:userId', (req, res) => {
  // const { userId } = req.params;
  const userId = req.session.user?.id;

  const queryPost = `
    SELECT 
      webboard.webboard_id,
      users.user_id,
      profiles.full_name,
      profiles.image_path AS profile_image,
      category.category_id,
      category.category_name,
      webboard.title, 
      webboard.image_path,
      webboard.content,
      webboard.viewCount,
      webboard.favorite,
      webboard.created_at,
      webboard.sort_order
      FROM webboard
      LEFT JOIN users ON webboard.user_id = users.user_id
      LEFT JOIN profiles ON users.user_id = profiles.user_id
      LEFT JOIN category ON webboard.category_id = category.category_id
      WHERE webboard.user_id = ? AND webboard.deleted_at IS NULL
    `;

  db.query(queryPost, [userId], (err, results) => {
    if (err) {
      console.error('เกิดข้อผิดพลาดในการดึงกระทู้:', err);
      return res.status(500).json({ success: false, message: 'Database error' });
    }

    if (results.length === 0) {
      return res.status(404).json({ success: false, message: 'ไม่พบกระทู้ของผู้ใช้คนนี้' });
    }

    return res.status(200).json({ success: true, data: results });
  });
});

// webboard ที่ต้องการแก้ไข
router.get('/webboard/:webboardId', (req, res) => {
  const { webboardId } = req.params;
  const query = `SELECT * FROM webboard WHERE webboard_id = ? AND deleted_at IS NULL`;

  db.query(query, [webboardId], (err, results) => {
    if (err) {
      console.error('เกิดข้อผิดพลาด:', err);
      return res.status(500).json({ success: false, message: 'Database error' });
    }
    if (results.length === 0) {
      return res.status(404).json({ success: false, message: 'ไม่พบกระทู้' });
    }
    const webboard = results[0];


    return res.status(200).json({ success: true, data: results[0], webboardTitle: webboard.title });
  });
});


// แก้ไขกระทู้
router.put('/edit-webboard/:webboardId', upload.single("image"), (req, res) => {
  const { webboardId } = req.params;
  const userId = req.session.user?.id;
  const ipAddress = req.ip; 

  const { title, content, category_id } = req.body;
  const image_path = req.file ? req.file.path : null;

  if (!title && !content && !image_path && !category_id) {
    return res.status(400).json({ success: false, message: "ไม่มีข้อมูลที่ต้องแก้ไข" });
  }

  const queryUpdateWebboard = `
        UPDATE webboard 
        SET title = COALESCE(?, title), 
            content = COALESCE(?, content), 
            image_path = COALESCE(?, image_path), 
            category_id = COALESCE(?, category_id),
            updated_at = NOW()
        WHERE webboard_id = ? AND deleted_at IS NULL
    `;

  db.query(queryUpdateWebboard, [title, content, image_path, category_id, webboardId], (err, results) => {
    if (err) {
      console.error('เกิดข้อผิดพลาดในการแก้ไขกระทู้:', err);
      return res.status(500).json({ success: false, message: 'Database error' });
    }

    if (results.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'ไม่พบกระทู้ หรือกระทู้ถูกลบแล้ว' });
    }

        SystemlogAction(
            userId, // ID ของผู้กระทำ
            'Webboard', // moduleName
            'UPDATE',   // actionType: แก้ไขข้อมูล
            `ผู้ใช้ ${userId} แก้ไขกระทู้: ${webboardId}`, // description
            ipAddress,
            webboardId // relatedId
        );
    return res.status(200).json({ success: true, message: 'แก้ไขกระทู้สำเร็จ!' });
  });
});

//soft delete
router.delete('/delete-webboard/:webboardId', (req, res) => {
  const { webboardId } = req.params;

  const queryDelete = `UPDATE webboard SET deleted_at = NOW() WHERE webboard_id = ?`;

  db.query(queryDelete, [webboardId], (err, results) => {
    if (err) {
      console.error('เกิดข้อผิดพลาดในการลบกระทู้:', err);
      return res.status(500).json({ success: false, message: 'Database error' });
    }

    if (results.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'ไม่พบกระทู้ หรือถูกลบไปแล้ว' });
    }

    return res.status(200).json({ success: true, message: 'ลบกระทู้สำเร็จ!' });
  });
})

module.exports = router;
