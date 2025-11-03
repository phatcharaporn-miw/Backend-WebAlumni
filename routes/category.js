var express = require('express');
var router = express.Router();
var db = require('../db');

//ดึงข้อมูลหมวดหมู่
router.get('/category-all', (req, res) => {
   
    const queryCategory = 'SELECT category_id, category_name FROM category';
    
    db.query(queryCategory, (err, results) => {
        if (err) {
            console.error('เกิดข้อผิดพลาดในการดึงการแจ้งเตือน:', err);
            return res.status(500).json({ success: false, message: 'Database error' });
        }

        // console.log("แจ้งเตือนที่ส่งกลับ:", results);
        res.json({ success: true, data: results });
    });
});


//ผู้ใช้งานเพิ่มหมวดหมู่
router.post('/add-category', (req, res) => {
   
    const {category_name} = req.body;

    if (!category_name) {
        return res.status(400).json({ success: false, message: 'Category name is required' });
    }

    const queryAddCategory = 'INSERT INTO category (category_name) VALUES (?)';

    db.query(queryAddCategory, [category_name], (err, results) => {
        if (err) {
            console.error('เกิดข้อผิดพลาดในการเพิ่มหมวดหมู่:', err);
            return res.status(500).json({ success: false, message: 'Database error' });
        }

        res.json({ success: true, message: 'เพิ่มหมวดหมู่สำเร็จ!', data: { category_id: results.insertId, category_name } });        
    });
});


module.exports = router;