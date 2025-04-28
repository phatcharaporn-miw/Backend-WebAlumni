var db = require('./db'); 

function logUserAction(userId, action, ip) {
  const queryUserlog = `INSERT INTO user_logs (user_id, action, ip_address) VALUES (?, ?, ?)`;
  db.query(query, [userId, action, ip], (err) => {
    if (err) console.error('เกิดข้อผิดพลาดในการบันทึก log:', err);
  });
}

// log กิจกรรมแบบมีหมวดหมู่
function logActivity(userId, activityId, actionDetail) {
  const query = `INSERT INTO activitylog (activity_id, user_id, action) VALUES (?, ?, ?)`;
  db.query(query, [activityId, userId, actionDetail], (err) => {
    if (err) console.error('เกิดข้อผิดพลาดในการบันทึก activitylog:', err);
  });
}

module.exports = {logUserAction, logActivity};
