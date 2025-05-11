var express = require('express');
var router = express.Router();
var db = require('../db');

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
      educations.studentId,
      educations.degree_id,
      major.major_name
    FROM educations
    JOIN profiles ON educations.user_id = profiles.user_id
    JOIN major ON educations.major_id = major.major_id
    WHERE major.major_name = ?
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
    GROUP BY u.user_id
    ORDER BY engagement_score DESC
    LIMIT 6;
  `;
  db.query(queryOutstanding, (err, results) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ message: 'เกิดข้อผิดพลาดในเซิร์ฟเวอร์' });
    }
    res.json(results);
  }); 
});
  
module.exports = router;