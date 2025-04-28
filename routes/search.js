var express = require('express');
var router = express.Router();
var db = require('../db');

router.get('/search-all', (req, res) => {
    const { search } = req.query; // ใช้ req.query แทน req.params

    if (!search || search.trim() === "") {
        return res.status(400).json({ success: false, message: 'กรุณาใส่คำค้นหา' });
    }

    const querySearch = `
        SELECT 'news' AS type, news_id AS id, title AS title, content , created_at
        FROM news
        WHERE title LIKE ? OR content LIKE ?
        
        UNION
        
        SELECT 'webboard' AS type, webboard_id AS id, title, content, created_at
        FROM webboard
        WHERE title LIKE ? OR content LIKE ?
        
        UNION
        
        SELECT 'profile' AS type, user_id AS id, full_name AS title, self_description AS content, created_at
        FROM profiles
        WHERE full_name LIKE ? OR self_description LIKE ?
        
         UNION
        
        SELECT 'donationproject' AS type, project_id AS id, project_name AS title, description AS content, created_at
        FROM donationproject
        WHERE project_name LIKE ? OR description LIKE ?

        UNION
        
        SELECT 'products' AS type, product_id AS id, product_name AS title, description AS content, created_at
        FROM products
        WHERE product_name LIKE ? OR description LIKE ?
        
        
        ORDER BY created_at DESC
        LIMIT 10;
    `;

    db.query(
        querySearch,
        [
            `%${search}%`, `%${search}%`, // สำหรับ news
            `%${search}%`, `%${search}%`, // สำหรับ webboard
            `%${search}%`, `%${search}%`, // สำหรับ profiles
            `%${search}%`, `%${search}%`, // สำหรับ donations
            `%${search}%`, `%${search}%` // สำหรับ products
             
        ],
        (err, results) => {
        if (err) {
            console.error('เกิดข้อผิดพลาดในการค้นหา:', err);
            return res.status(500).json({ success: false, message: 'Database error' });
        }

        if (results.length === 0) {
            return res.json({ success: true, message: 'ไม่พบข้อมูลที่ค้นหา', data: [] });
        }

        res.json({ success: true, data: results });
    });
});

module.exports = router;