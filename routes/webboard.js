var express = require('express');
var router = express.Router();
var db = require('../db');
var multer = require('multer');
var path = require('path');
var { LoggedIn, checkActiveUser } = require('../middlewares/auth');
const { logWebboard } = require('../logUserAction');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  }
});

const upload = multer({ storage: storage });

const bannedWords = ["ควย", "คำหยาบ"];

// สร้างกระทู้
router.post('/create-post', upload.single("image"), (req, res) => {
  const { title, category_id, content, startDate } = req.body;
  const userId = req.session.user?.id;

  // ตรวจสอบคำต้องห้าม
  const regex = new RegExp(bannedWords.join("|"), "i"); // ใช้ RegExp เพื่อตรวจสอบคำต้องห้ามไม่สนใจตัวพิมพ์เล็ก-ใหญ่
  if (regex.test(content)) {
    const bannedWord = bannedWords.find(word => content.includes(word));
    return res.status(400).json({ error: `เนื้อหาของกระทู้มีคำที่ต้องห้าม: ${bannedWord}` });
  }


  const imagePath = req.file ? `/uploads/${req.file.filename}` : null;

  const queryCreate = `
    INSERT INTO webboard (user_id, category_id, title, content, created_at, image_path)
    VALUES (?, ?, ?, ?, ?, ?)
  `;

  db.query(queryCreate, [userId, category_id, title, content, startDate, imagePath], (err, results) => {
    if (err) {
      console.error("เกิดข้อผิดพลาดในการสร้างกระทู้:", err);
      return res.status(500).json({ success: false, message: "Database error" });
    }

    const webboardId = results.insertId;
    logWebboard(userId, webboardId, 'สร้างกระทู้');

    console.log("กระทู้ถูกสร้างสำเร็จ, webboard_id:", webboardId);
    res.status(200).json({ success: true, message: "กระทู้ถูกสร้างเรียบร้อย", webboard_id: results.insertId });
  });
})

//ดึงกระทู้ทั้งหมด
router.get('/webboard', (req, res) => {
  const query = `
    SELECT 
      wb.webboard_id,
      u.user_id,
      p.full_name,
      p.image_path AS profile_image,
      c.category_id,
      c.category_name,
      wb.title, 
      wb.image_path,
      wb.content,
      wb.viewCount,
      wb.favorite,
      wb.created_at,
      wb.sort_order,
      (SELECT COUNT(*) FROM comment WHERE comment.webboard_id = wb.webboard_id) AS comments_count,
      (SELECT COUNT(*) FROM favorite f WHERE f.webboard_id = wb.webboard_id AND f.status = 1) AS like_count,
      (
        SELECT GROUP_CONCAT(pr.full_name SEPARATOR ', ')
        FROM favorite f
        JOIN users us ON f.user_id = us.user_id
        JOIN profiles pr ON us.user_id = pr.user_id
        WHERE f.webboard_id = wb.webboard_id AND f.status = 1
      ) AS liked_users
    FROM webboard wb
    LEFT JOIN users u ON wb.user_id = u.user_id
    LEFT JOIN profiles p ON u.user_id = p.user_id
    LEFT JOIN category c ON wb.category_id = c.category_id
    WHERE wb.deleted_at IS NULL
    ORDER BY wb.created_at DESC
  `;

  db.query(query, (err, results) => {
    if (err) {
      console.error('เกิดข้อผิดพลาดในการดึงข้อมูล:', err);
      return res.status(500).json({ success: false, message: 'Database error' });
    }

    const formattedResults = results.map(post => ({
      ...post,
      liked_users: post.liked_users || ""
    }));

    res.json({ success: true, data: formattedResults });
  });
});

// แสดงกระทู้ตามไอดี
router.get('/webboard/:id', (req, res) => {
  const postId = req.params.id;

  // อัปเดต ViewCount
  const queryUpdate = 'UPDATE webboard SET viewCount = viewCount + 1 WHERE webboard_id = ?';
  db.query(queryUpdate, [postId], (err) => {
    if (err) {
      console.error('เกิดข้อผิดพลาดในการอัปเดต ViewCount:', err);
      return res.status(500).json({ success: false, message: 'Database error' });
    }

    // ดึงข้อมูลกระทู้
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
          WHERE webboard.webboard_id = ?
      `;

    db.query(queryPost, [postId], (err, results) => {
      if (err) {
        console.error('เกิดข้อผิดพลาดในการดึงข้อมูลกระทู้:', err);
        return res.status(500).json({ success: false, message: 'Database error' });
      }

      if (results.length === 0) {
        return res.status(404).json({ success: false, message: 'ไม่พบกระทู้' });
      }

      const post = results[0];

      // ดึงความคิดเห็น
      const queryComment = `
              SELECT 
                  comment.comment_id,
                  comment.comment_detail,
                  comment.created_at,
                  users.user_id,
                  profiles.full_name,
                  profiles.image_path AS profile_image
              FROM comment
              LEFT JOIN users ON comment.user_id = users.user_id
              LEFT JOIN profiles ON users.user_id = profiles.user_id
              WHERE comment.webboard_id = ?
          `;

      db.query(queryComment, [postId], (err, commentResults) => {
        if (err) {
          console.error('เกิดข้อผิดพลาดในการดึงคอมเมนต์:', err);
          return res.status(500).json({ success: false, message: 'Database error' });
        }

        // ดึง replies (ตอบกลับความคิดเห็น)
        const commentIds = commentResults.map(comment => comment.comment_id);

        if (commentIds.length === 0) {
          post.comments = [];
          return res.status(200).json({ success: true, data: post });
        }

        const queryReplies = `
                  SELECT 
                      replies.reply_id,
                      replies.comment_id,
                      replies.user_id, 
                      replies.reply_detail,
                      replies.created_at,
                      profiles.full_name,
                      profiles.image_path AS profile_image
                  FROM replies
                  JOIN profiles ON replies.user_id = profiles.user_id
                  WHERE replies.comment_id IN (?)
              `;

        db.query(queryReplies, [commentIds], (err, replyResults) => {
          if (err) {
            console.error('เกิดข้อผิดพลาดในการดึง replies:', err);
            return res.status(500).json({ success: false, message: 'Database error' });
          }

          // รวม replies เข้าไปใน comments
          const commentMap = {};
          commentResults.forEach(comment => {
            commentMap[comment.comment_id] = { ...comment, replies: [] };
          });

          replyResults.forEach(reply => {
            if (commentMap[reply.comment_id]) {
              commentMap[reply.comment_id].replies.push(reply);
            }
          });

          post.comments = Object.values(commentMap);

          return res.status(200).json({ success: true, data: post });
        });
      });
    });
  });
});

// ลบกระทู้
router.delete('/webboard/:id', (req, res) => {
  const postId = req.params.id;
  const userId = req.session.user?.id;

  if (!userId) {
    return res.status(401).json({ success: false, message: 'กรุณาเข้าสู่ระบบ' });
  }

  // ตรวจสอบสิทธิ์ก่อนลบ
  const queryCheckOwner = `SELECT user_id FROM webboard WHERE webboard_id = ? AND deleted_at IS NULL`;
  db.query(queryCheckOwner, [postId], (err, results) => {
    if (err) {
      console.error('เกิดข้อผิดพลาดในการตรวจสอบเจ้าของกระทู้:', err);
      return res.status(500).json({ success: false, message: 'Database error' });
    }

    if (results.length === 0 || results[0].user_id !== userId) {
      return res.status(403).json({ success: false, message: 'คุณไม่มีสิทธิ์ลบกระทู้นี้' });
    }

    const queryDelete = `
      UPDATE webboard 
      SET deleted_at = NOW() 
      WHERE webboard_id = ? AND user_id = ?
    `;

    db.query(queryDelete, [postId, userId], (err, results) => {
      if (err) {
        console.error('เกิดข้อผิดพลาดในการลบกระทู้:', err);
        return res.status(500).json({ success: false, message: 'Database error' });
      }

      if (results.affectedRows === 0) {
        return res.status(404).json({ success: false, message: 'ไม่พบกระทู้หรือคุณไม่มีสิทธิ์ลบกระทู้นี้' });
      }

      // บันทึก log หลังลบสำเร็จ
      logWebboard(userId, postId, 'ลบกระทู้');

      res.status(200).json({ success: true, message: 'ลบกระทู้เรียบร้อยแล้ว' });
    });
  });
});

// ดึงกระทู้ที่แนะนำ
router.get('/webboard/recommended-posts', (req, res) => {
  const queryRecommendedPosts = `
      SELECT 
          webboard.webboard_id,
          webboard.title,
          webboard.content,
          webboard.image_path,
          webboard.viewCount,
          webboard.favorite,
          webboard.created_at,
          (SELECT COUNT(*) FROM comment WHERE comment.webboard_id = webboard.webboard_id) AS comments_count
      FROM webboard
      WHERE webboard.deleted_at IS NULL
      ORDER BY favorite DESC,  viewCount DESC, created_at DESC
      LIMIT 5;
  `;

  db.query(queryRecommendedPosts, (err, results) => {
    if (err) {
      console.error('เกิดข้อผิดพลาดในการดึงกระทู้ที่แนะนำ:', err);
      return res.status(500).json({ success: false, message: 'Database error' });
    }

    if (results.length === 0) {
      return res.status(200).json({ success: true, recommendedPosts: [] });
    }

    res.status(200).json({ success: true, recommendedPosts: results });
  });
});

// เพิ่มคอมเมนต์
router.post('/webboard/:id/comment', LoggedIn, checkActiveUser, (req, res) => {
  const postId = req.params.id;
  const { comment_detail } = req.body;

  if (!req.session || !req.session.user || !req.session.user.id) {
    return res.status(401).json({ success: false, message: 'กรุณาเข้าสู่ระบบ' });
  }

  const userId = req.session.user.id;

  // ดึง user_id ของเจ้าของกระทู้
  const queryGetPostOwner = `SELECT user_id FROM webboard WHERE webboard_id = ?`;

  db.query(queryGetPostOwner, [postId], (err, postResults) => {
    if (err) {
      console.error('Error fetching post owner:', err);
      return res.status(500).json({ success: false, message: 'Database error' });
    }

    if (postResults.length === 0) {
      return res.status(404).json({ success: false, message: 'ไม่พบกระทู้' });
    }

    const postOwnerId = postResults[0].user_id;

    // เพิ่มคอมเมนต์ในตาราง comment
    const queryInsertComment = `
            INSERT INTO comment (webboard_id, user_id, comment_detail, created_at)
            VALUES (?, ?, ?, NOW())
        `;

    db.query(queryInsertComment, [postId, userId, comment_detail], (err, results) => {
      if (err) {
        console.error('Error inserting comment:', err);
        return res.status(500).json({ success: false, message: 'Database error' });
      }

      const commentId = results.insertId;

      // เพิ่มการแจ้งเตือนสำหรับเจ้าของกระทู้
      const queryNotification = `
                INSERT INTO notifications (user_id, type, message, related_id, status, send_date)
                VALUES (?, 'comment', ?, ?, 'ยังไม่อ่าน', NOW())
                ON DUPLICATE KEY UPDATE 
            message = VALUES(message),
            send_date = NOW(),
            status = 'ยังไม่อ่าน';
            `;
      const message = `ผู้ใช้ ${req.session.user.full_name} แสดงความคิดเห็นในโพสต์ของคุณ`;

      db.query(queryNotification, [postOwnerId, message, postId], (err) => {
        if (err) {
          console.error('Error creating notification:', err);
          return res.status(500).json({ success: false, message: 'Database error' });
        }

        // ส่งข้อมูลคอมเมนต์กลับไปยังผู้ใช้
        const queryGetComment = `
                    SELECT 
                        comment.comment_id,
                        comment.user_id, -- เพิ่ม user_id
                        comment.comment_detail,
                        comment.created_at,
                        profiles.full_name,
                        profiles.image_path AS profile_image
                    FROM comment
                    JOIN profiles ON comment.user_id = profiles.user_id
                    WHERE comment.comment_id = ?
                `;

        db.query(queryGetComment, [commentId], (err, commentResults) => {
          if (err) {
            console.error('Error fetching comment:', err);
            return res.status(500).json({ success: false, message: 'Database error' });
          }

          logWebboard(userId, postId, 'แสดงความคิดเห็น');

          res.status(200).json({ success: true, comment: commentResults[0] });
        });
      });
    });
  });
});

// ตอบกลับความคิดเห็น
router.post('/webboard/:webboardId/comment/:commentId/reply', LoggedIn, checkActiveUser, (req, res) => {
  const { commentId } = req.params;
  const { reply_detail } = req.body;
  const userId = req.session.user.id;

  if (!reply_detail.trim()) {
    return res.status(400).json({ success: false, message: 'กรุณากรอกข้อความตอบกลับ' });
  }

  const queryInsertReply = `
      INSERT INTO replies (comment_id, user_id, reply_detail, created_at)
      VALUES (?, ?, ?, NOW())
    `;

  db.query(queryInsertReply, [commentId, userId, reply_detail], (err, results) => {
    if (err) {
      console.error('เกิดข้อผิดพลาดในการเพิ่มการตอบกลับ:', err);
      return res.status(500).json({ success: false, message: 'Database error' });
    }

    const replyId = results.insertId;

    const queryGetReply = `
        SELECT 
          replies.reply_id,
          replies.user_id,
          replies.reply_detail,
          replies.created_at,
          profiles.full_name,
          profiles.image_path AS profile_image
        FROM replies
        JOIN profiles ON replies.user_id = profiles.user_id
        WHERE replies.reply_id = ?
      `;

    db.query(queryGetReply, [replyId], (err, replyResults) => {
      if (err) {
        console.error('เกิดข้อผิดพลาดในการดึงข้อมูลการตอบกลับ:', err);
        return res.status(500).json({ success: false, message: 'Database error' });
      }

      if (replyResults.length === 0) {
        console.error('ไม่พบข้อมูลการตอบกลับในฐานข้อมูล');
        return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลการตอบกลับ' });
      }

      // บันทึก log การตอบกลับ
      logWebboard(userId, commentId, 'ตอบกลับความคิดเห็น');
      
      return res.status(200).json(replyResults[0]);
    });
  });
});

// ลบการแสดงความคิดเห็น
router.delete('/webboard/:webboardId/comment/:commentId', LoggedIn, checkActiveUser, (req, res) => {
  const { commentId } = req.params;
  const userId = req.session.user?.id;

  const queryDeleteComment = 'DELETE FROM comment WHERE comment_id = ?';
  db.query(queryDeleteComment, [commentId, userId], (err, result) => {
    if (err) {
      console.error('เกิดข้อผิดพลาดในการลบ comment:', err);
      return res.status(500).json({ success: false });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'ไม่พบความคิดเห็นนี้' });
    }

    logWebboard(userId, commentId, 'ลบความคิดเห็น');

    res.json({ success: true, message: 'ลบสำเร็จ' });
  });
});

// ลบการตอบกลับ
router.delete('/webboard/:webboardId/comment/:commentId/reply/:replyId', LoggedIn, checkActiveUser, (req, res) => {
  const { commentId, replyId } = req.params;
  const userId = req.session.user?.id;


  // ดึง webboard_id จาก commentId
  const getWebboardIdQuery = `SELECT webboard_id FROM comment WHERE comment_id = ?`;

  db.query(getWebboardIdQuery, [commentId], (err, rows) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ success: false, message: 'Database error' });
    }
    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'ไม่พบคอมเมนต์' });
    }

    const webboardId = rows[0].webboard_id;

    // ลบ reply
    const deleteQuery = `
    DELETE FROM replies 
    WHERE reply_id = ? AND comment_id = ? AND user_id = ?
  `;

    db.query(deleteQuery, [replyId, commentId, userId], (err, result) => {
      if (err) {
        console.error('เกิดข้อผิดพลาดในการลบ reply:', err);
        return res.status(500).json({ success: false, message: 'Database error' });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({ success: false, message: 'ไม่พบการตอบกลับนี้' });
      }

      // บันทึก log 
      logWebboard(userId, webboardId, 'ลบการตอบกลับ comment');

      res.json({ success: true, message: 'ลบการตอบกลับเรียบร้อยแล้ว' });
    });
  });
});


//กดใจกระทู้ และแจ้งเตือน
// router.post('/webboard/:postId/favorite', LoggedIn, checkActiveUser, (req, res) => {
//   const { postId } = req.params;
//   const userId = req.session.user?.id;

//   // ดึง full_name ของผู้ที่กดไลก์จากฐานข้อมูล
//   const queryGetUser = `
//       SELECT p.full_name, l.username, r.role_name 
//       FROM profiles p
//       JOIN users u ON u.user_id = p.user_id
//       JOIN role r ON u.role_id = r.role_id
//       LEFT JOIN login l ON l.user_id = u.user_id 
//       WHERE p.user_id = ?
//     `;

//   db.query(queryGetUser, [userId], (err, userResults) => {
//     if (err) {
//       console.error('Error fetching user full_name:', err);
//       return res.status(500).json({ success: false, message: 'Database error' });
//     }

//     if (userResults.length === 0) {
//       return res.status(404).json({ success: false, message: 'ไม่พบผู้ใช้' });
//     }

//     const userRole = userResults[0].role;  // role ของผู้ใช้
//     let likedBy;

//     // ดึง user_id ของเจ้าของกระทู้
//     const queryGetPostOwner = `SELECT user_id FROM webboard WHERE webboard_id = ?`;

//     db.query(queryGetPostOwner, [postId], (err, postResults) => {
//       if (err) {
//         console.error('Error fetching post owner:', err);
//         return res.status(500).json({ success: false, message: 'Database error' });
//       }

//       if (postResults.length === 0) {
//         return res.status(404).json({ success: false, message: 'ไม่พบกระทู้' });
//       }

//       const postOwnerId = postResults[0].user_id;

//       // ตรวจสอบว่าผู้ใช้กดไลก์โพสต์นี้แล้วหรือยัง
//       const queryCheck = `SELECT status FROM favorite WHERE user_id = ? AND webboard_id = ?`;

//       db.query(queryCheck, [userId, postId], (err, results) => {
//         if (err) {
//           console.error('Error checking favorite:', err);
//           return res.status(500).json({ success: false, message: 'Database error' });
//         }

//         if (results.length > 0) {
//           const currentStatus = results[0].status;
//           const newStatus = currentStatus === 1 ? 0 : 1;

//           const queryUpdate = `UPDATE favorite SET status = ?, updated_at = NOW() WHERE user_id = ? AND webboard_id = ?`;
//           db.query(queryUpdate, [newStatus, userId, postId], (err) => {
//             if (err) {
//               console.error('Error updating favorite:', err);
//               return res.status(500).json({ success: false, message: 'Database error' });
//             }

//             res.json({ success: true, message: newStatus === 1 ? 'เพิ่มลงในรายการถูกใจ' : 'ลบออกจากรายการถูกใจ', status: newStatus });
//           });
//         } else {
//           const queryInsert = `INSERT INTO favorite (user_id, webboard_id, liked_by, status, created_at, updated_at) VALUES (?, ?, ?, 1, NOW(), NOW())`;

//           db.query(queryInsert, [userId, postId, likedBy], (err) => {
//             if (err) {
//               console.error('Error inserting favorite:', err);
//               return res.status(500).json({ success: false, message: 'Database error' });
//             }

//             // เพิ่มการแจ้งเตือน
//             const queryNotification = `
//                             INSERT INTO notifications (user_id, type, message, related_id, status, send_date)
//                             VALUES (?, 'like', ?, ?, 'ยังไม่อ่าน', NOW())
//                             ON DUPLICATE KEY UPDATE 
//                             message = VALUES(message),
//                             send_date = NOW(),
//                             status = 'ยังไม่อ่าน';
//                         `;
//             const message = `${likedBy} ถูกใจโพสต์ของคุณ`;

//             db.query(queryNotification, [postOwnerId, message, postId], (err) => {
//               if (err) {
//                 console.error('Error creating notification:', err);
//                 return res.status(500).json({ success: false, message: 'Database error' });
//               }

//               logWebboard(userId, postId, 'กดถูกใจกระทู้');
              
//               res.json({ success: true, message: 'เพิ่มลงในรายการถูกใจและสร้างการแจ้งเตือนสำเร็จ', status: 1 });
//             });
//           });
//         }
//       });
//     });
//   });
// });

router.post('/webboard/:postId/favorite', LoggedIn, checkActiveUser, (req, res) => {
  const { postId } = req.params;
  const userId = req.session.user?.id;

  // ดึง full_name ของผู้ที่กดไลก์จากฐานข้อมูล
  const queryGetUser = `
    SELECT p.full_name, l.username, r.role_name 
    FROM profiles p
    JOIN users u ON u.user_id = p.user_id
    JOIN role r ON u.role_id = r.role_id
    LEFT JOIN login l ON l.user_id = u.user_id 
    WHERE p.user_id = ?
  `;

  db.query(queryGetUser, [userId], (err, userResults) => {
    if (err) {
      console.error('Error fetching user full_name:', err);
      return res.status(500).json({ success: false, message: 'Database error' });
    }

    if (userResults.length === 0) {
      return res.status(404).json({ success: false, message: 'ไม่พบผู้ใช้' });
    }

    const likedBy = userResults[0].full_name; 
    const userRole = userResults[0].role_name;

    // ดึง user_id ของเจ้าของกระทู้
    const queryGetPostOwner = `SELECT user_id FROM webboard WHERE webboard_id = ?`;

    db.query(queryGetPostOwner, [postId], (err, postResults) => {
      if (err) {
        console.error('Error fetching post owner:', err);
        return res.status(500).json({ success: false, message: 'Database error' });
      }

      if (postResults.length === 0) {
        return res.status(404).json({ success: false, message: 'ไม่พบกระทู้' });
      }

      const postOwnerId = postResults[0].user_id;

      // ตรวจสอบว่าผู้ใช้กดไลก์โพสต์นี้แล้วหรือยัง
      const queryCheck = `SELECT status FROM favorite WHERE user_id = ? AND webboard_id = ?`;

      db.query(queryCheck, [userId, postId], (err, results) => {
        if (err) {
          console.error('Error checking favorite:', err);
          return res.status(500).json({ success: false, message: 'Database error' });
        }

        if (results.length > 0) {
          const currentStatus = results[0].status;
          const newStatus = currentStatus === 1 ? 0 : 1;

          const queryUpdate = `UPDATE favorite SET status = ?, updated_at = NOW() WHERE user_id = ? AND webboard_id = ?`;
          db.query(queryUpdate, [newStatus, userId, postId], (err) => {
            if (err) {
              console.error('Error updating favorite:', err);
              return res.status(500).json({ success: false, message: 'Database error' });
            }

            res.json({ success: true, message: newStatus === 1 ? 'เพิ่มลงในรายการถูกใจ' : 'ลบออกจากรายการถูกใจ', status: newStatus });
          });
        } else {
          const queryInsert = `
            INSERT INTO favorite (user_id, webboard_id, liked_by, status, created_at, updated_at)
            VALUES (?, ?, ?, 1, NOW(), NOW())
          `;

          db.query(queryInsert, [userId, postId, likedBy], (err) => {
            if (err) {
              console.error('Error inserting favorite:', err);
              return res.status(500).json({ success: false, message: 'Database error' });
            }

            // เพิ่มการแจ้งเตือน
            const message = `${likedBy} ถูกใจโพสต์ของคุณ`;
            const queryNotification = `
              INSERT INTO notifications (user_id, type, message, related_id, status, send_date)
              VALUES (?, 'like', ?, ?, 'ยังไม่อ่าน', NOW())
              ON DUPLICATE KEY UPDATE 
                message = VALUES(message),
                send_date = NOW(),
                status = 'ยังไม่อ่าน';
            `;

            db.query(queryNotification, [postOwnerId, message, postId], (err) => {
              if (err) {
                console.error('Error creating notification:', err);
                return res.status(500).json({ success: false, message: 'Database error' });
              }

              logWebboard(userId, postId, 'กดถูกใจกระทู้');
              res.json({ success: true, message: 'เพิ่มลงในรายการถูกใจและสร้างการแจ้งเตือนสำเร็จ', status: 1 });
            });
          });
        }
      });
    });
  });
});


//ดึงข้อมูล favorite จากการกดใจของ user
router.get('/favorite', LoggedIn, checkActiveUser, (req, res) => {
  const userId = req.query.userId || req.session.user?.user_id;

  if (!userId) {
    return res.status(401).json({ success: false, message: 'กรุณาเข้าสู่ระบบ' });
  }

  const queryFavorite = `
      SELECT 
      webboard.webboard_id,
      webboard.title,
      webboard.content,
      webboard.image_path,
      webboard.viewCount,
      webboard.favorite,
      webboard.created_at
    FROM favorite
    JOIN webboard ON favorite.webboard_id = webboard.webboard_id
    WHERE favorite.user_id = ? AND favorite.status = 1;
    `;

  db.query(queryFavorite, [userId], (err, results) => {
    if (err) {
      console.error("เกิดข้อผิดพลาดในการดึงโพสต์ที่ถูกใจ:", err);
      return res.status(500).json({ success: false, message: 'Database error' });
    }

    // console.log('Favorite posts:', results);

    if (results.length === 0) {
      return res.json({ success: false, message: 'ไม่พบกระทู้' });
    }

    res.json({ success: true, likedPosts: results });
  });
});

// กรองกระทู้ตามหมวดหมู่
router.get('/webboard/category/:categoryId', (req, res) => {
  const { categoryId } = req.params;

  if (!categoryId) {
    return res.status(400).json({ success: false, message: "categoryId ไม่ถูกต้อง" });
  }

  // console.log("categoryId ที่ได้รับ:", categoryId);

  // ดึงชื่อหมวดหมู่ก่อน
  const queryCategory = `SELECT category_name FROM category WHERE category_id = ?`;

  db.query(queryCategory, [categoryId], (err, results) => {
    if (err) {
      console.error('เกิดข้อผิดพลาดในการดึงหมวดหมู่:', err);
      return res.status(500).json({ success: false, message: 'Database error while fetching category' });
    }

    if (results.length === 0) {
      return res.status(404).json({ success: false, message: `ไม่พบหมวดหมู่ที่มี categoryId: ${categoryId}` });
    }

    const categoryName = results[0].category_name;

    // ดึงข้อมูลกระทู้ที่ตรงกับ category_id
    const queryCategoryId = `
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
        WHERE webboard.category_id = ? AND webboard.deleted_at IS NULL;
      `;

    db.query(queryCategoryId, [categoryId], (err, results) => {
      if (err) {
        console.error('เกิดข้อผิดพลาดในการดึงข้อมูลกระทู้:', err);
        return res.status(500).json({ success: false, message: 'Database error while fetching threads' });
      }

      if (results.length === 0) {
        return res.status(404).json({ success: false, message: 'ไม่พบกระทู้ในหมวดหมู่นี้' });
      }

      // ส่งข้อมูลกลับให้ Frontend รวมถึงชื่อหมวดหมู่
      return res.status(200).json({
        success: true,
        categoryName: categoryName,
        data: results
      });
    });
  });
});


module.exports = router;