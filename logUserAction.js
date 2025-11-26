var db = require('./db'); 

function SystemlogAction(userId, moduleName, actionType, description, ipAddress, relatedId = null) {
    const queryUserlog = `
        INSERT INTO system_logs (
            user_id, 
            module_name, 
            action_type, 
            description, 
            related_id, 
            ip_address, 
            created_at
        ) 
        VALUES (?, ?, ?, ?, ?, ?, NOW())
    `;
    
    // พารามิเตอร์ต้องเรียงตามคอลัมน์ใน Query
    const params = [
        userId, 
        moduleName, 
        actionType, 
        description, 
        relatedId, 
        ipAddress
    ];

    db.query(queryUserlog, params, (err) => {
        if (err) {
            console.error('เกิดข้อผิดพลาดในการบันทึก system log:', err);
        }
    });
}


// // activitylog
// function logActivity(userId, activityId, actionDetail) {
//   const queryActivitylog = `INSERT INTO activitylog (activity_id, user_id, action) VALUES (?, ?, ?)`;
//   db.query(queryActivitylog, [activityId, userId, actionDetail], (err) => {
//     if (err) console.error('เกิดข้อผิดพลาดในการบันทึก activitylog:', err);
//   });
// }
// // donationlog
// function logDonation(userId, donationId, actionDonate) {
//   const queryDonationlog = `
//         INSERT INTO donationlog (user_id, donation_id, action, timestamp) 
//         VALUES (?, ?, ?, NOW())
//   `;
//   db.query(queryDonationlog, [userId, donationId, actionDonate], (err) => {
//     if (err) {
//       console.error('เกิดข้อผิดพลาดในการบันทึก log:', err);
//     } else {
//       console.log(`บันทึก log สำเร็จ`);
//     }
//   });
// }

// // newslog
// function logNews(userId, newsId, actionNews) {
//   const querynewslog = `INSERT INTO newslog (news_id, user_id, action) VALUES (?, ?, ?)`;
//   db.query(querynewslog, [newsId, userId, actionNews], (err) => {
//     if (err) console.error('เกิดข้อผิดพลาดในการบันทึก newslog:', err);
//   });
// }

// // webboardlog
// function logWebboard(userId, webboardId, actionWebboard) {
//   const querywebboardlog = `
//     INSERT INTO webboardlog (user_id, webboard_id, action, timestamp)
//     VALUES (?, ?, ?, NOW())
//   `;
//   db.query(querywebboardlog, [userId, webboardId, actionWebboard], (err) => {
//     if (err) {
//       console.error('เกิดข้อผิดพลาดในการบันทึก log:', err);
//     } else {
//       console.log(`บันทึก log สำเร็จ`);
//     }
//   });
// }
// // managelog
// function logManage(userId, actionManage) {
//   const querymanagelog = `INSERT INTO managelog (user_id, action) VALUES (?, ?)`;
//   db.query(querymanagelog, [userId, actionManage], (err) => {
//     if (err) console.error('เกิดข้อผิดพลาดในการบันทึก querymanagelog:', err);
//   });
// }

// // paymentlog
// function logPayment(userId, payment_id, actionPayment, isApproved) {
//   const queryPaymentlog = `
//     INSERT INTO paymentlog (user_id, payment_id, action, is_approved, created_at)
//     VALUES (?, ?, ?, ?, NOW())
//   `;
//   db.query(queryPaymentlog, [userId, payment_id, actionPayment, isApproved], (err) => {
//     if (err) {
//       console.error('เกิดข้อผิดพลาดในการบันทึก paymentlog:', err);
//     } else {
//       console.log(`บันทึก paymentlog สำเร็จ: user ${userId}, action: ${actionPayment}`);
//     }
//   });
// }

// // orderlog
// function logOrder(userId, orderId, actionOrder) {
//   console.log('บันทึก order log:', { userId, orderId, actionOrder });

//   const queryOrderslog = `INSERT INTO orderlog (user_id, order_id, action) VALUES (?, ?, ?)`;
//   db.query(queryOrderslog, [userId, orderId, actionOrder], (err) => {
//     if (err) {
//       console.error('เกิดข้อผิดพลาดในการบันทึก orderslog:', err);
//     } else {
//       console.log('บันทึก orderlog สำเร็จ');
//     }
//   });
// }


module.exports = {SystemlogAction};
