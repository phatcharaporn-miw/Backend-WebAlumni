var express = require('express');
var router = express.Router();
var db = require('../db');


// ดึงแจ้งเตือนของผู้ใช้
router.get('/notification/:userId', (req, res) => {
    const { userId } = req.params;

    const query = `
        SELECT 
            notification_id,
            user_id,
            type,
            related_id,
            message,
            send_date,
            status,
            deleted_at
        FROM notifications 
        WHERE user_id = ? AND deleted_at IS NULL
        ORDER BY send_date DESC
    `;

    db.query(query, [userId], (err, results) => {
        if (err) {
            console.error('ดึงการแจ้งเตือนล้มเหลว:', err);
            return res.status(500).json({ success: false, message: 'Database error' });
        }

        res.json({ success: true, data: results });
    });
});

router.post('/add-notification', (req, res) => {
  const { user_id, type, message, related_id } = req.body;
  const send_date = new Date();

  // ตรวจสอบว่ามีแจ้งเตือนเดิมที่ type + message + related_id เดียวกันไหม
  const checkQuery = `
    SELECT notification_id 
    FROM notifications 
    WHERE user_id = ? 
      AND type = ? 
      AND message = ? 
      AND (related_id = ? OR ? IS NULL) 
      AND deleted_at IS NULL
    ORDER BY send_date DESC 
    LIMIT 1
  `;

  db.query(checkQuery, [user_id, type, message, related_id, related_id], (err, result) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ success: false, message: 'Database error' });
    }

    if (result.length > 0) {
      // ถ้ามีอยู่แล้ว → อัปเดตแทน
      const updateQuery = `
        UPDATE notifications 
        SET send_date = ?, status = 'ยังไม่อ่าน' 
        WHERE notification_id = ?
      `;
      db.query(updateQuery, [send_date, result[0].notification_id], (err2) => {
        if (err2) {
          console.error("Update failed:", err2);
          return res.status(500).json({ success: false, message: 'Update failed' });
        }
        res.json({ success: true, message: 'Updated existing notification' });
      });

    } else {
      // ถ้ายังไม่มี → แทรกใหม่
      const insertQuery = `
        INSERT INTO notifications (user_id, type, message, related_id, send_date, status)
        VALUES (?, ?, ?, ?, ?, 'ยังไม่อ่าน')
      `;
      db.query(insertQuery, [user_id, type, message, related_id, send_date], (err3) => {
        if (err3) {
          console.error("Insert failed:", err3);
          return res.status(500).json({ success: false, message: 'Insert failed' });
        }
        res.json({ success: true, message: 'Notification created' });
      });
    }
  });
});


// อัปเดตสถานะแจ้งเตือนเป็น "อ่านแล้ว"
router.put('/read/:notificationId', (req, res) => {
    const { notificationId } = req.params;

     const queryUpdateNotification = `
          UPDATE notifications SET status = 'อ่านแล้ว' WHERE notification_id = ?
      `;
      db.query(queryUpdateNotification, [notificationId], (err, result) => {
          if (err) {
              console.error('Error updating notification status:', err);
              return res.status(500).json({ success: false, message: 'Database error' });
          }
    
          res.json({ success: true, message: 'Notification marked as read' });
      });
});

// ลบแจ้งเตือน
router.delete("/notification/:notificationId", (req, res) => {
    const { notificationId } = req.params;

    const queryDelete = `DELETE FROM notifications WHERE notification_id = ?`;

    db.query(queryDelete, [notificationId], (err, result) => {
        if (err) {
            console.error("Error deleting notification:", err);
            return res.status(500).json({ success: false, message: "Database error" });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: "ไม่พบการแจ้งเตือนที่ต้องการลบ" });
        }

        res.json({ success: true, message: "Notification deleted successfully" });
    });
});

module.exports = router;