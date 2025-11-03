var express = require('express');
var router = express.Router();
var db = require('../db');

router.get('/search-all', (req, res) => {
    const { search } = req.query;

    if (!search || search.trim() === "") {
        return res.status(400).json({ success: false, message: 'กรุณาใส่คำค้นหา' });
    }

    const querySearch = `
        SELECT 'news' AS type, news_id AS id, NULL AS user_id, title, content, created_at
        FROM news
        WHERE (title LIKE ? OR content LIKE ?) AND deleted_at IS NULL
        
        UNION
        
        SELECT 'webboard' AS type, webboard_id AS id, NULL AS user_id, title, content, created_at
        FROM webboard
        WHERE (title LIKE ? OR content LIKE ?) AND deleted_at IS NULL
        
        UNION
        
        SELECT 'activity' AS type, activity_id AS id, NULL AS user_id, activity_name AS title, description AS content, created_at
        FROM activity
        WHERE (activity_name LIKE ? OR description LIKE ?) AND deleted_at IS NULL
        
        UNION
        
        SELECT 'donationproject' AS type, project_id AS id, NULL AS user_id, project_name AS title, description AS content, created_at
        FROM donationproject
        WHERE (project_name LIKE ? OR description LIKE ?) 

        UNION
        
        SELECT 'products' AS type, product_id AS id, NULL AS user_id, product_name AS title, description AS content, created_at
        FROM products
        WHERE (product_name LIKE ? OR description LIKE ?) AND deleted_at IS NULL

        UNION
        
        SELECT 'profiles' AS type, profiles_id AS id, user_id, full_name AS title, nick_name AS content, created_at
        FROM profiles
        WHERE (full_name LIKE ?  OR nick_name LIKE ?) 

        UNION

        SELECT 'educations' AS type, education_id AS id, user_id,
            CONCAT('รหัสนักศึกษา: ', studentId) AS title,
            CONCAT('ปีการศึกษาเข้า: ', entry_year, ', ปีจบ: ', graduation_year, ', ชั้นปี: ', student_year) AS content,
            created_at
        FROM educations
        WHERE (studentId LIKE ? OR graduation_year LIKE ? OR entry_year LIKE ? OR student_year LIKE ?)
        
        ORDER BY created_at DESC
        LIMIT 10;
    `;


    db.query(
        querySearch,
        [
            `%${search}%`, `%${search}%`, // สำหรับ news
            `%${search}%`, `%${search}%`, // สำหรับ webboard
            `%${search}%`, `%${search}%`, // สำหรับ activity
            `%${search}%`, `%${search}%`, // สำหรับ donations
            `%${search}%`, `%${search}%`, // สำหรับ products
            `%${search}%`, `%${search}%`, // สำหรับ profiles
            `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`// สำหรับ education


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