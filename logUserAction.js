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
  const querywebboardlog = `
    INSERT INTO webboardlog (user_id, webboard_id, action, timestamp)
    VALUES (?, ?, ?, NOW())
  `;
  db.query(querywebboardlog, [userId, webboardId, actionWebboard], (err) => {
    if (err) {
      console.error('เกิดข้อผิดพลาดในการบันทึก log:', err);
    } else {
      console.log(`บันทึก log สำเร็จ`);
    }
  });
}
// managelog
function logManage(userId, actionManage) {
  const querymanagelog = `INSERT INTO managelog (user_id, action) VALUES (?, ?)`;
  db.query(querymanagelog, [userId, actionManage], (err) => {
    if (err) console.error('เกิดข้อผิดพลาดในการบันทึก querymanagelog:', err);
  });
}

// paymentlog
function logPayment(userId, payment_id, actionPayment, isApproved) {
  const queryPaymentlog = `
    INSERT INTO paymentlog (user_id, payment_id, action, is_approved, created_at)
    VALUES (?, ?, ?, ?, NOW())
  `;
  db.query(queryPaymentlog, [userId, payment_id, actionPayment, isApproved], (err) => {
    if (err) console.error('เกิดข้อผิดพลาดในการบันทึก paymentlog:', err);
  });
}

function logOrder(userId, orderId, actionOrder) {
  console.log('บันทึก order log:', { userId, orderId, actionOrder });

  const queryOrderslog = `INSERT INTO orderlog (user_id, order_id, action) VALUES (?, ?, ?)`;
  db.query(queryOrderslog, [userId, orderId, actionOrder], (err) => {
    if (err) {
      console.error('เกิดข้อผิดพลาดในการบันทึก orderslog:', err);
    } else {
      console.log('บันทึก orderlog สำเร็จ');
    }
  });
}


module.exports = {logUserAction, logActivity, logDonation, logNews, logWebboard, logManage, logPayment, logOrder};
