const cron = require('node-cron');
const db = require('../db'); 
const sendCustomEmail = require('../routes/emailSender');
const dayjs = require('dayjs');
const startTime = Date.now();
//วันเกิด
cron.schedule('0 8 * * *', () => {
   console.log('⏰ ทดสอบส่งอีเมลกิจกรรม/วันเกิด...');

  const today = dayjs().format('MM-DD'); // รูปแบบเดือน-วัน เช่น "06-01"

  const query = `
    SELECT email, full_name as fullName
    FROM profiles
    WHERE DATE_FORMAT(birthday, '%m-%d') = ?
  `;

  db.query(query, [today], (err, results) => {
    if (err) return console.error('❌ ดึงรายชื่อวันเกิดล้มเหลว:', err);

    results.forEach((user) => {
      sendCustomEmail(user.email, user.fullName, 'birthday');
    });

    console.log(`🎉 ส่งอีเมลอวยพรแล้ว ${results.length} คน`);
  });
});

// กิจกรรม
// cron.schedule('0 9 * * *', () => {
//   console.log('⏰ เริ่มส่งเชิญกิจกรรมล่วงหน้า 3 วัน...');

//   const targetDate = dayjs().add(3, 'day').format('YYYY-MM-DD');

//   const query = `
//     SELECT e.title, e.event_date, p.email, CONCAT(pr.first_name, ' ', pr.last_name) AS fullName
//     FROM events e
//     JOIN participants p ON p.event_id = e.id
//     JOIN profiles pr ON pr.user_id = p.user_id
//     WHERE e.event_date = ?
//   `;

//   db.query(query, [targetDate], (err, results) => {
//     if (err) return console.error('❌ ดึงรายชื่อกิจกรรมล่วงหน้าล้มเหลว:', err);

//     results.forEach((entry) => {
//       sendCustomEmail(entry.email, entry.fullName, 'event', {
//         eventName: entry.title,
//         eventDate: dayjs(entry.event_date).format('DD MMM YYYY')
//       });
//     });

//     console.log(`📩 ส่งอีเมลเชิญเข้าร่วมกิจกรรมแล้ว ${results.length} คน`);
//   });
// });
