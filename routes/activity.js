var express = require('express');
var router = express.Router();
var db = require('../db');
var multer = require('multer');
var path = require('path');
var { LoggedIn, checkActiveUser } = require('../middlewares/auth');
const { SystemlogAction } = require('../logUserAction');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  }
});

const upload = multer({ storage: storage });

// เพิ่มกิจกรรม
router.post('/post-activity', LoggedIn, checkActiveUser, upload.array('images', 5), (req, res) => {
  const ipAddress = req.ip; 
  if (!req.session.user || !req.session.user.id) {
    return res.status(401).json({ success: false, message: 'กรุณาเข้าสู่ระบบ' });
  }

  const userId = req.session.user?.id; // รับ ID จาก session
  // const imagePath = req.file ? `/uploads/${req.file.filename}` : '';   
  const {
    activity_name,
    activity_date,
    description,
    end_date,
    start_time,
    end_time,
    max_participants,
    current_participants,
    department_restriction,
    check_alumni
  } = req.body;

  // ตรวจสอบว่า end_date ถูกส่งมาหรือไม่
  const EndDate = end_date ? end_date : activity_date;
  const imagePaths = req.files.map(file => `/uploads/${file.filename}`); // หลายรูป
  // ตรวจสอบวันที่ปัจจุบัน
  const today = new Date();
  const startDate = new Date(activity_date);
  const endDate = new Date(EndDate);
  let status = 0;

  // ตรวจสอบสถานะกิจกรรม
  if (today < startDate) {
    status = 0; // กำลังจะจัดขึ้น
  } else if (today >= startDate && today <= endDate) {
    status = 2; // กำลังกำเนิดการ
  } else {
    status = 1; // เสร็จแล้ว
  }

  const queryInsertActivity = `
      INSERT INTO activity (
        user_id, activity_name, activity_date, description, end_date, status, start_time,
        end_time, max_participants, current_participants, department_restriction, check_alumni, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW());
    `;

  const values = [
    userId,
    activity_name,
    activity_date,
    description,
    EndDate,
    status,
    start_time,
    end_time,
    max_participants,
    current_participants,
    department_restriction,
    check_alumni
  ];

  db.query(queryInsertActivity, values, (err, results) => {
    if (err) {
      console.error('เกิดข้อผิดพลาดในการเพิ่มกิจกรรม:', err);
      return res.status(500).json({ error: 'ไม่สามารถเพิ่มกิจกรรมได้' });
    }

    const activityId = results.insertId;

    // เช็กก่อน insert
    if (imagePaths.length === 0) {
      return res.status(200).json({ message: 'เพิ่มกิจกรรมเรียบร้อย (ไม่มีรูป)' });
    }
    // บันทึกภาพลง activity_image
    const imageInsertQuery = `
       INSERT INTO activity_image (activity_id, image_path)
       VALUES ?
     `;
    const imageData = imagePaths.map(path => [activityId, path]);

    db.query(imageInsertQuery, [imageData], (imgErr) => {
      if (imgErr) {
        console.error('บันทึกรูปล้มเหลว:', imgErr);
        return res.status(500).json({ message: 'กิจกรรมถูกเพิ่ม แต่บันทึกรูปไม่สำเร็จ' });
      }

      // บันทึก log การเพิ่มกิจกรรม
        SystemlogAction(
            userId,
            'Activity', // moduleName
            'CREATE',   // actionType
            `เพิ่มกิจกรรม: ${activity_name}`, // description
            ipAddress,
            activityId // relatedId
        );

      res.status(200).json({ message: 'เพิ่มกิจกรรมเรียบร้อย (มีรูป)' });
    });
  });
})

// แสดงกิจกรรมทั้งหมด
router.get('/all-activity', (req, res) => {
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
        is_paid_required,
        price,
        CASE
          WHEN CURDATE() > COALESCE(end_date, activity_date) THEN 1
          WHEN CURDATE() < activity_date THEN 0
          ELSE 2
        END AS status,
        (SELECT COUNT(*) FROM participants WHERE participants.activity_id = activity.activity_id) AS current_participants
      FROM activity
      WHERE deleted_at IS NULL;
  `;

  db.query(queryActivity, (err, activities) => {
    if (err) return res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงกิจกรรม' });

    // ถ้ามีกิจกรรมต้องจ่ายเงิน ให้ดึงบัญชีสมาคม
    const hasPaidActivity = activities.some(a => a.is_paid_required === 1);

    if (!hasPaidActivity) return res.json({ success: true, data: activities });

    // ดึงบัญชี
    const queryAccounts = `SELECT bank_name, account_name, account_number, promptpay_number FROM payment_methods WHERE is_official = 1`;

    db.query(queryAccounts, (err2, accounts) => {
      if (err2) return res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงบัญชีสมาคม' });

      // เพิ่ม accounts เข้าไปในกิจกรรมที่ต้องจ่ายเงิน
      const updatedActivities = activities.map(act => ({
        ...act,
        official_accounts: act.is_paid_required === 1 ? accounts : []
      }));

      res.json({ success: true, data: updatedActivities });
    });
  });
});


// แสดงกิจกรรมตาม ID
router.get('/:activityId', (req, res) => {
  const { activityId } = req.params;

  const queryActivityId = `
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
        is_paid_required,
        price,
        CASE
          WHEN COALESCE(end_date, activity_date) < CURDATE() THEN 1
          WHEN activity_date > CURDATE() THEN 0
          ELSE 2
        END AS status,
        (SELECT COUNT(*) FROM participants WHERE participants.activity_id = activity.activity_id) AS current_participants
      FROM activity
      WHERE activity_id = ?;
  `;

  db.query(queryActivityId, [activityId], (err, results) => {
    if (err) {
      console.error('เกิดข้อผิดพลาดในการดึงกิจกรรม:', err);
      return res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงกิจกรรม' });
    }

    if (results.length === 0) {
      return res.status(404).json({ success: false, message: 'ไม่พบกิจกรรม' });
    }

    const activity = results[0];

    // ถ้ากิจกรรมต้องจ่ายเงิน ให้ดึงบัญชีสมาคม
    if (activity.is_paid_required === 1) {
      const queryAccounts = `
        SELECT bank_name, account_name, account_number, promptpay_number 
        FROM payment_methods 
        WHERE is_official = 1;
      `;

      db.query(queryAccounts, (err2, accounts) => {
        if (err2) {
          console.error('เกิดข้อผิดพลาดในการดึงบัญชีสมาคม:', err2);
          return res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงบัญชีสมาคม' });
        }

        activity.official_accounts = accounts; // เพิ่มบัญชีสมาคมเข้าไป

        res.json({ success: true, data: activity, breadcrumb: activity.activity_name });
      });
    } else {
      activity.official_accounts = [];
      res.json({ success: true, data: activity, breadcrumb: activity.activity_name });
    }
  });
});



// แก้ไขกิจกรรม
router.put('/edit-activity/:activityId', LoggedIn, checkActiveUser, upload.array('images', 5), (req, res) => {
  const { activityId } = req.params;
  const ipAddress = req.ip; 

  if (!req.session.user || !req.session.user.id) {
    return res.status(401).json({ success: false, message: 'กรุณาเข้าสู่ระบบ' });
  }

  const userId = req.session.user?.id;
  const {
    activity_name,
    activity_date,
    description,
    end_date,
    start_time,
    end_time,
    max_participants,
    department_restriction,
    check_alumni
  } = req.body;

  // อัปเดตกิจกรรมก่อน
  const updateActivity = `
      UPDATE activity SET
        activity_name = ?, activity_date = ?, description = ?, end_date = ?, 
        start_time = ?, end_time = ?, max_participants = ?, 
        department_restriction = ?, check_alumni = ?, updated_at = NOW()
      WHERE activity_id = ? 
    `;

  const activityValues = [
  activity_name,
  activity_date,
  description,
  end_date,
  start_time,
  end_time,
  max_participants,
  department_restriction,
  check_alumni === '' || check_alumni === undefined ? 0 : check_alumni,
  activityId,
  userId
];

  db.query(updateActivity, activityValues, (err, result) => {
    if (err) {
      console.error('เกิดข้อผิดพลาดในการแก้ไขกิจกรรม:', err);
      return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในระบบ' });
    }

    if (!req.files || req.files.length === 0) {

       // บันทึก log การแก้ไขกิจกรรม
        SystemlogAction(
            userId,
            'Activity', // moduleName
            'UPDATE',   // actionType
            `แก้ไขกิจกรรม: ${activity_name}`, // description
            ipAddress,
            activityId // relatedId
        );

      return res.status(200).json({ success: true, message: 'แก้ไขกิจกรรมเรียบร้อย (ไม่มีรูปใหม่)' });
    }

    // ถ้ามีรูปใหม่: ลบรูปเดิม แล้วเพิ่มใหม่
    const deleteOldImages = `DELETE FROM activity_image WHERE activity_id = ?`;
    db.query(deleteOldImages, [activityId], (deleteErr) => {
      if (deleteErr) {
        console.error('ลบรูปเดิมล้มเหลว:', deleteErr);
        return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการลบรูปเก่า' });
      }

      const insertImages = req.files.map(file => {
        const imagePath = `/uploads/${file.filename}`;
        return new Promise((resolve, reject) => {
          db.query(`INSERT INTO activity_image (activity_id, image_path) VALUES (?, ?)`, [activityId, imagePath], (imgErr) => {
            if (imgErr) reject(imgErr);
            else resolve();
          });
        });
      });

      Promise.all(insertImages)
        .then(() => {
        SystemlogAction(
            userId,
            'Activity', // moduleName
            'UPDATE',   // actionType
            `แก้ไขและเพิ่มรูปภาพ: ${activity_name}`, // description
            ipAddress,
            activityId // relatedId
        );
          return res.status(200).json({ success: true, message: 'แก้ไขกิจกรรมและรูปภาพเรียบร้อยแล้ว!' });
        })
        .catch(err => {
          console.error('เพิ่มรูปภาพใหม่ไม่สำเร็จ:', err);
          return res.status(500).json({ success: false, message: 'เพิ่มรูปภาพใหม่ไม่สำเร็จ' });
        });
    });
  });
});


// ลบกิจกรรมแบบ Soft Delete
router.delete('/delete-activity/:activityId', LoggedIn, checkActiveUser, (req, res) => {
  const { activityId } = req.params;
  const userId = req.session.user?.id;
  const ipAddress = req.ip;

  const query = `
        UPDATE activity
        SET deleted_at = NOW()
        WHERE activity_id = ?
    `;

  db.query(query, [activityId], (err, results) => {
    if (err) {
      console.error('เกิดข้อผิดพลาดในการลบกิจกรรม:', err);
      return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในระบบ' });
    }

    if (results.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'ไม่พบกิจกรรมที่ต้องการลบ' });
    }

     // บันทึก log การเพิ่มกิจกรรม
        SystemlogAction(
            userId,
            'Activity', // moduleName
            'DELETE',   // actionType
            `ลบกิจกรรม: ${activity_name}`, // description
            ipAddress,
            activityId // relatedId
        );

    res.status(200).json({ success: true, message: 'ลบกิจกรรมเรียบร้อยแล้ว!' });
  });
});


// กรอกฟอร์มกิจกรรม
router.post('/activity-form', LoggedIn, checkActiveUser, (req, res) => {
  if (!req.session.user || !req.session.user.id) {
    return res.status(401).json({ success: false, message: 'กรุณาเข้าสู่ระบบ' });
  }

  const userId = req.session.user?.id;
  const userRole = req.session.user?.role;
  const { activity_id, full_name, email, phone, batch_year, department, education_level, year_level } = req.body;

  // ตรวจสอบว่า userRole เป็นศิษย์เก่าหรือศิษย์ปัจจุบัน
  if (userRole !== 3 && userRole !== 4) {
    return res.status(403).json({ success: false, message: 'คุณไม่มีสิทธิ์เข้าร่วมกิจกรรมนี้' });
  }

  // ดึงข้อมูลกิจกรรมเพื่อตรวจสอบเงื่อนไข
  const queryActivity = `
  SELECT 
    batch_restriction,
    department_restriction,
    check_alumni,
    max_participants,
    is_paid_required, 
    price,
    (SELECT COUNT(*) FROM participants WHERE activity_id = ?) AS current_participants
  FROM activity
  WHERE activity_id = ?;
`;


  db.query(queryActivity, [activity_id, activity_id], (err, activityResults) => {
    if (err) {
      console.error('เกิดข้อผิดพลาดในการดึงข้อมูลกิจกรรม:', err);
      return res.status(500).json({ error: 'เกิดข้อผิดพลาดในระบบ' });
    }

    if (activityResults.length === 0) {
      return res.status(404).json({ success: false, message: 'ไม่พบกิจกรรม' });
    }

    const activity = activityResults[0];

    // ตรวจสอบจำนวนผู้เข้าร่วม
    if (activity.max_participants && activity.current_participants >= activity.max_participants) {
      return res.status(400).json({ success: false, message: 'กิจกรรมนี้มีผู้เข้าร่วมครบแล้ว' });
    }

    // ตรวจสอบเงื่อนไขของกิจกรรม
    if (activity.batch_restriction) {
      const allowedBatches = activity.batch_restriction.split(',').map(batch => batch.trim());
      if (!allowedBatches.includes(batch_year.toString())) {
        return res.status(400).json({ success: false, message: 'รุ่นของคุณไม่ได้รับอนุญาตให้เข้าร่วมกิจกรรมนี้' });
      }
    }

    if (activity.department_restriction) {
      const allowedDepartments = activity.department_restriction.split(',').map(dep => dep.trim());
      if (!allowedDepartments.includes(department)) {
        return res.status(400).json({ success: false, message: 'สาขาของคุณไม่ได้รับอนุญาตให้เข้าร่วมกิจกรรมนี้' });
      }
    }

    if (activity.check_alumni == 1) {
      return res.status(400).json({ success: false, message: 'กิจกรรมนี้สำหรับศิษย์เก่าเท่านั้น' });
    }

    // ตรวจสอบว่ามีผู้ใช้ลงทะเบียนแล้วหรือยัง
    const checkParticipant = `SELECT * FROM participants WHERE user_id = ? AND activity_id = ?;`;

    db.query(checkParticipant, [userId, activity_id], (err, results) => {
      if (err) {
        console.error('เกิดข้อผิดพลาดในการตรวจสอบผู้ลงทะเบียน:', err);
        return res.status(500).json({ error: 'เกิดข้อผิดพลาดในระบบ' });
      }

      if (results.length > 0) {
        return res.status(400).json({ success: false, message: 'คุณได้ลงทะเบียนกิจกรรมนี้แล้ว' });
      }

      // เตรียมค่าที่จะเพิ่มลงในฐานข้อมูล
      let queryInsertActivityForm;
      let values;

      if (userRole === 3) {
        // ศิษย์เก่า
        queryInsertActivityForm = `
            INSERT INTO participants (
                user_id, 
                activity_id, 
                full_name, 
                email, 
                phone, 
                batch_year, 
                department
            ) VALUES (?, ?, ?, ?, ?, ?, ?);
          `;
        values = [userId, activity_id, full_name, email, phone, batch_year, department];

      } else if (userRole === 4) {
        // ศิษย์ปัจจุบัน
        queryInsertActivityForm = `
            INSERT INTO participants (
                user_id, 
                activity_id, 
                full_name, 
                email, 
                phone, 
                education_level, 
                year_level, 
                department
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);
          `;
        values = [userId, activity_id, full_name, email, phone, education_level, year_level, department];
      }

      db.query(queryInsertActivityForm, values, (err, results) => {
        if (err) {
          console.error('เกิดข้อผิดพลาดในการเพิ่มข้อมูลแบบฟอร์ม:', err);
          return res.status(500).json({ error: 'เกิดข้อผิดพลาดในระบบ' });
        }

        logActivity(userId, activity, 'ลงทะเบียนเข้าร่วมกิจกรรม');

        res.status(200).json({ success: true, message: 'ลงทะเบียนเข้าร่วมกิจกรรมสำเร็จ!' });
      });
    });
  });
});

// router.post('/activity-form', LoggedIn, checkActiveUser, upload.single('paymentSlip'), (req, res) => {
//   const userId = req.session.user?.id;
//   const userRole = req.session.user.role;
//   const ipAddress = req.ip;
//   const { activity_id, full_name, email, phone, batch_year, department, education_level, year_level } = req.body;
//   const paymentSlip = req.file ? `/uploads/payment_slips/${req.file.filename}` : null;

//   const queryActivity = `
//     SELECT department_restriction, check_alumni, max_participants,
//            is_paid_required, price,
//            (SELECT COUNT(*) FROM participants WHERE activity_id = ?) AS current_participants
//     FROM activity WHERE activity_id = ?;
//   `;

//   db.query(queryActivity, [activity_id, activity_id], (err, actRes) => {
//     if (err) return res.status(500).json({ error: 'เกิดข้อผิดพลาดในระบบ' });
//     if (!actRes.length) return res.status(404).json({ success: false, message: 'ไม่พบกิจกรรม' });

//     const activity = actRes[0];

//     // ตรวจสอบจำนวนผู้เข้าร่วม
//     if (activity.max_participants && activity.current_participants >= activity.max_participants) {
//       return res.status(400).json({ success: false, message: 'กิจกรรมนี้มีผู้เข้าร่วมครบแล้ว' });
//     }

//     // ตรวจสอบว่าเป็นกิจกรรมที่ต้องจ่ายเงินหรือไม่
//     let paymentStatus = 'paid';
//     if (activity.is_paid_required) {
//       if (!paymentSlip) {
//         return res.status(400).json({ success: false, message: 'กรุณาอัปโหลดสลิปชำระเงินก่อนเข้าร่วมกิจกรรมนี้' });
//       }
//       paymentStatus = 'pending'; //รอแอดมินตรวจสอบ
//     }

//     // ตรวจสอบว่าลงทะเบียนแล้วหรือยัง
//     const checkSql = `SELECT * FROM participants WHERE user_id = ? AND activity_id = ?;`;
//     db.query(checkSql, [userId, activity_id], (err, existRes) => {
//       if (err) return res.status(500).json({ error: 'เกิดข้อผิดพลาดในระบบ' });
//       if (existRes.length > 0) return res.status(400).json({ success: false, message: 'คุณได้ลงทะเบียนกิจกรรมนี้แล้ว' });

//       const insertSql = `
//         INSERT INTO participants (
//           user_id, activity_id, full_name, email, phone, batch_year, department,
//           education_level, year_level, payment_status, payment_slip, registered_at
//         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW());
//       `;

//       const values = [
//         userId, activity_id, full_name, email, phone,
//         batch_year || null, department || null,
//         education_level || null, year_level || null,
//         paymentStatus, paymentSlip
//       ];

//       db.query(insertSql, values, (err) => {
//         if (err) return res.status(500).json({ error: 'เกิดข้อผิดพลาดในการเพิ่มข้อมูล' });
//          // บันทึก log การเพิ่มกิจกรรม
//         SystemlogAction(
//             userId,
//             'Activity', // moduleName
//             'CREATE',   // actionType
//             `ลงทะเบียนเข้าร่วม: ${activity_name}`, // description
//             ipAddress,
//             activity // relatedId
//         );
//         const msg = activity.is_paid_required
//           ? 'ลงทะเบียนสำเร็จ กรุณารอการตรวจสอบการชำระเงินจากผู้ดูแล'
//           : 'ลงทะเบียนกิจกรรมสำเร็จ!';
//         res.status(200).json({ success: true, message: msg });
//       });
//     });
//   });
// });

// แสดงรายชื่อผู้เข้าร่วมกิจกรรม
router.get('/:activityId/participants', LoggedIn, checkActiveUser, (req, res) => {
  const { activityId } = req.params;

  const queryParticipants = `
      SELECT 
        profiles.user_id,
        participants.full_name,
        participants.email,
        participants.created_at,
        participants.batch_year,
        participants.department,
        activity.activity_name
      FROM participants
      LEFT JOIN profiles ON participants.user_id = profiles.user_id
      LEFT JOIN activity ON participants.activity_id = activity.activity_id
      WHERE participants.activity_id = ?
    `;

  db.query(queryParticipants, [activityId], (err, results) => {
    if (err) {
      console.error('เกิดข้อผิดพลาดในการดึงรายชื่อผู้เข้าร่วมกิจกรรม:', err);
      return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในระบบ' });
    }

    if (results.length === 0) {
      return res.status(200).json({ success: true, participants: [], activity_name: "" });
    }

    const activityName = results[0].activity_name;
    res.status(200).json({ success: true, participants: results, activity_name: activityName });
  });
});

// แสดงประวัติการเข้าร่วมกิจกรรม
router.get('/activity-history/:userId', LoggedIn, checkActiveUser, (req, res) => {

  if (!req.session.user) {
    return res.status(401).json({ success: false, message: 'กรุณาเข้าสู่ระบบ' });
  }

  const userId = req.session.user?.id;

  const queryUserActivity = `
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
        WHEN COALESCE(end_date, activity_date) < CURDATE() THEN 1  -- เสร็จแล้ว (1)
        WHEN activity_date > CURDATE() THEN 0  -- กำลังจะจัดขึ้น (0)
        ELSE 2  -- กำลังดำเนินการ (2)
      END AS status
    FROM participants
    JOIN activity ON participants.activity_id = activity.activity_id
    WHERE participants.user_id = ?
    
  `;

  db.query(queryUserActivity, [userId], (err, results) => {
    if (err) {
      console.error('เกิดข้อผิดพลาดในการดึงประวัติการเข้าร่วมกิจกรรม:', err);
      return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในระบบ' });
    }

    if (results.length === 0) {
      console.log('No results found for user_id:', userId);
      return res.status(404).json({ success: false, message: 'ไม่พบประวัติการเข้าร่วมกิจกรรม' });
    }

    res.status(200).json({ success: true, activity: results });
  });
});

// ตรวจสอบว่าผู้ใช้เข้าร่วมกิจกรรมนี้แล้วหรือยัง
router.get('/check-join/:activityId', (req, res) => {
  const userId = req.session.user?.id;
  const { activityId } = req.params;

  if (!userId || !activityId) {
    return res.status(400).json({ success: false, message: 'ข้อมูลไม่ครบถ้วน' });
  }

  const query = `SELECT * FROM participants WHERE user_id = ? AND activity_id = ? AND status = 1`;
  db.query(query, [userId, activityId], (err, results) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' });
    }

    const joined = results.length > 0;
    return res.status(200).json({ success: true, joined });
  });
});



module.exports = router;
