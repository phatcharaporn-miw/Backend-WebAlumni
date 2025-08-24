var express = require('express');
var router = express.Router();
var db = require('../db');
var multer = require('multer');
var path = require('path');
var { LoggedIn, checkActiveUser } = require('../middlewares/auth');
const { logNews }= require('../logUserAction'); 


const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname);
    }
});

const upload = multer({ storage: storage });

//ส่วนของข่าวประชาสัมพันธ์
// เพิ่มข่าว
router.post('/create-news', upload.array('images'), (req, res) => {
  if (!req.session.user || !req.session.user.id) {
    return res.status(401).json({ success: false, message: 'กรุณาเข้าสู่ระบบ' });
  }

  const userId = req.session.user.id; 
  const { title, content } = req.body; 
  const imagePaths = req.files.map(file => `/uploads/${file.filename}`); 

  const queryInsertNews = `
    INSERT INTO news (
      user_id, title, content
    ) VALUES (?, ?, ?);
  `;

  const values = [userId, title, content];

  db.query(queryInsertNews, values, (err, results) => {
    if (err) {
      console.error('เกิดข้อผิดพลาดในการเพิ่มข่าวประชาสัมพันธ์:', err);
      return res.status(500).json({ error: 'เกิดข้อผิดพลาดในระบบ' });
    }

    const newsId = results.insertId;

    // เช็กก่อน insert รูปภาพ
    if (imagePaths.length === 0) {
      return res.status(200).json({ message: 'เพิ่มข่าวประชาสัมพันธ์เรียบร้อย (ไม่มีรูป)' });
    }

    // บันทึกภาพลง news_image
    const imageInsertQuery = `
      INSERT INTO news_image (news_id, image_path)
      VALUES ?
    `;
    const imageData = imagePaths.map(path => [newsId, path]);

    db.query(imageInsertQuery, [imageData], (imgErr) => {
      if (imgErr) {
        console.error('บันทึกรูปล้มเหลว:', imgErr);
        return res.status(500).json({ message: 'ข่าวประชาสัมพันธ์ถูกเพิ่ม แต่บันทึกรูปไม่สำเร็จ' });
      }

      logNews(userId, newsId, 'เพิ่มข่าวประชาสัมพันธ์');
      res.status(200).json({ message: 'เพิ่มข่าวประชาสัมพันธ์เรียบร้อยแล้ว!' });
    });
  });
});


//ดึงข่าวทั้งหมด
router.get('/news-all',(req, res) => {
  
    const queryNews = `
    SELECT 
      news.news_id,
      news.title, 
      (
        SELECT news_image.image_path 
        FROM news_image 
        WHERE news_image.news_id = news.news_id 
        LIMIT 1
      ) AS image_path,
      news.content,
      news.created_at,
      users.user_id,
      role.role_name AS role_posted
    FROM news
    JOIN users ON news.user_id = users.user_id
    JOIN role ON users.role_id = role.role_id
    WHERE news.deleted_at IS NULL
    ORDER BY news.created_at DESC
    `;

    db.query(queryNews, (err, results) => {
      if (err) {
        console.error('เกิดข้อผิดพลาดในการดึงข้อมูล:', err);
        return res.status(500).json({ success: false, message: 'Database error' });
      }
     
      res.json({ success: true, data: results,  });
    });
});

// แสดงข่าวตามไอดี
router.get('/news-id/:newsId', (req, res) => {
  const { newsId } = req.params;

  // ดึงข่าวหลัก
  const queryNews = `
    SELECT 
      news.news_id, 
      news.title, 
      news.content, 
      news.created_at, 
      users.user_id, 
      profiles.full_name AS role_posted
    FROM news
    JOIN users ON news.user_id = users.user_id
    JOIN profiles ON profiles.user_id = users.user_id
    WHERE news.news_id = ?
  `;

  // ดึงภาพทั้งหมดของข่าวนี้
  const queryImages = `
    SELECT image_path FROM news_image WHERE news_id = ?
  `;

  db.query(queryNews, [newsId], (err, newsResults) => {
    if (err) {
      console.error('เกิดข้อผิดพลาดในการดึงข่าว:', err);
      return res.status(500).json({ success: false, message: 'Database error' });
    }

    if (newsResults.length === 0) {
      return res.status(404).json({ success: false, message: 'ไม่พบข่าว' });
    }

    const newsData = newsResults[0];

    db.query(queryImages, [newsId], (err2, imageResults) => {
      if (err2) {
        console.error('เกิดข้อผิดพลาดในการดึงภาพข่าว:', err2);
        return res.status(500).json({ success: false, message: 'Database error' });
      }

      const images = imageResults.map(img => img.image_path);

      res.json({
        success: true,
        data: {
          ...newsData,
          images,
        },
        newsTitle: newsData.title 
      });
    });
  });
});



// แก้ไขข่าวประชาสัมพันธ์
router.put('/edit-news/:newsId', LoggedIn, checkActiveUser, upload.array('images'), (req, res) => {
    const { newsId } = req.params;
    const userId = req.session.user.id;

    if (!req.session.user || !req.session.user.id) {
        return res.status(401).json({ success: false, message: 'กรุณาเข้าสู่ระบบ' });
    }

    const { title, content } = req.body;
    const imagePaths = req.files.map(file => `/uploads/${file.filename}`); 

    // อัปเดตข้อมูลข่าวในตาราง `news`
    const queryUpdateNews = `
        UPDATE news
        SET 
            title = ?,
            content = ?,
            updated_at = NOW()
        WHERE news_id = ?
    `;

    const values = [title, content, newsId];

    db.query(queryUpdateNews, values, (err, results) => {
        if (err) {
            console.error('เกิดข้อผิดพลาดในการแก้ไขข่าวประชาสัมพันธ์:', err);
            return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในระบบ' });
        }

        if (results.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'ไม่พบข่าวประชาสัมพันธ์ที่ต้องการแก้ไข' });
        }

        if (imagePaths.length === 0) {
            // หากไม่มีรูปภาพใหม่
            logNews(userId, newsId, 'แก้ไขข่าวประชาสัมพันธ์');
            return res.status(200).json({ success: true, message: 'แก้ไขข่าวประชาสัมพันธ์เรียบร้อย (ไม่มีรูปใหม่)' });
        }

        // ลบรูปภาพเดิมในตาราง `news_image`
        const deleteOldImages = `DELETE FROM news_image WHERE news_id = ?`;
        db.query(deleteOldImages, [newsId], (deleteErr) => {
            if (deleteErr) {
                console.error('ลบรูปภาพเดิมล้มเหลว:', deleteErr);
                return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการลบรูปภาพเดิม' });
            }

            // เพิ่มรูปภาพใหม่ในตาราง `news_image`
            const insertNewImages = `
                INSERT INTO news_image (news_id, image_path)
                VALUES ?
            `;
            const imageData = imagePaths.map(path => [newsId, path]);

            db.query(insertNewImages, [imageData], (insertErr) => {
                if (insertErr) {
                    console.error('เพิ่มรูปภาพใหม่ล้มเหลว:', insertErr);
                    return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการเพิ่มรูปภาพใหม่' });
                }

                logNews(userId, newsId, 'แก้ไขข่าวประชาสัมพันธ์และอัปเดตรูปภาพ');
                res.status(200).json({ success: true, message: 'แก้ไขข่าวประชาสัมพันธ์และรูปภาพเรียบร้อยแล้ว!' });
            });
        });
    });
});


// ลบข่าวประชาสัมพันธ์แบบ Soft Delete
router.delete('/delete-news/:newsId', LoggedIn, checkActiveUser, (req, res) => {
  const { newsId } = req.params;

  if (!req.session.user || !req.session.user.id) {
      return res.status(401).json({ success: false, message: 'กรุณาเข้าสู่ระบบ' });
  }

  const userId = req.session.user.id;

  const querySoftDeleteNews = `
      UPDATE news
      SET deleted_at = NOW()
      WHERE news_id = ? 
  `;

  db.query(querySoftDeleteNews, [newsId, userId], (err, results) => {
      if (err) {
          console.error('เกิดข้อผิดพลาดในการลบข่าวประชาสัมพันธ์:', err);
          return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในระบบ' });
      }

      if (results.affectedRows === 0) {
          return res.status(404).json({ success: false, message: 'ไม่พบข่าวประชาสัมพันธ์ที่ต้องการลบ' });
      }

      logNews(userId, newsId, 'ลบข่าวประชาสัมพันธ์');

      res.status(200).json({ success: true, message: 'ลบข่าวประชาสัมพันธ์เรียบร้อยแล้ว!' });
  });
});

// ดึงข่าวที่เกี่ยวข้องแบบสุ่ม 4 ข่าว
router.get('/related-news/:newsId', (req, res) => {
  const { newsId } = req.params;

  const queryRelatedNews = `
    SELECT 
      news.news_id,
      news.title, 
      (
        SELECT news_image.image_path 
        FROM news_image 
        WHERE news_image.news_id = news.news_id 
        LIMIT 1
      ) AS image_path,
      news.content,
      news.created_at,
      users.user_id,
      role.role_name AS role_posted
    FROM news
    JOIN users ON news.user_id = users.user_id
    JOIN role ON users.role_id = role.role_id
    WHERE news.deleted_at IS NULL AND news.news_id != ?
    ORDER BY RAND()
    LIMIT 3
  `;

  db.query(queryRelatedNews, [newsId], (err, results) => {
    if (err) {
      console.error('เกิดข้อผิดพลาดในการดึงข่าวที่เกี่ยวข้อง:', err);
      return res.status(500).json({ success: false, message: 'Database error' });
    }

    res.json({ success: true, data: results });
  });
});

module.exports = router;