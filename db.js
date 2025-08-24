// var mysql = require('mysql2');
// const fs = require('fs');

// // สร้างการเชื่อมต่อฐานข้อมูล
// const db = mysql.createConnection({
//   host: 'localhost',      
//   user: 'root',           
//   password: '',           
//   database: 'pj_webalumni' 
// });

// // เชื่อมต่อกับฐานข้อมูล
// db.connect((err) => {
//   if (err) {
//     console.error('Database connection error: ' + err.stack);
//     return;
//   }
//   console.log('Connected to MySQL as id ' + db.threadId);
// });


// module.exports = db;


const mysql = require('mysql2');
const util = require('util');

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'pj_webalumni'
});

db.connect(err => {
  if (err) {
    console.error('Database connection error: ' + err.stack);
    return;
  }
  console.log('Connected to MySQL as id ' + db.threadId);
});

// แปลง query ให้รองรับ Promise (async/await ได้)
db.query = util.promisify(db.query);

module.exports = db;

