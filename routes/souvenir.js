// souvenir.js (User)
const express = require("express");
const route = express.Router();
const multer = require('multer');
const path = require('path');
const db = require('../db');


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

const upload = multer({ storage });


// ดึงข้อมูลสินค้าทั้งหมด
route.get('/', (req, res) => {
    const query = `
    SELECT 
    products.*, role.role_id
    FROM products 
    JOIN users ON products.user_id = users.user_id
    JOIN role ON users.role_id = role.role_id
    WHERE status = "1"
    `;
    db.query(query, (err, results) => {
        if (err) {
            console.error('Database query failed:', err);
            res.status(500).json({ error: 'Database query failed' });
            return;
        }
        res.json(results);
    });
});

// ดึงรายละเอียดของสินค้า
route.get('/souvenirDetail/:id', (req, res) => {
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

route.post('/addsouvenir', upload.single('image'), (req, res) => {
    const { productName, description, price, stock } = req.body;
    const user_id = req.body.user_id;
    const image = req.file ? req.file.filename : null;

    if (!image) {
        return res.status(400).json({ error: 'Image is required' });
    }

    if (!productName || !description || !price || !stock) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    const query = `
    INSERT INTO products 
    (product_name, description, image, price, stock, user_id) 
    VALUES (?, ?, ?, ?, ?, ?)
    `;

    const values = [
        productName,
        description,
        image,
        price,
        stock,
        user_id
    ];

    db.query(query, values, (err, result) => {
        if (err) {
            console.error('Error inserting product:', err);
            return res.status(500).json({ error: 'Error inserting product' });
        }

        res.status(200).json({ message: 'Product added successfully' });
    });
});

// ดึงตะกร้ามาจ้า
route.get('/cart', (req, res) => {
    const user_id = req.query.user_id;

    if (!user_id) {
        return res.status(400).json({ error: 'User ID is required' });
    }

    const query = `
        SELECT cart.*, products.product_id, products.product_name, users.user_id, 
        products.price,products.image
        FROM cart
        JOIN users ON cart.user_id = users.user_id
        JOIN products ON cart.product_id = products.product_id
        WHERE cart.user_id = ?
    `;

    db.query(query, [user_id], (err, results) => {
        if (err) {
            console.error('Error executing query:', err);  // เพิ่ม log ข้อผิดพลาด
            return res.status(500).json({ error: 'Error fetching cart details', details: err });
        }

        res.status(200).json(results.length > 0 ? results : []);
    });
});

route.put("/cart/update", (req, res) => {
    const { user_id, product_id, quantity } = req.body;

    if (!user_id || !product_id || quantity < 1) {
        return res.status(400).json({ message: "ข้อมูลไม่ถูกต้อง" });
    }

    const sql = "UPDATE cart SET quantity = ? WHERE user_id = ? AND product_id = ?";
    db.query(sql, [quantity, user_id, product_id], (err, result) => {
        if (err) {
            console.error("Error updating cart:", err);
            return res.status(500).json({ message: "เกิดข้อผิดพลาด" });
        }
        res.json({ message: "อัปเดตจำนวนสินค้าเรียบร้อย" });
    });
});


route.post('/cart/add', (req, res) => {
    const { product_id, quantity, user_id, total } = req.body;

    // ตรวจสอบค่าที่ได้รับ
    if (!product_id || !quantity || !user_id || isNaN(total)) {
        return res.status(400).send("ข้อมูลไม่ครบถ้วนหรือค่าผิดพลาด");
    }

    const query = `UPDATE cart SET quantity = ?, total = ? WHERE user_id = ? AND product_id = ?`;

    db.query(query, [quantity, total, user_id, product_id], (err, result) => {
        if (err) {
            console.error("Error updating cart:", err);
            return res.status(500).send("Error updating cart");
        }

        if (result.affectedRows === 0) {
            const insertQuery = `INSERT INTO cart (user_id, product_id, quantity, total) VALUES (?, ?, ?, ?)`;
            db.query(insertQuery, [user_id, product_id, quantity, total], (err, result) => {
                if (err) {
                    console.error("Error inserting into cart:", err);
                    return res.status(500).send("Error adding to cart");
                }
                res.send("เพิ่มสินค้าเข้าตะกร้าแล้ว!");
            });
        } else {
            res.send("ตะกร้าของคุณถูกอัปเดตแล้ว!");
        }
    });
});



// สำหรับลบสินค้าในตะกร้า
route.delete('/cart/:productId', (req, res) => {
    const { productId } = req.params;
    const deleteQuery = 'DELETE FROM cart WHERE product_id = ?';

    db.query(deleteQuery, [productId], (err, results) => {
        if (err) {
            console.error("Error deleting item:", err);
            return res.status(500).json({ error: "Error deleting item from cart" });
        }

        res.status(200).json({ message: "Item deleted from cart" });
    });
});



module.exports = route;