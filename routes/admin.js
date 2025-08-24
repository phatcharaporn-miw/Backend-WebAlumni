const express = require("express");
const route = express.Router();
const multer = require('multer');
const path = require('path');
const db = require('../db');
const moment = require('moment');
const { checkAdminRole } = require('../middlewares/auth');


const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// เกี่ยวกับ donate
route.get('/donate', (req, res) => {
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

// อนุมัติการบริจาคให้ตั้งโครงการ
route.put('/approveDonate/:id', (req, res) => {
    const projectId = req.params.id;
    const query = 'UPDATE donationproject SET status = "1" WHERE project_id = ?';
    db.query(query, [projectId], (err, result) => {
        if (err) {
            console.error('Error updating project status:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Project not found or already approved' });
        }
        console.log(`Project ${projectId} approved successfully`);
        res.status(200).json({
            message: 'Project approved successfully',
            projectId: projectId
        });
    });
});

// ลบโครงการบริจาค
route.delete('/donate/:id', (req, res) => {
    const projectId = req.params.id;
    const query = 'DELETE FROM donationproject WHERE project_id = ?';

    db.query(query, [projectId], (err, results) => {
        if (err) {
            console.error('Error deleting project:', err);
            return res.status(500).json({ error: 'Error deleting project' });
        }

        if (results.affectedRows === 0) {
            return res.status(404).json({ error: 'Project not found' });
        }

        res.status(200).json({ message: 'Project deleted successfully' });
    });
});

// เพิ่มโครงการบริจาค
route.post('/donateRequest', upload.single('image'), (req, res) => {
    const { userId, projectName, description, targetAmount, startDate, endDate,
        donationType, currentAmount, bankName, accountName, accountNumber, numberPromtpay,
        userRole, typeThing, quantity_things, forThings } = req.body;

    if (userRole !== "1") {
        console.log("Unauthorized access attempt by user role:", userRole);
        return res.status(403).json({ error: 'Unauthorized access, only admins can add donation projects' });
    }

    if (!req.file) {
        return res.status(400).json({ error: 'Image is required' });
    }

    const image = req.file.filename;

    // แปลง currentAmount เป็น number และกำหนด default เป็น 0
    const currentAmountValue = currentAmount ? Number(currentAmount) : 0;

    const query =
        `INSERT INTO donationproject 
    (user_id, project_name, description, start_date, end_date, donation_type, image_path, 
    target_amount, current_amount, bank_name,account_name, account_number, number_promtpay,type_things,quantity_things,for_things, status) 
    VALUES (? ,?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
        userId,
        projectName,
        description,
        startDate,
        endDate,
        donationType,
        image,
        targetAmount || null,
        currentAmountValue,
        bankName,
        accountName,
        accountNumber,
        numberPromtpay,
        typeThing || null,
        quantity_things || null,
        forThings || null,
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

// ลบโครงการบริจาค
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

// const moment = require('moment');
// แก้ไขโครงการบริจาค
route.put('/editDonate/:id', upload.single('image'), (req, res) => {
    const projectId = req.params.id;
    const {
        project_name,
        description,
        target_amount,
        start_date,
        end_date,
        donation_type,
        current_amount,
        bank_name,
        account_number,
        number_promtpay
    } = req.body;

    db.query('SELECT status, start_date, end_date FROM donationproject WHERE project_id = ?', [projectId], (err, result) => {
        if (err) {
            console.error('Error fetching project status:', err);
            return res.status(500).json({ success: false, error: 'Database error' });
        }

        if (result.length === 0) {
            return res.status(404).json({ success: false, error: 'Project not found' });
        }

        const oldStatus = parseInt(result[0].status);
        let newStatus = oldStatus; // เริ่มต้นด้วยสถานะเดิม

        // เช็กว่าโครงการสิ้นสุดแล้วหรือไม่
        if (oldStatus === 3) {
            // ไม่อนุญาตให้เปลี่ยนวันที่
            if (
                start_date !== result[0].start_date ||
                end_date !== result[0].end_date
            ) {
                return res.status(400).json({
                    success: false,
                    error: 'Cannot modify start/end date of a completed project.'
                });
            }
            // สถานะยังคงเป็น 3
        } else {
            // คำนวณสถานะใหม่ตามวันที่
            const now = moment();
            const startDateMoment = moment(start_date);
            const endDateMoment = moment(end_date);

            if (now.isBefore(startDateMoment, 'day')) {
                newStatus = 0; // ยังไม่เริ่ม
            } else if (now.isBetween(startDateMoment, endDateMoment, 'day', '[]')) {
                newStatus = 1; // กำลังดำเนินการ
            } else {
                newStatus = 3; // สิ้นสุดแล้ว
            }
        }

        let query, values;

        if (req.file) {
            query = `
                UPDATE donationproject 
                SET project_name = ?, description = ?, target_amount = ?, start_date = ?, end_date = ?, 
                    donation_type = ?, current_amount = ?, bank_name = ?, account_number = ?, 
                    number_promtpay = ?, status = ?, image_path = ?
                WHERE project_id = ?
            `;
            values = [
                project_name,
                description,
                target_amount,
                start_date,
                end_date,
                donation_type,
                current_amount || 0,
                bank_name,
                account_number,
                number_promtpay || null,
                newStatus,
                req.file.filename,
                projectId
            ];
        } else {
            query = `
                UPDATE donationproject 
                SET project_name = ?, description = ?, target_amount = ?, start_date = ?, end_date = ?, 
                    donation_type = ?, current_amount = ?, bank_name = ?, account_number = ?, 
                    number_promtpay = ?, status = ?
                WHERE project_id = ?
            `;
            values = [
                project_name,
                description,
                target_amount,
                start_date,
                end_date,
                donation_type,
                current_amount || 0,
                bank_name,
                account_number,
                number_promtpay || null,
                newStatus,
                projectId
            ];
        }

        db.query(query, values, (err, result) => {
            if (err) {
                console.error('Error updating donation project:', err);
                return res.status(500).json({
                    success: false,
                    error: 'Error updating donation project'
                });
            }

            if (result.affectedRows === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Project not found'
                });
            }

            res.status(200).json({
                success: true,
                message: 'Donation project updated successfully',
                projectId: projectId,
                imageUpdated: !!req.file,
                status: newStatus
            });
        });
    });
});

// ตรวจสอบการชำระเงินบริจาคทั้งหมด
route.get('/check-payment-donate', (req, res) => {
    const query = `
        SELECT 
            d.donation_id,
            d.amount,
            d.created_at AS start_date,
            d.payment_status,
            d.slip AS proof_image,
            dp.project_name,
            p.full_name AS donor_name,
            CONCAT('DONATE-', d.donation_id) AS order_number
        FROM donations d
        LEFT JOIN donationproject dp ON d.project_id = dp.project_id
        LEFT JOIN profiles p ON d.user_id = p.user_id
        WHERE d.deleted_at IS NULL
        ORDER BY d.created_at DESC
    `;

    db.query(query, (err, results) => {
        if (err) {
            console.error('Database query failed:', err);
            return res.status(500).json({ error: 'Database query failed' });
        }
        res.json(results);
    });
});


// ดึงรายละเอียดการชำระเงินจาก donation_id
route.get('/check-payment-donate/:id', (req, res) => {
    const donationId = req.params.id;

    const query = `
        SELECT 
            d.donation_id,
            d.amount,
            d.created_at,
            d.payment_status,
            d.slip AS proof_image,
            dp.project_name,
            p.full_name AS donor_name,
            CONCAT('DONATE-', d.donation_id) AS order_number
        FROM donations d
        LEFT JOIN donationproject dp ON d.project_id = dp.project_id
        LEFT JOIN profiles p ON d.user_id = p.user_id
        WHERE d.donation_id = ?
    `;

    db.query(query, [donationId], (err, results) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).json({ message: "เกิดข้อผิดพลาดในการดึงข้อมูล" });
        }

        if (results.length === 0) {
            return res.status(404).json({ message: "ไม่พบข้อมูลการบริจาคนี้" });
        }

        res.json(results[0]); // ส่งข้อมูลรายการเดียวกลับ
    });
});

// อนุมัติการชำระเงินและอัปเดตยอดเงินโครงการ
route.put('/check-payment-donate/approve/:donationId', (req, res) => {
    const donationId = req.params.donationId;

    // ดึงข้อมูล donation ก่อน
    const getDonationSql = `
        SELECT amount, project_id 
        FROM donations 
        WHERE donation_id = ? AND deleted_at IS NULL
    `;

    db.query(getDonationSql, [donationId], (err, donationResult) => {
        if (err) {
            console.error('Failed to fetch donation:', err);
            return res.status(500).json({ error: 'Failed to fetch donation' });
        }
        if (!donationResult.length) {
            return res.status(404).json({ error: 'Donation not found' });
        }

        const donation = donationResult[0];

        // อัปเดตยอดเงินในโครงการ
        const updateProjectSql = `
            UPDATE donationproject
            SET current_amount = current_amount + ?
            WHERE project_id = ?
        `;

        db.query(updateProjectSql, [donation.amount, donation.project_id], (err2) => {
            if (err2) {
                console.error('Failed to update project amount:', err2);
                return res.status(500).json({ error: 'Failed to update project amount' });
            }

            // อัปเดตสถานะการชำระเงินของ donation
            const updateDonationSql = `
                UPDATE donations
                SET payment_status = 'paid'
                WHERE donation_id = ?
            `;

            db.query(updateDonationSql, [donationId], (err3) => {
                if (err3) {
                    console.error('Failed to approve payment:', err3);
                    return res.status(500).json({ error: 'Failed to approve payment' });
                }

                res.json({ message: 'Payment approved and project amount updated successfully' });
            });
        });
    });
});

// ปฏิเสธการชำระเงิน
route.put('/check-payment-donate/reject/:donationId', (req, res) => {
    const donationId = req.params.donationId;

    const sql = `
    UPDATE donations
    SET payment_status = 'failed'
    WHERE donation_id = ?
  `;

    db.query(sql, [donationId], (err, result) => {
        if (err) {
            console.error('Failed to reject payment:', err);
            return res.status(500).json({ error: 'Failed to reject payment' });
        }
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Donation not found' });
        }
        res.json({ message: 'Payment rejected successfully', updatedStatus: 'failed' });
    });
});

route.post('/addsouvenir', upload.single('image'), (req, res) => {
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


// ขายของที่ระลึก
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

route.delete('/deleteSouvenir/:id', (req, res) => {
    const productId = req.params.id;

    const deleteProductQuery = 'DELETE FROM products WHERE product_id = ?';
    db.query(deleteProductQuery, [productId], (err, result) => {
        if (err) {
            console.error('Error deleting product:', err);
            return res.status(500).json({ error: 'Failed to delete product' });
        }
        res.status(200).json({ message: 'Product deleted successfully' });
    });
});

module.exports = route;