const express = require("express");
const route = express.Router();
const multer = require('multer');
const path = require('path');
var db = require('../db');

// ตั้งค่าการจัดเก็บไฟล์
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '../uploads/')); // ระบุโฟลเดอร์เก็บไฟล์
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname); // ตั้งชื่อไฟล์ให้ไม่ซ้ำกัน
    }
});

// Middleware สำหรับอัปโหลดไฟล์
const upload = multer({ storage });

// ดึงข้อมูลสินค้าทั้งหมด
route.get('/', (req, res) => {
    // const db = req.db; // เชื่อมต่อฐานข้อมูลผ่าน middleware

    const query = 'SELECT * FROM products';

    db.query(query, (err, results) => {
        if (err) {
            console.error('Database query failed:', err);
            res.status(500).json({ error: 'Database query failed' });
            return;
        }
        res.json(results);
    });
});
route.get('/souvenirDetail/:id', (req, res) => {
    // const db = req.db;
    const productId = req.params.id;

    const query = 'SELECT * FROM products WHERE product_id = ?';
    db.query(query, [productId], (err, results) => {
        if (err) {
            console.error('Error fetching project details:', err);
            return res.status(500).json({ error: 'Error fetching product details' });
        }

        if (results.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }

        res.status(200).json(results[0]); 
    });
});
;

// เพิ่มสินค้าใหม่
route.post('/addsouvenir', upload.single('image'), (req, res) => {
    const { productName, description, price, stock } = req.body;

    const image = req.file ? req.file.filename : null;
    if (!image) {
        return res.status(400).json({ error: 'Image is required' });
    }

    if (!productName || !description || !price || !stock) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    const db = req.db; 

    const query = `
    INSERT INTO products 
    (product_name, description, image, price, stock) 
    VALUES (?, ?, ?, ?, ?)`;

    const values = [
        productName,
        description,
        image,
        price,
        stock
    ];

    db.query(query, values, (err, result) => {
        if (err) {
            console.error('Error inserting product:', err);
            return res.status(500).json({ error: 'Error inserting product' });
        }
        res.status(200).json({ message: 'Product added successfully' });
    });
});

module.exports = route;
