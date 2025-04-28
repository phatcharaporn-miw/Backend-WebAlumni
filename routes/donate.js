const express = require("express");
const route = express.Router();
const multer = require('multer');
const path = require('path');
const QRCode = require('qrcode');
const generatePayload = require('promptpay-qr');
var db = require('../db');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname);
    }
});

const upload = multer({ storage: storage });

// ดึงโครงการทั้งหมด
route.get('/', (req, res) => {
    const query = 'SELECT * FROM donationproject WHERE status = "1"';

    db.query(query, (err, results) => {
        if (err) {
            console.error('Database query failed:', err);
            res.status(500).json({ error: 'Database query failed' });
            return;
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
;

// สร้างโครงการบริจาคใหม่
route.post('/donateRequest', upload.single('image'), (req, res) => {
    const { projectName, description, targetAmount, startDate, endDate, donationType, currentAmount,
         bankName, accountName,accountNumber, numberPromtpay , forThings,typeThings,quantityThings} = req.body;

    const image = req.file ? req.file.filename : null;
    if (!image) {
        return res.status(400).json({ error: 'Image is required' });
    }

    const query = `
    INSERT INTO donationproject 
    (project_name, description, start_date, end_date, donation_type, image_path, 
    target_amount, current_amount, bank_name,account_name, account_number, number_promtpay,for_things,type_things,quantity_things) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,?,?,?,?)
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
        res.status(200).json({ message: 'Donation project added successfully' });
    });

});

route.post('/donation', upload.single('slip'), (req, res) => {
    const { amount, userId, projectId, name, address, taxId } = req.body;
    const slip = req.file ? req.file.filename : null;

    console.log("Received data:", req.body);
    console.log("Received file:", req.file);

    if (!slip) {
        return res.status(400).json({ error: 'Slip is required' });
    }

    if (!projectId) {
        return res.status(400).json({ error: 'Project ID is required' });
    }

    let taxData = null;
    if (name && address && taxId) {
        taxData = [name, address, taxId];
    }

    const query = `
        INSERT INTO donations 
        (project_id, user_id, amount, payment_status, slip, name, address, tax_id) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const values = [projectId, userId, amount, "pending", slip, name || null, address || null, taxId || null];

    db.query(query, values, (err, result) => {
        if (err) {
            console.error('Error inserting donation:', err);
            return res.status(500).json({ error: `Error inserting donation: ${err.message}` });
        }

        const updateQuery = `
            UPDATE donationproject 
            SET current_amount = current_amount + ? 
            WHERE project_id = ?
        `;
        const updateValues = [amount, projectId];

        db.query(updateQuery, updateValues, (err, updateResult) => {
            if (err) {
                console.error('Error updating current_amount in donationproject:', err);
                return res.status(500).json({ error: `Error updating current_amount: ${err.message}` });
            }

            res.status(200).json({ message: 'Donation completed successfully', donationId: result.insertId });
        });
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