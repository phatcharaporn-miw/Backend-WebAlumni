
const express = require("express");
const router = express.Router();
const multer = require('multer');
const path = require('path');
const db = require('../db'); 
var { LoggedIn } = require('../middlewares/auth');

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

router.get('/', (req, res) => {
    const query = 'SELECT * FROM donationproject';

    db.query(query, (err, results) => {
        if (err) {
            console.error('Database query failed:', err);
            return res.status(500).json({ error: 'Database query failed' });
        }
        res.json(results);
    });
});

router.get('/donatedetail/:id', (req, res) => {
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

router.post('/donateRequest', upload.single('image'), (req, res) => {
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

router.delete('/:id', (req, res) => {
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


router.put('/:id', (req, res) => {
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

router.post('/addsouvenir', upload.single('image'), (req, res) => {
    const { productName, description, price, stock, paymentMethod, bankName, accountNumber, accountName, promptpayNumber } = req.body;
    const user_id = req.body.user_id;
    const image = req.file ? req.file.filename : null;

    if (!image) {
        return res.status(400).json({ error: 'Image is required' });
    }

    if (!productName || !description || !price || !stock || !paymentMethod || !bankName || !accountNumber || !accountName) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    const queryPayment = `
    INSERT INTO payment_methods 
    (method_name, bank_name, account_name, account_number, promptpay_number) 
    VALUES (?, ?, ?, ?, ?)
    `;

    const valuesPayment = [
        paymentMethod,
        bankName,
        accountName,
        accountNumber,
        promptpayNumber
    ];

    db.query(queryPayment, valuesPayment, (err, result) => {
        if (err) {
            console.error('Error inserting payment method:', err);
            return res.status(500).json({ error: 'Error inserting payment method' });
        }

        const payment_method_id = result.insertId; 

        const queryProduct = `
        INSERT INTO products 
        (product_name, description, image, price, stock, user_id, status, payment_method_id) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const valuesProduct = [
            productName,
            description,
            image,
            price,
            stock,
            user_id,
            "1",  
            payment_method_id,
        ];

        db.query(queryProduct, valuesProduct, (err, result) => {
            if (err) {
                console.error('Error inserting product:', err);
                return res.status(500).json({ error: 'Error inserting product' });
            }

            res.status(200).json({ message: 'Product and payment method added successfully' });
        });
    });
});


router.get('/souvenir', (req, res) => {
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
router.put('/updateSouvenir/:id', (req, res) => {
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

router.put('/approveSouvenir/:productId', (req, res) => {
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

        // ดึงข้อมูล product_name และ user_id ของสินค้าที่ถูกลบ
        const getProductQuery = 'SELECT product_name, user_id FROM products WHERE product_id = ?';
        db.query(getProductQuery, [productId], (err, productResult) => {
            if (err || productResult.length === 0) return res.status(500).json({ error: 'Error fetching product information' });

        const productName = productResult[0].product_name;
        const userId = productResult[0].user_id;

        // เพิ่มแจ้งเตือนในตาราง notifications
        const insertNotification = `
            INSERT INTO notifications (user_id, type, message, related_id, send_date, status) 
            VALUES (?, 'approve', ?, ?, NOW(), 'ยังไม่อ่าน')
        `;
        const message = `สินค้าของคุณ "${productName}" ได้รับการอนุมัติแล้ว!`;
        db.query(insertNotification, [userId, message, productId], (err) => {
            if (err) {
                console.error("Error inserting notification:", err);
                return res.status(500).json({ error: 'Error inserting notification' });
            }
            res.status(200).json({ message: 'Product status updated successfully and user notified' });
        });        
        });
    });
});

// แก้ไขข้อมูลสินค้า
router.put('/editSouvenir/:id', (req, res) => {
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

router.delete('/deleteSouvenir/:id', (req, res) => {
    const productId = req.params.id;

     // ดึงข้อมูล product_name และ user_id ของสินค้าที่ถูกลบ
     const getProductQuery = 'SELECT product_name, user_id FROM products WHERE product_id = ?';
     db.query(getProductQuery, [productId], (err, productResult) => {
         if (err || productResult.length === 0) return res.status(500).json({ error: 'Error fetching product information' });
 
        const productName = productResult[0].product_name;
        const userId = productResult[0].user_id;

        // เพิ่มแจ้งเตือนสินค้าโดนลบ
        const insertNotification = `
            INSERT INTO notifications (user_id, type, message, related_id, send_date, status) 
            VALUES (?, 'delete', ?, ?, NOW(), 'ยังไม่อ่าน')
        `;
        const message = `สินค้าของคุณ "${productName}" ถูกลบโดยแอดมิน`;
        db.query(insertNotification, [userId, message, productId], (err) => {
            if (err) {
                console.error("Error inserting notification:", err);
                return res.status(500).json({ error: 'Error inserting notification' });
            }

            // ลบสินค้า
            const deleteProductQuery = 'DELETE FROM products WHERE product_id = ?';
            db.query(deleteProductQuery, [productId], (err, result) => {
                if (err) {
                    console.error('Error deleting product:', err);
                    return res.status(500).json({ error: 'Failed to delete product' });
                }

                res.status(200).json({ message: 'Product deleted successfully and user notified' });
            });
        });
    });
});


// ดึงข้อมูลสรุปกิจกรรม
router.get('/activity-summary', LoggedIn, (req, res) => {
    const querySummary = `
    SELECT 
        (SELECT COUNT(*) FROM activity) AS total_activities, -- กิจกรรมทั้งหมด
        (SELECT COUNT(*) FROM participants) AS total_participants, -- ผู้เข้าร่วมทั้งหมด
        (SELECT COUNT(*) FROM activity WHERE activity_date > CURDATE()) AS upcoming_activities, -- กิจกรรมที่ยังไม่ได้เริ่ม
        (SELECT COUNT(*) FROM activity WHERE COALESCE(end_date, activity_date) < CURDATE()) AS completed_activities, -- กิจกรรมที่สิ้นสุดแล้ว
        (SELECT COUNT(*) FROM activity WHERE activity_date <= CURDATE() AND COALESCE(end_date, activity_date) >= CURDATE()) AS ongoing_activities -- กิจกรรมที่กำลังดำเนินการ
    FROM DUAL
`;

  db.query(querySummary, (err, results) => {
      if (err) {
          console.error('เกิดข้อผิดพลาดในการดึงข้อมูลสรุปกิจกรรม:', err);
          return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในระบบ' });
      }

      res.status(200).json({ success: true, data: results[0] });
  });
});


module.exports = router;