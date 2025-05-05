var db = require('./db'); 

function logUserAction(userId, action, ip) {
  const queryUserlog = `INSERT INTO user_logs (user_id, action, ip_address) VALUES (?, ?, ?)`;
  db.query(queryUserlog, [userId, action, ip], (err) => {
    if (err) console.error('เกิดข้อผิดพลาดในการบันทึก log:', err);
  });
}
// activitylog
function logActivity(userId, activityId, actionDetail) {
  const queryActivitylog = `INSERT INTO activitylog (activity_id, user_id, action) VALUES (?, ?, ?)`;
  db.query(queryActivitylog, [activityId, userId, actionDetail], (err) => {
    if (err) console.error('เกิดข้อผิดพลาดในการบันทึก activitylog:', err);
  });
}
// donationlog
function logDonation(userId, donationId, actionDonate) {
  const queryDonationlog = `INSERT INTO donationlog (donation_id, user_id, action) VALUES (?, ?, ?)`;
  db.query(queryDonationlog, [donationId, userId, actionDonate], (err) => {
    if (err) console.error('เกิดข้อผิดพลาดในการบันทึก donationlog:', err);
  });
}
// newslog
function logNews(userId, newsId, actionNews) {
  const querynewslog = `INSERT INTO newslog (news_id, user_id, action) VALUES (?, ?, ?)`;
  db.query(querynewslog, [newsId, userId, actionNews], (err) => {
    if (err) console.error('เกิดข้อผิดพลาดในการบันทึก newslog:', err);
  });
}
// webboardlog
function logWebboard(userId, webboardId, actionWebboard) {
  const querywebboardlog = `INSERT INTO webboardlog (webboard_id, user_id, action) VALUES (?, ?, ?)`;
  db.query(querywebboardlog, [webboardId, userId, actionWebboard], (err) => {
    if (err) console.error('เกิดข้อผิดพลาดในการบันทึก querywebboardlog:', err);
  });
}
// managelog
function logManage(userId, actionManage) {
  const querymanagelog = `INSERT INTO managelog (user_id, action) VALUES (?, ?)`;
  db.query(querymanagelog, [userId, actionManage], (err) => {
    if (err) console.error('เกิดข้อผิดพลาดในการบันทึก querymanagelog:', err);
  });
}

module.exports = {logUserAction, logActivity, logDonation, logNews, logWebboard, logManage};
