var express = require('express');
var router = express.Router();
var db = require('../db');
var { LoggedIn, checkRole } = require('../middlewares/auth');

router.get('/profile', LoggedIn, (req, res) => {
  console.log(req.session); 
  if (!req.session.user || !req.session.user.id) {
    return res.status(401).json({ success: false, message: 'กรุณาเข้าสู่ระบบ' });
  }

  const userId = req.session.user.id; // รับ ID จาก session

  const query = `
    SELECT users.user_id, 
           users.role_id, 
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
           profiles.studentId,
           profiles.graduation_year,
           degree.degree_id
    FROM users
    JOIN profiles ON users.user_id = profiles.user_id
    LEFT JOIN user_degree ON users.user_id = user_degree.user_id
    LEFT JOIN degree ON user_degree.degree_id = degree.degree_id
    WHERE users.user_id = ?
  `;

  db.query(query, [userId], (err, results) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ success: false, message: 'Database error' });
    }

    if (results.length > 0) {
      const userProfile = results[0];

      // ดึงข้อมูล degree_id ทั้งหมดจากผลลัพธ์
      const degrees = results.filter(row => row.degree_id !== null).map(row => row.degree_id);
      res.json({
        success: true,
        user: {
          userId: userProfile.user_id,
          fullName: userProfile.full_name,
          nick_name: userProfile.nick_name,
          title: userProfile.title,
          birthday: userProfile.birthday,
          address: userProfile.address,
          phone: userProfile.phone,
          email: userProfile.email,
          line: userProfile.line,
          studentId: userProfile.studentId,
          graduation_year: userProfile.graduation_year,
          profilePicture: `http://localhost:3001/${userProfile.image_path}`,
          role: userProfile.role_id,
          degrees: degrees,
        },
      });
    } else {
      res.status(404).json({ success: false, message: 'ไม่พบผู้ใช้' });
    }

    console.log('Database results:', results); 
  });
});

module.exports = router; 