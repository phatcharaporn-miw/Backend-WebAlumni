var mysql = require('mysql2');
const fs = require('fs');

// สร้างการเชื่อมต่อฐานข้อมูล
const db = mysql.createConnection({
  host: 'localhost',      
  user: 'root',           
  password: '',           
  database: 'pj_webalumni' 
});

// เชื่อมต่อกับฐานข้อมูล
db.connect((err) => {
  if (err) {
    console.error('Database connection error: ' + err.stack);
    return;
  }
  console.log('Connected to MySQL as id ' + db.threadId);
});



module.exports = db;

// const mysql = require('mysql2');

// // สร้าง pool
// const db = mysql.createPool({
//   host: 'localhost',
//   user: 'root',
//   password: '',
//   database: 'pj_webalumni',
//   waitForConnections: true,
//   connectionLimit: 10, // กำหนด connection สูงสุดที่เปิดได้พร้อมกัน
//   queueLimit: 0
// });

// // ส่งออกแบบ promise ด้วย เพื่อเขียน async/await ได้
// module.exports = db.promise();
