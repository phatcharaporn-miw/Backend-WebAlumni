const express = require("express");
const router = express.Router();
const multer = require('multer');
const path = require('path');
const db = require('../db');
const moment = require('moment');
var { LoggedIn, checkActiveUser } = require('../middlewares/auth');
const { logManage, logDonation } = require('../logUserAction');
const { log } = require("console");

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

// ส่วนของdonate 
router.get('/donate', (req, res) => {
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
        return res.status(403).json({ error: 'ไม่ได้รับอนุญาต' });
    }

    if (!req.file) {
        return res.status(400).json({ error: 'Image is required' });
    }

    const image = req.file.filename;

    const query = `
        INSERT INTO donationproject 
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

        // แจ้งเตือนแอดมิน 
        const notifyQuery = `
            INSERT INTO notifications (user_id, type, message, related_id, send_date, status)
            VALUES (?, 'ขอตั้งโครงการ', ?, ?, NOW(), 'ยังไม่อ่าน')
            ON DUPLICATE KEY UPDATE 
            message = VALUES(message),
            send_date = NOW(),
            status = 'ยังไม่อ่าน'
        `;

        const notifyValues = [
            1, // user_id ของ admin
            `มีการขอเพิ่มโครงการใหม่: ${projectName}`,
            result.insertId // เก็บ id ของโครงการที่เพิ่ง insert
        ];

        db.query(notifyQuery, notifyValues, (notifyErr) => {
            if (notifyErr) {
                console.error("Error inserting notification:", notifyErr);
            }
        });

        res.status(201).json({ message: 'Donation project added successfully' });
    });
});


// อนุมัติการบริจาคให้ตั้งโครงการ
router.put('/approveDonate/:id', (req, res) => {
    const projectId = req.params.id;

    // อัปเดตสถานะโครงการ
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

        // ดึง user_id ของเจ้าของโครงการ
        const getUserQuery = 'SELECT user_id, project_name FROM donationproject WHERE project_id = ?';
        db.query(getUserQuery, [projectId], (userErr, userResult) => {
            if (userErr) {
                console.error('Error fetching project owner:', userErr);
                return res.status(500).json({ error: 'Database error' });
            }

            if (userResult.length === 0) {
                return res.status(404).json({ error: 'Project not found after update' });
            }

            const userId = userResult[0].user_id;
            const projectName = userResult[0].project_name;

            // เพิ่มการแจ้งเตือน
            const notifyQuery = `
                INSERT INTO notifications (user_id, type, message, related_id, send_date, status)
                VALUES (?, 'อนุมัติโครงการ', ?, ?, NOW(), 'ยังไม่อ่าน')
            `;
            const notifyValues = [
                userId,
                `โครงการ "${projectName}" ของคุณได้รับการอนุมัติแล้ว`,
                projectId
            ];

            db.query(notifyQuery, notifyValues, (notifyErr) => {
                if (notifyErr) {
                    console.error("Error inserting notification:", notifyErr);
                }
            });

            // ส่ง response กลับไป
            res.status(200).json({
                message: 'Project approved and user notified successfully',
                projectId: projectId
            });
        });
    });
});


// ลบโครงการบริจาค
router.delete('/donate/:id', (req, res) => {
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
router.post('/donateRequest', upload.single('image'), (req, res) => {
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

// const moment = require('moment');
// แก้ไขโครงการบริจาค
router.put('/editDonate/:id', upload.single('image'), (req, res) => {
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
router.get('/check-payment-donate', (req, res) => {
    const query = `
        SELECT 
            d.donation_id,
            d.amount,
            d.created_at AS start_date,
            d.payment_status,
            d.slip,
            dp.project_name,
            dp.account_name,
            dp.bank_name,
            dp.account_number,
            dp.number_promtpay,
            p.full_name AS donor_name,
            CONCAT('DONATE-', d.donation_id) AS order_number
        FROM donations d
        LEFT JOIN donationproject dp ON d.project_id = dp.project_id
        LEFT JOIN profiles p ON d.user_id = p.user_id
        WHERE d.deleted_at IS NULL AND d.payment_status = 'pending'
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
router.get('/check-payment-donate/:id', (req, res) => {
    const donationId = req.params.id;

    const query = `
        SELECT 
            d.donation_id,
            d.amount,
            d.created_at,
            d.payment_status,
            d.slip AS proof_image,
            p.full_name AS donor_name,
            dp.project_name,
            dp.account_name,
            dp.bank_name,
            dp.account_number,
            dp.number_promtpay,
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
router.put('/check-payment-donate/approve/:donationId', (req, res) => {
    const donationId = req.params.donationId;
    const userId = req.body.user_id; // ID ของแอดมินที่อนุมัติ

    // ดึงข้อมูล donation ก่อน (รวม user_id ของผู้บริจาค)
    const getDonationSql = `
        SELECT amount, project_id, user_id 
        FROM donations 
        WHERE donation_id = ? AND deleted_at IS NULL
    `;

    db.query(getDonationSql, [donationId], (err, donationResult) => {
        if (err) {
            console.error('Failed to fetch donation:', err);
            return res.status(500).json({ success: false, message: 'Failed to fetch donation' });
        }
        if (!donationResult.length) {
            return res.status(404).json({ success: false, message: 'Donation not found' });
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
                return res.status(500).json({ success: false, message: 'Failed to update project amount' });
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
                    return res.status(500).json({ success: false, message: 'Failed to approve payment' });
                }

                // log การอนุมัติ
                logDonation(donationId, userId, "แอดมินยืนยันการชำระเงิน");

                // ส่งแจ้งเตือนให้ผู้บริจาค
                const insertNotificationSql = `
                    INSERT INTO notifications (user_id, type, message, related_id, send_date, status)
                    VALUES (?, 'payment-donate', ?, ?, NOW(), 'ยังไม่อ่าน')
                `;

                const message = 'การบริจาคของคุณได้รับการยืนยันเรียบร้อยแล้ว';
                
                db.query(insertNotificationSql, [donation.user_id, message, donationId], (err4) => {
                    if (err4) {
                        console.error('Failed to insert notification:', err4);
                        // ยังคงส่ง response สำเร็จเพราะการอนุมัติเสร็จแล้ว
                        return res.json({ 
                            success: true, 
                            message: 'Payment approved and project amount updated successfully, but notification failed' 
                        });
                    }
                    
                    console.log('Notification sent successfully to user:', donation.user_id);
                    res.json({ 
                        success: true, 
                        message: 'Payment approved, project amount updated, and notification sent successfully' 
                    });
                });
            });
        });
    });
});


// ปฏิเสธการชำระเงิน
router.put('/check-payment-donate/reject/:donationId', (req, res) => {
    const { donationId } = req.params;
    const { reject_reason, admin_id } = req.body;

    // อัปเดตสถานะ donation และดึง user_id ในครั้งเดียว
    const sql = `
        UPDATE donations
        SET payment_status = 'failed',
            reject_reason = ?
        WHERE donation_id = ?
    `;

    db.query(sql, [reject_reason, donationId], (err, result) => {
        if (err) {
            console.error('Failed to reject payment:', err);
            return res.status(500).json({ success: false, message: 'Failed to reject payment' });
        }
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Donation not found' });
        }

        // ดึง user_id ของ donation ที่ถูกอัปเดต
        const getUserSql = `SELECT user_id FROM donations WHERE donation_id = ?`;
        db.query(getUserSql, [donationId], (err2, rows) => {
            if (err2 || rows.length === 0) {
                console.error('Failed to get user_id:', err2);
                return res.json({ success: true, message: 'Payment rejected but user not found', updatedStatus: 'failed' });
            }

            const userId = rows[0].user_id;

            // log การปฏิเสธ
            logDonation(admin_id, donationId, "แอดมินปฏิเสธการชำระเงิน");

            // insert notification
            const message = 'การบริจาคโดนปฏิเสธ กรุณาอัปโหลดสลิปใหม่';
            const insertNotificationSql = `
                INSERT INTO notifications (user_id, type, message, related_id, send_date)
                VALUES (?, 'reject-donate', ?, ?, NOW())
                ON DUPLICATE KEY UPDATE 
                    message = VALUES(message),
                    send_date = NOW(),
                    status = 'ยังไม่อ่าน';
            `;

            db.query(insertNotificationSql, [userId, message, donationId], (err3) => {
                if (err3) {
                    console.error('Failed to insert notification:', err3);
                    // ไม่ return res.status ซ้ำ ให้ส่ง response สำเร็จแล้ว
                    return res.json({ success: true, message: 'Payment rejected but notification failed', updatedStatus: 'failed' });
                }

                res.json({ success: true, message: 'Payment rejected successfully', updatedStatus: 'failed' });
            });
        });
    });
});


// เปลี่ยนสถานะโครงการบริจาค
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


// เพิ่มสินค้าที่ระลึก
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
        products.*, role.role_id , profiles.full_name
        FROM products 
        JOIN users ON products.user_id = users.user_id
        JOIN role ON users.role_id = role.role_id
        JOIN profiles ON users.user_id = profiles.user_id
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

// การอนุมัติสินค้า
router.put('/approveSouvenir/:productId', (req, res) => {
    const productId = req.params.productId;
    const approverId = req.body.approver_id;
    const action = req.body.action || 'approved';

    if (!productId || !approverId) {
        return res.status(400).json({ error: 'Product ID and Approver ID are required' });
    }

    const getProductQuery = 'SELECT product_name, user_id FROM products WHERE product_id = ?';
    db.query(getProductQuery, [productId], (err, productResult) => {
        if (err) return res.status(500).json({ error: 'Database error (product)' });
        if (productResult.length === 0) return res.status(404).json({ error: 'Product not found' });

        const { product_name: productName, user_id: ownerId } = productResult[0];

        const getApproverQuery = `
            SELECT profiles.full_name, role.role_name 
            FROM users
            JOIN profiles ON users.user_id = profiles.user_id
            JOIN role ON users.role_id = role.role_id
            WHERE users.user_id = ?
        `;
        db.query(getApproverQuery, [approverId], (err, approverResult) => {
            if (err) return res.status(500).json({ error: 'Database error (approver)' });
            if (approverResult.length === 0) return res.status(404).json({ error: 'Approver not found' });

            const approverName = approverResult[0].full_name;
            const approverRole = approverResult[0].role_name;

            // Step 1: Log ก่อน
            const insertLog = `
                INSERT INTO product_approval_log (product_id, approver_id, approver_name, approver_role, action)
                VALUES (?, ?, ?, ?, ?)
            `;
            db.query(insertLog, [productId, approverId, approverName, approverRole, action], (err) => {
                if (err) return res.status(500).json({ error: 'Error logging approval' });

                // Step 2: แจ้งเตือนเจ้าของ
                const message = action === 'approved'
                    ? `สินค้าของคุณ "${productName}" ได้รับการอนุมัติแล้ว!`
                    : `สินค้าของคุณ "${productName}" ถูกปฏิเสธและจะไม่ถูกแสดงบนเว็บไซต์`;

                const notifyQuery = `
                    INSERT INTO notifications (user_id, type, message, related_id, send_date, status) 
                    VALUES (?, 'approve', ?, ?, NOW(), 'ยังไม่อ่าน')
                    ON DUPLICATE KEY UPDATE 
                        message = VALUES(message),
                        send_date = NOW(),
                        status = 'ยังไม่อ่าน';
                    `;
                db.query(notifyQuery, [ownerId, message, productId], (err) => {
                    if (err) return res.status(500).json({ error: 'Error sending notification' });

                    // Step 3: อัปเดตหรือ ลบจริง
                    if (action === 'approved') {
                        db.query('UPDATE products SET status = ? WHERE product_id = ?', ['1', productId], (err) => {
                            if (err) return res.status(500).json({ error: 'Error updating product status' });
                            return res.status(200).json({ message: 'Product approved and logged' });
                        });
                    } else if (action === 'rejected') {
                        db.query('DELETE FROM products WHERE product_id = ?', [productId], (err) => {
                            if (err) return res.status(500).json({ error: 'Error deleting rejected product' });
                            return res.status(200).json({ message: 'Product rejected, logged, and deleted' });
                        });
                    } else {
                        return res.status(400).json({ error: 'Invalid action type' });
                    }
                });
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


// ลบสินค้า
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
            ON DUPLICATE KEY UPDATE 
            message = VALUES(message),
            send_date = NOW(),
            status = 'ยังไม่อ่าน';
        `;
        const message = `สินค้าของคุณ "${productName}" ถูกลบ`;
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
router.get('/activity-summary', LoggedIn, checkActiveUser, (req, res) => {
    const querySummary = `
    SELECT 
        (SELECT COUNT(*) FROM activity WHERE deleted_at IS NULL) AS total_activities, -- กิจกรรมทั้งหมด
        (SELECT COUNT(*) FROM participants WHERE activity_id IN (SELECT activity_id FROM activity WHERE deleted_at IS NULL)) AS total_participants, -- ผู้เข้าร่วมทั้งหมด
        (SELECT COUNT(*) FROM activity WHERE activity_date > CURDATE() AND deleted_at IS NULL) AS upcoming_activities, -- กิจกรรมที่ยังไม่ได้เริ่ม
        (SELECT COUNT(*) FROM activity WHERE COALESCE(end_date, activity_date) < CURDATE() AND deleted_at IS NULL) AS completed_activities, -- กิจกรรมที่สิ้นสุดแล้ว
        (SELECT COUNT(*) FROM activity WHERE activity_date <= CURDATE() AND COALESCE(end_date, activity_date) >= CURDATE() AND deleted_at IS NULL) AS ongoing_activities -- กิจกรรมที่กำลังดำเนินการ
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

//จัดการผู้ใช้
// ดึงข้อมูลผู้ใช้ทั้งหมด
router.get('/users', (req, res) => {
    const query = `
        SELECT 
            users.user_id, 
            users.role_id, 
            users.is_active,
            role.role_name,  
            profiles.full_name, 
            profiles.email        
        FROM users 
        LEFT JOIN profiles ON users.user_id = profiles.user_id
        LEFT JOIN role ON users.role_id = role.role_id
        WHERE users.deleted_at IS NULL
    `;
    db.query(query, (err, results) => {
        if (err) {
            console.error('Database query failed:', err);
            return res.status(500).json({ error: 'Database query failed' });
        }
        res.json(results);
    });
});

// ส่วนของผู้ใช้
// ดึงข้อมูลผู้ใช้ตาม ID
router.get('/users/:userId', (req, res) => {
    const { userId } = req.params;

    const query = `
        SELECT 
            users.user_id, 
            users.role_id,  
            role.role_name,
            users.is_active,
            profiles.full_name, 
            profiles.email, 
            profiles.phone, 
            profiles.address,
            profiles.image_path,
            educations.education_id,
            educations.degree_id,
            educations.major_id,
            educations.studentId,
            educations.graduation_year,
            educations.entry_year,
            degree.degree_name,
            major.major_name
        FROM users 
        LEFT JOIN profiles ON users.user_id = profiles.user_id
        LEFT JOIN role ON users.role_id = role.role_id
        LEFT JOIN educations ON users.user_id = educations.user_id
        LEFT JOIN degree ON educations.degree_id = degree.degree_id
        LEFT JOIN major ON educations.major_id = major.major_id
        WHERE users.user_id = ? 
    `;

    const queryactivity = `
    SELECT 
      participants.activity_id,
      activity.activity_name,
      activity.activity_date,
      activity.description,
       (
        SELECT activity_image.image_path 
        FROM activity_image 
        WHERE activity_image.activity_id = activity.activity_id 
        LIMIT 1
      ) AS image_path,
      COALESCE(end_date, activity_date) AS end_date, 
      CASE
        WHEN COALESCE(end_date, activity_date) < CURDATE() THEN 1  -- เสร็จแล้ว (1)
        WHEN activity_date > CURDATE() THEN 0  -- กำลังจะจัดขึ้น (0)
        ELSE 2  -- กำลังดำเนินการ (2)
      END AS status
    FROM participants
    JOIN activity ON participants.activity_id = activity.activity_id
    WHERE participants.user_id = ?
    `;

    const queryWebboard = `
        SELECT webboard_id, title, created_at
        FROM webboard
        WHERE user_id = ? AND deleted_at IS NULL
    `;

    db.query(query, [userId], (err, results) => {
        if (err) {
            console.error('Error fetching user profile:', err);
            return res.status(500).json({ success: false, message: 'Database error' });
        }

        if (results.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // กรณีผู้ใช้มีหลายวุฒิการศึกษา
        const userInfo = {
            user_id: results[0].user_id,
            role_id: results[0].role_id,
            role_name: results[0].role_name,
            is_active: results[0].is_active,
            full_name: results[0].full_name,
            email: results[0].email,
            phone: results[0].phone,
            address: results[0].address,
            image_path: results[0].image_path,
            educations: results.map(edu => ({
                degree: edu.degree_id,
                degree_name: edu.degree_name,
                major: edu.major_id,
                major_name: edu.major_name,
                studentId: edu.studentId,
                graduation_year: edu.graduation_year,
                entry_year: edu.entry_year,
            })),
        };

        // ดึงกิจกรรมและโพสต์พร้อมกัน
        db.query(queryactivity, [userId], (errAct, actResults) => {
            if (errAct) {
                console.error("Error fetching activities:", errAct);
                return res.status(500).json({ success: false, message: 'Error fetching activities' });
            }

            db.query(queryWebboard, [userId], (errPost, postResults) => {
                if (errPost) {
                    console.error("Error fetching posts:", errPost);
                    return res.status(500).json({ success: false, message: 'Error fetching posts' });
                }

                userInfo.activities = actResults || [];
                userInfo.posts = postResults || [];

                res.status(200).json({ success: true, data: userInfo });
            });
        });
    });
});

// แก้ไขโปรไฟล์ผู้ใช้
router.put('/edit-profile-users/:userId', (req, res) => {
    console.log("Request body:", req.body);
    const userId = req.params.userId;
    const { email, phone, address, educations } = req.body;

    const queryUpdateProfile = `UPDATE profiles SET email = ?, phone = ?, address = ? WHERE user_id = ?`;
    db.query(queryUpdateProfile, [email, phone, address, userId], (err) => {
        if (err) {
            console.error("Profile update error:", err);
            return res.status(500).json({ success: false, message: "อัปเดตโปรไฟล์ล้มเหลว" });
        }

        const deleteEducations = `DELETE FROM educations WHERE user_id = ?`;
        db.query(deleteEducations, [userId], (err) => {
            if (err) {
                console.error("Education delete error:", err);
                return res.status(500).json({ success: false, message: "ลบข้อมูลการศึกษาล้มเหลว" });
            }

            if (educations && educations.length > 0) {
                const filtered = educations.filter(e =>
                    e.degree_id && e.major_id && e.studentId && e.graduation_year
                );

                if (filtered.length === 0) {
                    return res.status(400).json({ success: false, message: "ข้อมูลการศึกษาไม่ครบถ้วน" });
                }

                const insertEduSql = `
                    INSERT INTO educations (user_id, degree_id, major_id, studentId, graduation_year, entry_year)
                    VALUES ?
                `;
                const values = filtered.map(e => [
                    userId,
                    e.degree_id,
                    e.major_id,
                    e.studentId,
                    e.graduation_year,
                    e.entry_year,
                ]);

                db.query(insertEduSql, [values], (err, result) => {
                    if (err) {
                        console.error("Education insert error:", err);
                        return res.status(500).json({ success: false, message: "เพิ่มข้อมูลการศึกษาล้มเหลว" });
                    }

                    logManage(userId, 'แก้ไขโปรไฟล์ผู้ใช้');
                    return res.json({ success: true, message: "อัปเดตข้อมูลสำเร็จ" });
                });

            } else {
                logManage(userId, 'แก้ไขโปรไฟล์ผู้ใช้ (ไม่มีข้อมูลการศึกษา)');
                return res.json({ success: true, message: "อัปเดตข้อมูลสำเร็จ (ไม่มีข้อมูลการศึกษาใหม่)" });
            }
        });
    });
});

// Get all degrees
router.get("/degrees", (req, res) => {
    db.query("SELECT degree_id, degree_name FROM degree", (err, result) => {
        if (err) return res.status(500).json([]);
        res.json(result);
    });
});

// Get all majors
router.get("/majors", (req, res) => {
    db.query("SELECT major_id, major_name FROM major", (err, result) => {
        if (err) return res.status(500).json([]);
        res.json(result);
    });
});


// เปลี่ยนบทบาทผู้ใช้
router.put('/:userId/role', (req, res) => {
    const { userId } = req.params;
    const { role } = req.body; // ค่าroleใหม่ที่ได้รับจาก frontend

    const query = "UPDATE users SET role_id = ? WHERE user_id = ?";
    db.query(query, [role, userId], (err, results) => {
        if (err) {
            console.error("Error updating role:", err);
            return res.status(500).send("Error updating role");
        }

        // console.log("Role updated successfully for user ID:", userId);
        logManage(userId, 'เปลี่ยนบทบาทผู้ใช้');

        res.send("เปลี่ยนบทบาทผู้ใช้สำเร็จ");
    });
});

// ลบผู้ใช้ (Soft Delete)
router.delete("/delete-user/:userId", (req, res) => {
    const { userId } = req.params;

    const query = "UPDATE users SET deleted_at = NOW() WHERE user_id = ?";
    db.query(query, [userId], (err, results) => {
        if (err) {
            console.error("Error soft-deleting user:", err);
            return res.status(500).send("เกิดข้อผิดพลาดในการลบผู้ใช้");
        }

        // ตรวจสอบว่ามีการอัปเดตแถวจริงหรือไม่
        if (results.affectedRows === 0) {
            return res.status(404).send("ไม่พบผู้ใช้ที่ต้องการลบ");
        }

        //บันทึก log
        logManage(userId, 'ลบผู้ใช้');

        res.send("ลบผู้ใช้สำเร็จ");
    });
});


// เปลี่ยนสถานะผู้ใช้ (เปิดใช้งาน/ระงับ)
router.put("/:userId/status", (req, res) => {
    const { userId } = req.params;
    const { is_active } = req.body; // ค่าสถานะที่ได้รับจาก frontend

    const query = "UPDATE users SET is_active = ? WHERE user_id = ?";
    db.query(query, [is_active, userId], (err, results) => {
        if (err) {
            console.error("Error updating status:", err);
            return res.status(500).send("Error updating status");
        }

        logManage(userId, 'เปลี่ยนสถานะผู้ใช้');
        res.send("User status updated successfully");
    });
});

// ส่วน dashboard
// จำนวนศิษย์เก่าทั้งหมด 
router.get('/total-alumni', (req, res) => {
    const query = 'SELECT COUNT(*) AS totalAlumni FROM users WHERE role_id = 3';
    db.query(query, (err, results) => {
        if (err) {
            console.error('Database query failed:', err);
            return res.status(500).json({ error: 'Database query failed' });
        }
        res.json(results[0]);
    });
});

// จำนวนกิจกรรมในแต่ละปี
router.get('/activity-per-year', (req, res) => {
    const query = `
        SELECT 
            YEAR(activity_date) AS year, 
            COUNT(*) AS total_activities 
        FROM activity 
        WHERE deleted_at IS NULL
        GROUP BY YEAR(activity_date)
    `;
    db.query(query, (err, results) => {
        if (err) {
            console.error('Database query failed:', err);
            return res.status(500).json({ error: 'Database query failed' });
        }
        res.json(results);
    });
});

// สถิติการบริจาคแยกตามประเภทโครงการ
router.get('/donation-stats', (req, res) => {
    const query = `
        SELECT p.donation_type, SUM(d.amount) AS total
        FROM donations d
        JOIN donationproject p ON d.project_id = p.project_id
        WHERE d.payment_status = 'paid' AND p.status = "1"
        GROUP BY p.donation_type
    `;

    db.query(query, (err, results) => {
        if (err) {
            console.error("Error fetching donation stats:", err);
            return res.status(500).json({ message: "Internal server error" });
        }

        // mapping ประเภทการบริจาคเป็นภาษาไทย
        const typeMap = {
            unlimited: "บริจาคแบบไม่จำกัดจำนวน",
            fundraising: "บริจาคแบบระดมทุน",
            things: "บริจาคสิ่งของ"
        };

        // ส่งข้อมูลให้ง่ายต่อการใช้ใน Pie Chart
        const formatted = results.map(row => ({
            donation_type: typeMap[row.donation_type] || row.donation_type,
            total: row.total || 0
        }));

        res.json(formatted);
    });
});

router.get('/dashboard-stats', (req, res) => {
    let result = {
        totalParticipants: 0,
        ongoingActivity: 0,
        ongoingProject: 0,
        totalDonations: 0,
    };

    // 1. นับผู้เข้าร่วม
    db.query('SELECT COUNT(*) AS total FROM participants', (err, participants) => {
        if (err) return res.status(500).json({ message: 'Internal server error' });
        result.totalParticipants = participants[0].total;

        // 2. นับกิจกรรมที่กำลังดำเนินการ
        db.query("SELECT COUNT(*) AS total FROM activity WHERE status = 1", (err, activities) => {
            if (err) return res.status(500).json({ message: 'Internal server error' });
            result.ongoingActivity = activities[0].total;

            // 3. นับโครงการที่กำลังดำเนินการ
            const projectQuery = `
                SELECT COUNT(DISTINCT p.project_id) AS total
                FROM donationproject p
                LEFT JOIN donations d 
                  ON p.project_id = d.project_id 
                  AND d.payment_status = 'paid'
                WHERE p.status = "1"
            `;
            db.query(projectQuery, (err, donationproject) => {
                if (err) return res.status(500).json({ message: 'Internal server error' });
                result.ongoingProject = donationproject[0].total;

                // 4. รวมยอดเงินบริจาค
                const donationQuery = `
                    SELECT SUM(d.amount) AS total
                    FROM donations d
                    JOIN donationproject p ON d.project_id = p.project_id
                    WHERE  d.payment_status = 'paid'
                `;
                db.query(donationQuery, (err, donations) => {
                    if (err) return res.status(500).json({ message: 'Internal server error' });
                    result.totalDonations = donations[0].total;

                    res.json(result);
                });
            });
        });
    });
});

router.get('/notification-counts', (req, res) => {
    const query1 = `SELECT COUNT(*) AS count FROM donationproject WHERE status = 0`;
    const query2 = `SELECT COUNT(*) AS count FROM products WHERE status = "0"`;

    db.query(query1, (err, result1) => {
        if (err) return res.status(500).json({ error: 'Query error 1' });

        db.query(query2, (err, result2) => {
            if (err) return res.status(500).json({ error: 'Query error 2' });

            res.json({
                donationRequests: result1[0].count,
                souvenirRequests: result2[0].count
            });
        });
    });
});



module.exports = router;