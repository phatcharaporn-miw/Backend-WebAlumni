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
            console.error('❌ ดึงการแจ้งเตือนล้มเหลว:', err);
            return res.status(500).json({ success: false, message: 'Database error' });
        }

        res.json({ success: true, data: results });
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