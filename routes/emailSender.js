const nodemailer = require('nodemailer');

const transport = nodemailer.createTransport({
  host: "sandbox.smtp.mailtrap.io",
  port: 2525,
  auth: {
    user: "890a09f6088d79",
    pass: "1bad5ab925e61b"
  }
});

/**
 * ส่งอีเมลตามประเภท
 * @param {string} toEmail - อีเมลผู้รับ
 * @param {string} fullName - ชื่อเต็มผู้รับ
 * @param {string} type - ประเภท: "birthday", "event", "donation"
 */
function sendCustomEmail(toEmail, fullName, type = "birthday", extra = {}) {
  let subject = '';
  let html = '';

  switch (type) {
    case 'birthday':
      subject = 'สุขสันต์วันเกิด! 🎉';
      html = `<p>สวัสดีคุณ <strong>${fullName}</strong>,</p>
              <p>ขอให้คุณมีความสุขมาก ๆ ในวันเกิดปีนี้!</p>
              <p>ด้วยความปรารถนาดีจาก <br><strong>สมาคมศิษย์เก่าวิทยาลัยการคอมพิวเตอร์</strong></p>`;
      break;
    case 'event':
      subject = `📅 ขอเชิญเข้าร่วมกิจกรรม: ${extra.activity_name || 'กิจกรรมพิเศษ'}`;
      html = `<p>เรียนคุณ <strong>${fullName}</strong>,</p>
              <p>ขอเชิญเข้าร่วมกิจกรรม <strong>${extra.activity_name}</strong> ในวันที่ <strong>${extra.eventDate}</strong></p>
              <p>ขอแสดงความนับถือ<br>ชมรมศิษย์เก่าสัมพันธ์</p>`;
      break;
    case 'donation':
      subject = 'ขอเชิญร่วมบริจาคสนับสนุนศิษย์เก่า';
      html = `<p>เรียนคุณ <strong>${fullName}</strong>,</p>
              <p>เราขอเชิญคุณร่วมเป็นส่วนหนึ่งในการสนับสนุนกิจกรรมของศิษย์เก่า</p>
              <p><a href="https://example.com/donate" target="_blank">คลิกที่นี่เพื่อร่วมบริจาค</a></p>`;
      break;
    default:
      subject = 'ข่าวสารจากชมรมศิษย์เก่าสัมพันธ์';
      html = `<p>เรียนคุณ <strong>${fullName}</strong>,</p>
              <p>ขอบคุณที่ติดตามข่าวสารจากเรา</p>`;
  }

  const mailOptions = {
    from: '"Alumni Association" <no-reply@alumni.com>',
    to: toEmail,
    subject,
    html
  };

  transport.sendMail(mailOptions, (err, info) => {
    if (err) {
      console.error('เกิดข้อผิดพลาดในการส่งอีเมล:', err);
    } else {
      console.log(`ส่งอีเมลประเภท "${type}" เรียบร้อย:`, info.response);
    }
  });
}

module.exports = sendCustomEmail;
