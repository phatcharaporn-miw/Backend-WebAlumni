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

  
module.exports = router;