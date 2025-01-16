var express = require('express');
var router = express.Router();
var db = require('../db'); 

router.get('/about', (req, res) => {
    const query = 'SELECT * FROM profiles';

    db.query(query, (err, results) => {
        if (err) {
          console.error("Error fetching users:", err);
          res.status(500).json({ success: false, message: "Database error" });
        } else {
          res.json({ success: true, data: results });
        }
    });
});

module.exports = router; 
