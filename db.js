// const mysql = require('mysql2');
// const util = require('util');

// require('dotenv').config();

// const db = mysql.createConnection({
//   host: process.env.DB_HOST,
//   user: process.env.DB_USER,
//   password: process.env.DB_PASSWORD,
//   database: process.env.DB_NAME
// });

// db.connect(err => {
//   if (err) {
//     console.error('Database connection error: ' + err.stack);
//     return;
//   }
//   console.log('Connected to MySQL as id ' + db.threadId);
// });

// db.query = util.promisify(db.query);

// module.exports = db;

const mysql = require('mysql2');
const util = require('util');
require('dotenv').config();

// สร้าง connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10, // จำนวน connection สูงสุดใน pool
  queueLimit: 0        // 0 หมายถึงไม่จำกัดคิว
});

// ทดสอบการเชื่อมต่อ
pool.getConnection((err, connection) => {
  if (err) {
    console.error('Database connection error:', err.message);
    return;
  }
  console.log('Connected to MySQL database (pool).');
  connection.release(); // ปล่อย connection กลับ pool
});

// แปลง query ให้รองรับ async/await
pool.query = util.promisify(pool.query);

module.exports = pool;
