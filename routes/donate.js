const express = require("express");
const route = express.Router();
const multer = require('multer');
const path = require('path');
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
    // const db = req.db;
    const query = 'SELECT * FROM donationproject';

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
    // const db = req.db;
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

// เพิ่มโครงการบริจาคใหม่
route.post('/donateRequest', upload.single('image'), (req, res) => {

    const { projectName, description, targetAmount, startDate, endDate, donationType, currentAmount, bankName, accountNumber, numberPromtpay } = req.body;

    const image = req.file ? req.file.filename : null;
    if (!image) {
        return res.status(400).json({ error: 'Image is required' });
    }

    // const db = req.db;

    const query = `
    INSERT INTO donationproject 
    (project_name, description, start_date, end_date, donation_type, image_path, 
    target_amount, current_amount, bank_name, account_number, number_promtpay) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        numberPromtpay
    ];

    db.query(query, values, (err, result) => {
        if (err) {
            console.error('Error inserting donation project:', err);
            return res.status(500).json({ error: 'Error inserting donation project' });
        }
        res.status(200).json({ message: 'Donation project added successfully' });
    });

});

// ลบโครงการบริจาค
route.delete('/donate/:id', (req, res) => {
    const projectId = req.params.id;
    const currentDate = new Date();
    // const db = req.db;

    if (!projectId) {
        return res.status(400).json({ error: 'Project ID is required' });
    }

    const query = 'UPDATE donationproject SET delete_at = ? WHERE project_id = ?';

    db.query(query, [currentDate, projectId], (err, result) => {
        if (err) {
            console.error('Error during soft delete query:', err);
            return res.status(500).json({ error: 'Error during soft delete' });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Project not found' });
        }

        res.status(200).json({ message: 'Donation project marked as deleted successfully' });
    });
});



module.exports = route;