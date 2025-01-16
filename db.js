var mysql = require('mysql2');

const db = mysql.createConnection({
  host: 'localhost',      
  user: 'root',           
  password: '',           
  database: 'pj_webalumni' 
});

db.connect((err) => {
  if (err) {
    console.error('Database connection error: ' + err.stack);
    return;
  }
  console.log('Connected to MySQL as id ' + db.threadId);
});

module.exports = db;
