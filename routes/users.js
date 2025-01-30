var express = require('express');
var router = express.Router();
var db = require('../db');
var { LoggedIn, checkRole } = require('../middlewares/auth');
var bcrypt = require('bcrypt');

router.get('/profile', LoggedIn, (req, res) => {
  // console.log(req.session); 
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
           degree.degree_id,
           alumni.major_id,
           major.major_name
    FROM users
    JOIN profiles ON users.user_id = profiles.user_id
    LEFT JOIN user_degree ON users.user_id = user_degree.user_id
    LEFT JOIN degree ON user_degree.degree_id = degree.degree_id
    LEFT JOIN alumni ON users.user_id = alumni.user_id
    LEFT JOIN major ON alumni.major_id = major.major_id
    WHERE users.user_id = ?
  `;

  db.query(query, [userId], (err, results) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ success: false, message: 'Database error' });
    }

    if (results.length > 0) { //ในตัวแปร results มีข้อมูลหรือไม่
    const userProfile = results[0]; //ดึงข้อมูลของผู้ใช้คนแรกจากผลลัพธ์

// ดึงข้อมูล degree_id ทั้งหมดจากผลลัพธ์
const degrees = results.filter(row => row.degree_id !== null).map(row => row.degree_id);
//filter กรองข้อมูลจาก results เลือกแถวที่ degree_id ไม่เป็น null
//ฟังก์ชัน map จะดึงแค่ค่าของ degree_id จากแถวที่เหลือ
    res.json({
      success: true,
      user: {
        userId: userProfile.user_id,
        fullName: userProfile.full_name,
        nick_name: userProfile.nick_name,
        title: userProfile.title,
        birthday: userProfile.birthday,
        address:userProfile.address,
        phone:userProfile.phone,
        email:userProfile.email,
        line:userProfile.line,
        studentId:userProfile.studentId,
        graduation_year:userProfile.graduation_year,
        profilePicture: `http://localhost:3001/${userProfile.image_path}`,
        role: userProfile.role_id,
        degrees: degrees,
        major: userProfile.major_name,
      },
    });
  } else {
    res.status(404).json({ success: false, message: 'ไม่พบผู้ใช้'});
  }
    
  });
});

router.get('/profile/major', async (req, res) => {
  try {
      const [rows] = await db.promise().query('SELECT major_id, major_name  FROM major');
      if (rows.length === 0) {
          return res.status(404).json({ message: "ไม่มีข้อมูลสาขาในระบบ" });
      }
      res.status(200).json(rows);
  } catch (error) {
      console.error('Error fetching majors:', error);
      res.status(500).json({ message: 'เกิดข้อผิดพลาดในการดึงข้อมูลสาขา' });
  }
});

//ส่วนของการแก้ไขข้อมูลส่วนตัว
router.post('/edit-profile',(req, res) =>{
  console.log('ข้อมูลที่ได้รับจาก Frontend:', req.body);
  const { password, email, full_name, nick_name, title, birthday, address, phone, line,studentId, graduation_year, degree, self_description} = req.body;
  //const userId = req.session.user?.id; 
  const userId = req.session.user.id || null;

  if (!userId) {
    return res.status(400).json({message: "ไมพบไอดีของผู้ใช้งานคนนี้"})
  }

  // อัปเดตข้อมูลผู้ใช้
  let sql = `
  UPDATE profiles 
  SET email=?, full_name=?, nick_name=?, title=?, birthday=?, address=?, phone=?, line=?, studentId=?, graduation_year=?, self_description=?
  WHERE user_id=?`;

  let values = [email,  full_name, nick_name, title, birthday, address, phone, line, studentId, graduation_year, self_description, userId];

  db.query(sql, values, (err) =>{
    if (err) {
      console.error('เกิดข้อผิดพลาด:', err);
      return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการแก้ไขข้อมูลส่วนตัว' });
    }
    
      // // ถ้าผู้ใช้ไม่ได้เปลี่ยนรหัสผ่าน
      // if (!password) {
      //   return res.json({ success: true, message: "แก้ไขข้อมูลส่วนตัวสำเร็จ" });
      // }

    //เปลี่ยนรหัสผ่าน
    if (password) {
      bcrypt.hash(password, 10, (err, hashedPassword) => {
        if (err) {
          console.error('เกิดข้อผิดพลาดในการเข้ารหัสผ่าน:', err);
          return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการแก้ไขรหัสผ่าน' });
        }

        db.query(`UPDATE users SET password=? WHERE user_id=?`, [hashedPassword, userId], (err) =>{
          if (err) {
            console.error('เกิดข้อผิดพลาด:', err);
            return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการแก้ไขรหัสผ่าน' });
          }
        });
      });
    }

    const { major } = req.body;
    const sqlUpdateMajor = `UPDATE alumni SET major_id=? WHERE user_id=?`;
    db.query(sqlUpdateMajor, [major, userId], (err) => {
        if (err) {
            console.error("เกิดข้อผิดพลาดในการอัปเดต major:", err);
            return res.status(500).json({ success: false, message: "เกิดข้อผิดพลาดในการอัปเดต major" });
        }
        return res.json({ success: true, message: "แก้ไขข้อมูลส่วนตัวสำเร็จ" });
    });


    // อัปเดตระดับการศึกษา
  //   db.query(`DELETE FROM user_degree WHERE user_id=?`, [userId], (err) => {
  //     if (err) {
  //         console.error("เกิดข้อผิดพลาด:", err);
  //         return res.status(500).json({ success: false, message: "เกิดข้อผิดพลาดในการอัปเดตระดับการศึกษา" });
  //     }

  //     if (degrees && degrees.length > 0) {
  //         const degreeValues = degrees.map(degree_id => [userId, degree_id]);
  //         db.query(`INSERT INTO user_degree (user_id, degree_id) VALUES ?`, [degreeValues], (err) => {
  //             if (err) {
  //                 console.error("เกิดข้อผิดพลาด:", err);
  //                 return res.status(500).json({ success: false, message: "เกิดข้อผิดพลาดในการเพิ่มระดับการศึกษา" });
  //             }
  //             res.json({ success: true, message: "อัปเดตข้อมูลสำเร็จ" });
  //         });
  //     } else {
  //         res.json({ success: true, message: "อัปเดตข้อมูลสำเร็จ" });
  //     }
  // });
  });
} );

module.exports = router; 
