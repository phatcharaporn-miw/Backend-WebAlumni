const express = require("express");
const route = express.Router();
const multer = require('multer');
const { SystemlogAction } = require('../logUserAction');
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

// ดึงบัญชีธนาคาร
route.get('/bank-info', (req, res) => {
    const query = `
        SELECT 
            bank_name, 
            account_name, 
            account_number, 
            promptpay_number 
        FROM payment_methods 
        WHERE is_official = 1 
        LIMIT 1
    `;

    db.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching bank info:', err);
            return res.status(500).json({ error: 'Error fetching bank info' });
        }

        if (results.length === 0) {
            return res.status(404).json({ error: 'Bank info not found' });
        }

        res.status(200).json(results[0]);
    });
});

// ดึงโครงการทั้งหมด
route.get('/donate', (req, res) => {
    const query = 'SELECT * FROM donationproject ';
    console.log(query)
    db.query(query, (err, results) => {
        if (err) {
            console.error('Database query failed:', err);
        }
        // console.log(results)
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
        SELECT donationproject.*, profiles.full_name AS creator_name, users.role_id AS creator_role,
        payment_methods.*
        FROM donationproject
        JOIN profiles ON donationproject.user_id = profiles.user_id
        JOIN users ON donationproject.user_id = users.user_id
        JOIN payment_methods ON donationproject.payment_method_id = payment_methods.payment_method_id
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
route.post('/donateRequest', upload.single('image'), async (req, res) => {
    try {
        const userId = req.session.user?.id;
        const ipAddress = req.ip;

        if (!userId) {
            return res.status(400).json({ error: 'User ID is required' });
        }

        const {
            projectName,
            description,
            targetAmount,
            startDate,
            endDate,
            donationType,
            currentAmount,
            paymentMethod,
            bankName,
            accountName,
            accountNumber,
            numberPromtpay,
            forThings,
            typeThings,
            quantityThings
        } = req.body;

        const image = req.file ? req.file.filename : null;
        if (!image) {
            return res.status(400).json({ error: 'Image is required' });
        }

        // เพิ่มช่องทางการชำระเงิน
        const insertPaymentQuery = `
            INSERT INTO payment_methods (method_name, bank_name, account_name, account_number, promptpay_number)
            VALUES (?, ?, ?, ?, ?)
        `;
        const paymentValues = [
            paymentMethod || null,
            bankName || null,
            accountName || null,
            accountNumber || null,
            numberPromtpay || null
        ];
        const paymentResult = await queryAsync(insertPaymentQuery, paymentValues);
        const paymentMethodId = paymentResult.insertId;

        // กำหนดสถานะอัตโนมัติ
        const today = new Date();
        const start = new Date(startDate);
        const end = new Date(endDate);

        let status = 0; // กำลังจะจัดขึ้น
        if (today >= start && today <= end) status = 1; // กำลังดำเนินการ
        else if (today > end) status = 3; // สิ้นสุดแล้ว

        const diffDays = Math.ceil((end - today) / (1000*60*60*24));
        if (status === 1 && diffDays <= 3) status = 2; // ใกล้สิ้นสุด

        // เพิ่มโครงการบริจาค
        const insertProjectQuery = `
            INSERT INTO donationproject 
            (project_name, user_id, description, start_date, end_date, donation_type, image_path, 
             target_amount, current_amount, for_things, type_things, quantity_things, status, payment_method_id) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
        `;
        const projectValues = [
            projectName,
            userId,
            description,
            startDate,
            endDate,
            donationType,
            image,
            targetAmount || 0,
            currentAmount || 0,
            forThings || null,
            typeThings || null,
            quantityThings || null,
            status,
            paymentMethodId
        ];
        const projectResult = await queryAsync(insertProjectQuery, projectValues);
        const projectId = projectResult.insertId;

        // บันทึก System log
        await SystemlogAction(
            userId,
            'DonationProject', // moduleName
            'CREATE',          // actionType
            `สร้างโครงการบริจาค: "${projectName}" สถานะ: ${status}`, // description
            ipAddress,
            projectId          // relatedId
        );

        // ตอบกลับสำเร็จ
        res.status(200).json({
            success: true,
            message: 'สร้างโครงการบริจาคเรียบร้อยแล้ว',
            projectId,
            paymentMethodId,
            createdBy: userId
        });

    } catch (err) {
        console.error('Error donateRequest:', err);
        res.status(500).json({ success: false, error: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล' });
    }
});


// Utility: queryAsync
const queryAsync = (query, values = []) => {
    return new Promise((resolve, reject) => {
        db.query(query, values, (err, results) => {
            if (err) reject(err);
            else resolve(results);
        });
    });
};



// ที่ปรับให้รองรับแบบไม่มีโครงการด้วย
route.post('/donation', upload.single('slip'), async (req, res) => {
    try {
        const userId = req.session.user?.id;
        const ipAddress = req.ip;

        if (!userId) {
            return res.status(400).json({ error: 'User ID is required' });
        }

        const {
            amount,
            projectId,
            name,
            tax_number,
            email,
            phone,
            type_tax,
            useTax,
            useExistingTax,
            taxId,
            purpose,
        } = req.body;

        const normalizeValue = (val) => Array.isArray(val) ? val[0] : val;
        const normUseTax = normalizeValue(useTax);
        const normUseExistingTax = normalizeValue(useExistingTax);
        const normTaxId = normalizeValue(taxId);
        const useTaxBool = normUseTax === "1" || normUseTax === 1 || normUseTax === true;
        const useExistingTaxBool = normUseExistingTax === "1" || normUseExistingTax === 1 || normUseExistingTax === true;
        const taxIdNum = normTaxId ? Number(normTaxId) : null;

        const slip = req.file ? req.file.filename : null;
        let finalTaxId = null;

        const amountNum = parseFloat(amount);
        if (isNaN(amountNum) || amountNum <= 0) {
            return res.status(400).json({ error: "จำนวนเงินไม่ถูกต้อง" });
        }

        // จัดการใบกำกับภาษี
        if (useTaxBool) {
            if (useExistingTaxBool && taxIdNum) {
                const [existingTax] = await queryAsync(
                    `SELECT tax_id FROM tax_addresses WHERE tax_id = ? AND user_id = ? AND deleted_at IS NULL`,
                    [taxIdNum, userId]
                );
                if (!existingTax) {
                    return res.status(400).json({ error: 'ไม่พบข้อมูลใบกำกับภาษีที่เลือก' });
                }
                finalTaxId = existingTax.tax_id;
            } else {
                if (!name || !tax_number) {
                    return res.status(400).json({ error: 'กรุณากรอกข้อมูลใบกำกับภาษีให้ครบถ้วน' });
                }
                const insertTaxQuery = `
                    INSERT INTO tax_addresses (user_id, name, tax_number, email, phone, type_tax)
                    VALUES (?, ?, ?, ?, ?, ?)
                `;
                const insertResult = await queryAsync(insertTaxQuery, [
                    userId, name, tax_number, email || null, phone || null, type_tax || "individual"
                ]);
                finalTaxId = insertResult.insertId;
            }
        }

        const taxStatus = useTaxBool ? "requested" : "none";

        // ดึงชื่อโครงการ (ถ้ามี)
        let projectName = "บริจาคทั่วไป";
        if (projectId) {
            const [proj] = await queryAsync(`SELECT project_name FROM donationproject WHERE project_id = ?`, [projectId]);
            projectName = proj ? proj.project_name : projectName;
        }

        // บันทึก donation
        const insertDonationQuery = `
            INSERT INTO donations
            (project_id, user_id, amount, purpose, payment_status, slip, tax_id, use_tax, tax_status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const donationResult = await queryAsync(insertDonationQuery, [
            projectId || null, userId, amountNum, purpose, 'pending', slip, finalTaxId,
            useTaxBool ? "1" : "0", taxStatus
        ]);

        const donationId = donationResult.insertId;

        // แจ้งเตือน admin
        const adminUsers = await queryAsync(`SELECT user_id FROM users WHERE role_id = 1`);
        const now = new Date();
        const notificationMessage = `มีการบริจาคใหม่ในโครงการ "${projectName}" จำนวน ${amountNum.toLocaleString()} บาท`;

        for (const admin of adminUsers) {
            await queryAsync(
                `INSERT INTO notifications (user_id, type, message, related_id, send_date, status)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [admin.user_id, 'donation', notificationMessage, donationId, now, 'ยังไม่อ่าน']
            );
        }

        // บันทึก System log
        await SystemlogAction(
            userId,
            'Donation', // moduleName
            'CREATE',   // actionType
            `มีการบริจาคใหม่ จำนวน ${amountNum.toLocaleString()} บาท โครงการ: "${projectName}"`, // description
            ipAddress,
            donationId // relatedId
        );

        return res.status(200).json({
            success: true,
            message: 'Donation completed successfully',
            donationId
        });

    } catch (err) {
        console.error("Donation error:", err);
        return res.status(500).json({ error: 'Internal server error', details: err.message });
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

// ดึงที่อยู่ที่มีสถานะis_official = 1[ที่เพิ่ม]
route.get("/officialAddress", (req, res) => {
    const query = `
        SELECT * 
        FROM payment_methods
        WHERE is_official = 1
    `;
    db.query(query, (err, results) => {
        if (err) {
            console.error('Database query failed:', err);
            return res.status(500).json({ error: 'Database query failed' });
        }
        res.json(results);
        console.log(results)
    });
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

//เปลี่ยนสถานะโครงการบริจาคอัตโนมัติถ้ามันสิ้นสุดเวลาแล้ว status = 3
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

// ดึงคนบริจาคล่าสุด 3 คน
route.get('/recent-donation', (req, res) => {
    const query = `
        SELECT 
    d.donation_id, 
    d.amount, 
    d.created_at AS donation_date, 
    p.full_name, 
    p.image_path AS profile_image,
    dp.project_name  
FROM donations d
JOIN profiles p ON d.user_id = p.user_id
LEFT JOIN donationproject dp ON d.project_id = dp.project_id

ORDER BY d.created_at DESC LIMIT 3
    `;
    // WHERE d.payment_status = 'paid'
    db.query(query, (err, results) => {
        if (err) {
            console.error('Database query failed:', err);
            return res.status(500).json({ error: 'Database query failed' });
        }
        res.json(results);
    });
});


// คำนวนยอดบริจาคทั้งหมด [ที่เพิ่ม]
route.get('/donation-summary', (req, res) => {
    const query = `
    SELECT 
      SUM(CASE WHEN d.project_id IS NOT NULL THEN d.amount ELSE 0 END) AS totalProjectsAmount,
      SUM(CASE WHEN d.project_id IS NULL THEN d.amount ELSE 0 END) AS totalGeneralAmount
    FROM donations d
    WHERE d.payment_status = 'paid'
  `;

    db.query(query, (err, results) => {
        if (err) {
            console.error("Database query failed:", err);
            return res.status(500).json({ error: "Database query failed" });
        }

        const summary = results[0] || { totalProjectsAmount: 0, totalGeneralAmount: 0 };

        summary.totalProjectsAmount = Number(summary.totalProjectsAmount) || 0;
        summary.totalGeneralAmount = Number(summary.totalGeneralAmount) || 0;
        summary.totalDonations = summary.totalProjectsAmount + summary.totalGeneralAmount;

        res.json(summary);
    });
});


// รายละเอียดการบริจาคแยกตามประเภท [ที่เพิ่ม]
route.get('/donation-summary-details/:type?', (req, res) => {
    const { type } = req.params;
    // console.log("Received type:", type);
    // console.log("Received filters:", req.query);

    let whereClause = "";
    if (type === "general") {
        whereClause = "WHERE d.project_id IS NULL";
    } else if (type === "project") {
        whereClause = "WHERE d.project_id IS NOT NULL";
    }

    const query = `
        SELECT 
            d.donation_id,
            dp.project_id,
            dp.project_name,
            p.full_name,
            p.image_path,
            d.amount,
            d.payment_status,
            d.created_at AS donation_date
        FROM donations d
        LEFT JOIN donationproject dp ON d.project_id = dp.project_id
        LEFT JOIN profiles p ON d.user_id = p.user_id
        ${whereClause} ${whereClause ? "AND" : "WHERE"} d.payment_status = 'paid'
        ORDER BY d.created_at DESC
    `;

    db.query(query, (err, results) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).json({ error: "Database query failed" });
        }

        const safeResults = results.map(r => ({
            ...r,
            amount: parseFloat(r.amount),
            project_name: r.project_name
        }));

        res.json(safeResults);
    });
});



// 1. รายละเอียดบริจาคโครงการ
route.get('/donation-summary-details/project', (req, res) => {
    const { startDate, endDate, minAmount, maxAmount } = req.query;

    let conditions = [
        "d.payment_status = 'paid'",
        "d.project_id IS NOT NULL"  // เฉพาะบริจาคโครงการ
    ];
    const params = [];

    if (startDate) {
        conditions.push("DATE(d.created_at) >= ?");
        params.push(startDate);
    }

    if (endDate) {
        conditions.push("DATE(d.created_at) <= ?");
        params.push(endDate);
    }

    if (minAmount) {
        conditions.push("d.amount >= ?");
        params.push(parseFloat(minAmount));
    }

    if (maxAmount) {
        conditions.push("d.amount <= ?");
        params.push(parseFloat(maxAmount));
    }

    const query = `
        SELECT 
            d.donation_id,
            dp.project_id,
            dp.project_name,
            p.full_name,
            p.image_path,
            d.amount,
            d.payment_status,
            d.created_at AS donation_date
        FROM donations d
        INNER JOIN donationproject dp ON d.project_id = dp.project_id
        LEFT JOIN profiles p ON d.user_id = p.user_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY d.created_at DESC
    `;

    db.query(query, params, (err, results) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).json({ error: "Database query failed" });
        }

        const safeResults = results.map(r => ({
            ...r,
            amount: parseFloat(r.amount),
            project_name: r.project_name
        }));

        res.json(safeResults);
    });
});

// 2. รายละเอียดบริจาคทั่วไป
route.get('/donation-summary-details/general', (req, res) => {
    const { startDate, endDate, minAmount, maxAmount } = req.query;

    let conditions = [
        "d.payment_status = 'paid'",
        "d.project_id IS NULL"  // เฉพาะบริจาคทั่วไป
    ];
    const params = [];

    if (startDate) {
        conditions.push("DATE(d.created_at) >= ?");
        params.push(startDate);
    }

    if (endDate) {
        conditions.push("DATE(d.created_at) <= ?");
        params.push(endDate);
    }

    if (minAmount) {
        conditions.push("d.amount >= ?");
        params.push(parseFloat(minAmount));
    }

    if (maxAmount) {
        conditions.push("d.amount <= ?");
        params.push(parseFloat(maxAmount));
    }

    const query = `
        SELECT 
            d.donation_id,
            NULL as project_id,
            NULL as project_name,
            p.full_name,
            p.image_path,
            d.amount,
            d.payment_status,
            d.created_at AS donation_date
        FROM donations d
        LEFT JOIN profiles p ON d.user_id = p.user_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY d.created_at DESC
    `;

    db.query(query, params, (err, results) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).json({ error: "Database query failed" });
        }

        const safeResults = results.map(r => ({
            ...r,
            amount: parseFloat(r.amount)
        }));

        res.json(safeResults);
    });
});

// 3. รายละเอียดบริจาคทั้งหมด
route.get('/donation-summary-details/all', (req, res) => {
    const { startDate, endDate, minAmount, maxAmount } = req.query;

    let conditions = ["d.payment_status = 'paid'"];
    const params = [];

    if (startDate) {
        conditions.push("DATE(d.created_at) >= ?");
        params.push(startDate);
    }

    if (endDate) {
        conditions.push("DATE(d.created_at) <= ?");
        params.push(endDate);
    }

    if (minAmount) {
        conditions.push("d.amount >= ?");
        params.push(parseFloat(minAmount));
    }

    if (maxAmount) {
        conditions.push("d.amount <= ?");
        params.push(parseFloat(maxAmount));
    }

    const query = `
        SELECT 
            d.donation_id,
            dp.project_id,
            dp.project_name,
            p.full_name,
            p.image_path,
            d.amount,
            d.payment_status,
            d.created_at AS donation_date
        FROM donations d
        LEFT JOIN donationproject dp ON d.project_id = dp.project_id
        LEFT JOIN profiles p ON d.user_id = p.user_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY d.created_at DESC
    `;

    db.query(query, params, (err, results) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).json({ error: "Database query failed" });
        }

        const safeResults = results.map(r => ({
            ...r,
            amount: parseFloat(r.amount),
            project_name: r.project_name
        }));

        res.json(safeResults);
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