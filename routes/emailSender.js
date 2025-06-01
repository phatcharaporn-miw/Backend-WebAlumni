const nodemailer = require('nodemailer');

// ใช้ Mailtrap SMTP สำหรับ test
var transport = nodemailer.createTransport({
  host: "sandbox.smtp.mailtrap.io",
  port: 2525,
  auth: {
    user: "890a09f6088d79",
    pass: "1bad5ab925e61b"
  }
});

// ฟังก์ชันส่งอีเมลอวยพรวันเกิด
function sendBirthdayEmail(toEmail, fullName) {
  const mailOptions = {
    from: '"Alumni Association" <no-reply@alumni.com>',
    to: toEmail,
    subject: 'สุขสันต์วันเกิด! 🎉',
    html: `<p>สวัสดีคุณ <strong>${fullName}</strong>,</p>
           <p>ขอให้คุณมีความสุขมาก ๆ ในวันเกิดปีนี้!</p>
           <p>ด้วยความปรารถนาดีจาก <br><strong>ชมรมศิษย์เก่าสัมพันธ์</strong></p>`
  };

  transport.sendMail(mailOptions, (err, info) => {
    if (err) {
      console.error('เกิดข้อผิดพลาดในการส่งอีเมล:', err);
    } else {
      console.log('ส่งอีเมลอวยพรวันเกิดแล้ว:', info.response);
    }
  });
}

module.exports = sendBirthdayEmail;
