const express = require("express");
const route = express.Router();
const multer = require('multer');
const path = require('path');
const db = require('../db'); 

// ตั้งค่า Multer สำหรับอัปโหลดไฟล์
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/'); // กำหนดโฟลเดอร์เก็บไฟล์
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname)); // ตั้งชื่อไฟล์ไม่ให้ซ้ำกัน
    }
});
const upload = multer({ storage: storage });

route.get('/', (req, res) => {
    const query = 'SELECT * FROM donationproject';

    db.query(query, (err, results) => {
        if (err) {
            console.error('Database query failed:', err);
            return res.status(500).json({ error: 'Database query failed' });
        }
        res.json(results);
    });
});

route.get('/donatedetail/:id', (req, res) => {
    const projectId = req.params.id;
    const query = 'SELECT * FROM donationproject WHERE project_id = ?';

    db.query(query, [projectId], (err, results) => {
        if (err) {
            console.error('Error fetching project details:', err);
            return res.status(500).json({ error: 'Error fetching project details' });
        }
        if (results.length === 0) {
            return res.status(404).json({ error: 'Project not found' });
        }
        res.status(200).json(results[0]); 
    });
});

route.post('/donateRequest', upload.single('image'), (req, res) => {
    const { projectName, description, targetAmount, startDate, endDate, donationType, currentAmount, bankName, accountNumber, numberPromtpay, roleId } = req.body;

    if (roleId !== '1') {
        return res.status(403).json({ error: 'Unauthorized access, only admins can add donation projects' });
    }

    if (!req.file) {
        return res.status(400).json({ error: 'Image is required' });
    }

    const image = req.file.filename; 

    const query = 
    `INSERT INTO donationproject 
    (project_name, description, start_date, end_date, donation_type, image_path, 
    target_amount, current_amount, bank_name, account_number, number_promtpay, role_id) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
        projectName,
        description,
        startDate,
        endDate,
        donationType,
        image,
        targetAmount,
        currentAmount,
        bankName,
        accountNumber,
        numberPromtpay,
        '1'  
    ];

    db.query(query, values, (err, result) => {
        if (err) {
            console.error('Error inserting donation project:', err);
            return res.status(500).json({ error: 'Error inserting donation project' });
        }
        res.status(201).json({ message: 'Donation project added successfully' });
    });
});

route.delete('/:id', (req, res) => {
    const projectId = req.params.id;
    if (!projectId) {
        return res.status(400).json({ error: 'Project ID is required' });
    }
    const query = 'DELETE FROM donationproject WHERE project_id = ?';
    db.query(query, [projectId], (err, result) => {
        if (err) {
            console.error('Error deleting project:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Project not found' });
        }
        res.status(200).json({ message: 'Project permanently deleted' });
    });
});


// เส้นทางที่ถูกต้องต้องมีการตั้งค่าที่ :id เช่น /admin/44
route.put('/:id', (req, res) => {
    const projectId = req.params.id;
    if (!projectId) {
        return res.status(400).json({ error: 'Project ID is required' });
    }

    const query = 'UPDATE donationproject SET status = "1" WHERE project_id = ?';
    
    db.query(query, [projectId], (err, result) => {
        if (err) {
            console.error('Error updating project status:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Project not found or already updated' });
        }

        res.status(200).json({ message: 'Project status updated successfully' });
    });
});

route.post('/addsouvenir', upload.single('image'), (req, res) => {
    const { productName, description, price, stock } = req.body;
    const user_id = req.body.user_id;
    const image = req.file ? req.file.filename : null;
    console.log(user_id);
    if (!image) {
        return res.status(400).json({ error: 'Image is required' });
    }

    if (!productName || !description || !price || !stock) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    const query = `
    INSERT INTO products 
    (product_name, description, image, price, stock, user_id,status) 
    VALUES (?, ?, ?, ?, ?, ?,?)
    `;

    const values = [
        productName,
        description,
        image,
        price,
        stock,
        user_id,
        "1"
    ];

    db.query(query, values, (err, result) => {
        if (err) {
            console.error('Error inserting product:', err);
            return res.status(500).json({ error: 'Error inserting product' });
        }

        res.status(200).json({ message: 'Product added successfully' });
    });
});


// สินค้าาาาาาาาาา
route.get('/souvenir', (req, res) => {
    const query = 
        `SELECT 
        products.*, role.role_id
        FROM products 
        JOIN users ON products.user_id = users.user_id
        JOIN role ON users.role_id = role.role_id
    `;
    db.query(query, (err, results) => {
        if (err) {
            console.error('Database query failed:', err);
            return res.status(500).json({ error: 'Database query failed' });
        }
        res.json(results);
    });
});

// เปลี่ยนสถานะสินค้าให้เป็นสถานะ 1จาก 0
route.put('/updateSouvenir/:id', (req, res) => {
    const productId = req.params.id; // รับค่า id จาก URL parameter
    if (!productId) {
        return res.status(400).json({ error: 'Product ID is required' });
    }

    const query = 'UPDATE products SET status = "1" WHERE product_id = ?';
    
    db.query(query, [productId], (err, result) => {
        if (err) {
            console.error('Error updating product status:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Product not found or already updated' });
        }

        res.status(200).json({ message: 'Product status updated successfully' });
    });
});

route.put('/approveSouvenir/:productId', (req, res) => {
    const productId = req.params.productId;

    if (!productId) {
        return res.status(400).json({ error: 'Product ID is required' });
    }

    const query = 'UPDATE products SET status = "1" WHERE product_id = ?';
    
    db.query(query, [productId], (err, result) => {
        if (err) {
            console.error('Error updating product status:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Product not found or already updated' });
        }

        res.status(200).json({ message: 'Product status updated successfully' });
    });
});

// แก้ไขข้อมูลสินค้า
route.put('/editSouvenir/:id', (req, res) => {
    const productId = req.params.id;
    const { product_name, price, status } = req.body;

    if (!productId || !product_name || !price || status === undefined) {
        return res.status(400).json({ error: 'Product ID, name, price, and status are required' });
    }

    const query = 
    `    UPDATE products 
        SET product_name = ?, price = ?, status = ? 
        WHERE product_id = ?
    `;
    
    db.query(query, [product_name, price, status, productId], (err, result) => {
        if (err) {
            console.error('Error updating product:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Product not found or already updated' });
        }

        res.status(200).json({ message: 'Product updated successfully' });
    });
});

module.exports = route;