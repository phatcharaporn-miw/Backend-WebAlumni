var express = require('express');
var router = express.Router();
var db  = require('../db');

const seedMajor = () =>{
    const major = [
        'วิทยาการคอมพิวเตอร์',
        'เทคโนโลยีสารสนเทศ',
        'ภูมิสารสนเทศศาสตร์',
        'ปัญญาประดิษฐ์',
        'ความมั่นคงปลอดภัยไซเบอร์'
    ];
    const sql = 'INSERT INTO major (major_name) VALUES ?';

    db.query(sql, [major.map((major) => [major])], (err, result) => {
        if (err) throw err;
        console.log('Major seeded:', result.affectedRows);
    });
};

seedMajor();

const seedDegree = () => {
    const degree = [
        'ป.ตรี', 
        'ป.โท', 
        'ป.เอก'
    ];
    const sql = 'INSERT INTO Degree (degree_name) VALUES ?';

    db.query(sql, [degree.map((degree) => [degree])], (err, result) => {
        if (err) throw err;
        console.log('Degrees seeded:', result.affectedRows);
    });
};

seedDegree();


const seedRole = () =>{
    const role = [
        'แอดมิน',
        'นายกสมาคม',
        'ศิษย์เก่า',
        'ศิษย์ปัจจุบัน'
    ];
    const sql = 'INSERT INTO role (role_name) VALUES ?';

    db.query(sql, [role.map((role) => [role])], (err, result) => {
        if (err) throw err;
        console.log('Role seeded:', result.affectedRows);
    });
};

seedRole();
