const express = require("express");
const route = express.Router();
const multer = require('multer');
const path = require('path');
const QRCode = require('qrcode');
const generatePayload = require('promptpay-qr');
var db = require('../db');
const cron = require('node-cron');


const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname);
    }
});

const authenticateUser = (req, res, next) => {
    if (req.session && req.session.user) {
        req.user = req.session.user;
        return next();
    }
    return res.status(401).json({ error: 'Unauthorized' });
};

const upload = multer({ storage: storage });

// ดึงโครงการทั้งหมด
route.get('/donate', (req, res) => {
    const query = 'SELECT * FROM donationproject WHERE status = "1"';
    console.log(query)
    db.query(query, (err, results) => {
        if (err) {
            console.error('Database query failed:', err);
            // res.status(500).json({ error: 'Database query failed' });
            // return;
        }
        console.log(results)
        res.json(results);
    });
});

// รอยืนยันการตั้งโครงการบริจาค
route.get('/donatePending', authenticateUser, (req, res) => {
    const userId = req.user.id;
    const query = `
  SELECT dp.*, p.full_name 
  FROM donationproject dp
  JOIN profiles p ON dp.user_id = p.user_id
  WHERE dp.status = "0" AND dp.user_id = ?
  ORDER BY dp.start_date DESC
`;
    db.query(query, [userId], (err, results) => {
        if (err) {
            console.error('Database query failed:', err);
            return res.status(500).json({ error: 'Database query failed' });
        }

        res.json(results);
    });
});


//รายละเอียดโครงการ
route.get('/donatedetail/:id', (req, res) => {
    const projectId = req.params.id;

    const query = `
        SELECT donationproject.*, profiles.full_name AS creator_name, users.role_id AS creator_role
        FROM donationproject
        JOIN profiles ON donationproject.user_id = profiles.user_id
        JOIN users ON donationproject.user_id = users.user_id
        
        WHERE donationproject.project_id = ?
    `;

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

// สร้างโครงการบริจาคใหม่
route.post('/donateRequest', upload.single('image'), (req, res) => {
    const { userId } = req.body;

    if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
    }

    const { projectName, description, targetAmount, startDate, endDate, donationType, currentAmount,
        bankName, accountName, accountNumber, numberPromtpay, forThings, typeThings, quantityThings } = req.body;

    const image = req.file ? req.file.filename : null;
    if (!image) {
        return res.status(400).json({ error: 'Image is required' });
    }

    const query = `
        INSERT INTO donationproject 
        (project_name, user_id, description, start_date, end_date, donation_type, image_path, 
        target_amount, current_amount, bank_name, account_name, account_number, number_promtpay, for_things, type_things, quantity_things) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
        projectName,
        userId,
        description,
        startDate,
        endDate,
        donationType,
        image,
        targetAmount,
        currentAmount,
        bankName,
        accountName,
        accountNumber,
        numberPromtpay,
        forThings,
        typeThings,
        quantityThings
    ];

    db.query(query, values, (err, result) => {
        if (err) {
            console.error('Error inserting donation project:', err);
            return res.status(500).json({ error: 'Error inserting donation project' });
        }

        const projectId = result.insertId;

        //สร้างข้อความแจ้งเตือนไปหาแอดมิน
        const notifyMessage = `มีคำขอสร้างโครงการบริจาคใหม่: "${projectName}"`;
        const notifyQuery = `
            INSERT INTO notifications (user_id, type, message, related_id, send_date, status)
            VALUES (?, ?, ?, ?, NOW(), 'ยังไม่อ่าน')
        `;

        // user_id = 1 (แอดมิน)
        const notifyValues = [1, 'donate-request', notifyMessage, projectId];

        db.query(notifyQuery, notifyValues, (err2) => {
            if (err2) {
                console.error('Error inserting notification:', err2);
            }

            res.status(200).json({
                message: 'Donation project added successfully',
                projectId: projectId,
                createdBy: userId
            });
        });
    });
});


const queryAsync = (query, values) => new Promise((resolve, reject) => {
    db.query(query, values, (err, results) => {
        if (err) reject(err);
        else resolve(results);
    });
});

//การบริจาค
route.post('/donation', upload.single('slip'), async (req, res) => {
    try {
        const {
            amount,
            userId,
            projectId,
            name,
            tax_number,
            email,
            phone,
            type_tax,
            useTax,
            useExistingTax,
            taxId
        } = req.body;

        console.log("Full req.body:", req.body); 

        const slip = req.file ? req.file.filename : null;
        // console.log("Uploaded file:", slip);

        // แปลง useTax เป็น boolean ใเอาใบกำกับภาษี
        const useTaxBool = useTax === "1" || useTax === 1 || useTax === true;

        let finalTaxId = null;

        //จัดการใบกำกับภาษี
        if (useTaxBool) {
            if (useExistingTax && taxId) {
                // ใช้ tax record ที่เลือก
                const taxIdNum = Array.isArray(taxId) ? taxId[0] : Number(taxId);
                const existingTax = await queryAsync(
                    `SELECT tax_id 
                    FROM tax_addresses 
                    WHERE tax_id = ? AND user_id = ? AND deleted_at IS NULL`,
                    [taxIdNum, userId]
                );

                if (existingTax.length > 0) {
                    finalTaxId = existingTax[0].tax_id;
                } else {
                    return res.status(400).json({ error: 'Tax record not found' });
                }
            } else {
                // ตรวจสอบข้อมูลภาษีก่อน insert
                if (!name || !tax_number) {
                    return res.status(400).json({ error: `Incomplete tax information for ${type_tax || "tax"}` });
                }

                //สร้าง tax record ใหม่
                const insertTaxQuery = `
                    INSERT INTO tax_addresses (user_id, name, tax_number, email, phone, type_tax)
                    VALUES (?, ?, ?, ?, ?, ?)
                `;
                const insertResult = await queryAsync(insertTaxQuery, [
                    userId,
                    name,
                    tax_number,
                    email || null,
                    phone || null,
                    type_tax || "individual" // กันค่า null
                ]);
                finalTaxId = insertResult.insertId;
            }
        }

        // บันทึกการบริจาค
        const insertDonationQuery = `
            INSERT INTO donations
            (project_id, user_id, amount, payment_status, slip, tax_id, use_tax)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        const donationResult = await queryAsync(insertDonationQuery, [
            projectId,
            userId,
            amount,
            'pending',
            slip,
            finalTaxId,                 // ถ้าไม่มี tax → null
            useTaxBool ? "1" : "0"      // เก็บ 0/1
        ]);

        return res.status(200).json({
            success: true,
            message: 'Donation completed successfully',
            donationId: donationResult.insertId
        });

    } catch (err) {
        console.error("Donation error:", err);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

route.get("/tax_addresses/user/:userId", async (req, res) => {
    const { userId } = req.params;

    try {
        const query = `
            SELECT tax_id, name, tax_number, phone, email
            FROM tax_addresses
            WHERE user_id = ? AND deleted_at IS NULL
        `;
        const results = await queryAsync(query, [userId]);

        res.status(200).json(results);
    } catch (err) {
        console.error("Error fetching tax addresses:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

route.get("/donatePaid", authenticateUser, (req, res) => {
    const userId = req.user.id;
    const query = `
        SELECT d.donation_id, d.amount, d.created_at, d.payment_status,d.slip,
               proj.project_name
        FROM donations d
        LEFT JOIN donationproject proj ON d.project_id = proj.project_id
        WHERE d.user_id = ?
        ORDER BY d.created_at DESC
    `;
    db.query(query, [userId], (err, results) => {
        if (err) {
            console.error('Database query failed:', err);
            return res.status(500).json({ error: 'Database query failed' });
        }
        res.json(results);
    });
});

// เพิ่ม endpoint สำหรับอัพโหลดสลิปใหม่
route.post("/upload-slip", authenticateUser, upload.single('slip'), (req, res) => {
    const { donation_id } = req.body;
    const userId = req.user.id;
    
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'ไม่พบไฟล์สลิป' });
    }
    
    const slip_path = `${req.file.filename}`;
    
    // ตรวจสอบว่าการบริจาคนี้เป็นของ user นี้จริงหรือไม่
    const checkQuery = 'SELECT donation_id FROM donations WHERE donation_id = ? AND user_id = ?';
    db.query(checkQuery, [donation_id, userId], (err, checkResults) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ success: false, message: 'Database error' });
        }
        
        if (checkResults.length === 0) {
            return res.status(403).json({ success: false, message: 'ไม่มีสิทธิ์แก้ไขการบริจาคนี้' });
        }
        
        // อัพเดตสลิปและเปลี่ยนสถานะเป็น pending
        const updateQuery = 'UPDATE donations SET slip = ?, payment_status = "pending" WHERE donation_id = ? AND user_id = ?';
        db.query(updateQuery, [slip_path, donation_id, userId], (err, result) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ success: false, message: 'ไม่สามารถอัพเดตข้อมูลได้' });
            }
            
            if (result.affectedRows === 0) {
                return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลการบริจาค' });
            }
            
            res.json({ success: true, slip: slip_path });
        });
    });
});

//เปลี่ยนสถานะโครงการบริจาคอัตโนมัติถ้ามันสิ้นสุดเวลาแล้ว
cron.schedule('0 0 * * *', () => {
    console.log('CRON: Checking expired donation projects ');

    const query = `
        UPDATE donationproject
        SET status = "3"
        WHERE end_date < NOW() AND status != "3"
    `;

    db.query(query, (err, result) => {
        if (err) {
            console.error('Failed to update donation statuses:', err);
        } else {
            console.log(`Updated ${result.affectedRows} expired project(s).`);
        }
    });
});

// เส้นทางสำหรับการสร้าง QR Code
route.post('/generateQR', (req, res) => {
    const amount = parseFloat(req.body.amount);

    const mobileNumber = req.body.numberPromtpay;
    if (!mobileNumber) {
        return res.status(400).json({
            RespCode: 400,
            RespMessage: 'Missing PromptPay number'
        });
    }

    const payload = generatePayload(mobileNumber, { amount });

    QRCode.toDataURL(payload, {
        color: {
            dark: '#000',
            light: '#FFF'
        }
    }, (err, url) => {
        if (err) {
            console.error('Error generating QR code:', err);
            return res.status(400).json({
                RespCode: 400,
                RespMessage: 'Error generating QR code: ' + err
            });
        }

        return res.status(200).json({
            RespCode: 200,
            RespMessage: 'QR Code generated successfully',
            Result: url
        });
    });
});

module.exports = route;