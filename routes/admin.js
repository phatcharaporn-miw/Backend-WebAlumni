
const express = require("express");
const router = express.Router();
const multer = require('multer');
const path = require('path');
const db = require('../db'); 
var { LoggedIn,checkActiveUser } = require('../middlewares/auth');
const { logUserAction, logManage }= require('../logUserAction'); 

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
        return res.status(403).json({ error: 'ไม่ได้รับอนุญาต' });
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

    // ดึงข้อมูลก่อน
    const getProductQuery = 'SELECT product_name, user_id FROM products WHERE product_id = ?';
    db.query(getProductQuery, [productId], (err, productResult) => {
        if (err) {
            console.error('Error fetching product information:', err);
            return res.status(500).json({ error: 'Database error while fetching product' });
        }

        if (productResult.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }

        const productName = productResult[0].product_name;
        const userId = productResult[0].user_id;

        // Update สถานะสินค้า
        const updateQuery = 'UPDATE products SET status = "1" WHERE product_id = ?';
        db.query(updateQuery, [productId], (err, result) => {
            if (err) {
                console.error('Error updating product status:', err);
                return res.status(500).json({ error: 'Database error while updating product status' });
            }

            // บันทึก notification
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

                res.status(200).json({ message: 'Product approved and user notified successfully' });
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
            degree.degree_name,
            major.major_name
        FROM users 
        LEFT JOIN profiles ON users.user_id = profiles.user_id
        LEFT JOIN role ON users.role_id = role.role_id
        LEFT JOIN educations ON users.user_id = educations.user_id
        LEFT JOIN degree ON educations.degree_id = degree.degree_id
        LEFT JOIN major ON educations.major_id = major.major_id
        WHERE users.user_id = ? AND users.deleted_at IS NULL
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
                    INSERT INTO educations (user_id, degree_id, major_id, studentId, graduation_year)
                    VALUES ?
                `;
                const values = filtered.map(e => [
                    userId,
                    e.degree_id,
                    e.major_id,
                    e.studentId,
                    e.graduation_year,
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

// ลบผู้ใช้
router.delete("/delete-user/:userId", (req, res) => {
    const { userId } = req.params;

    const query = "DELETE FROM users WHERE user_id = ?";
    db.query(query, [userId], (err, results) => {
        if (err) {
            console.error("Error deleting user:", err);
            return res.status(500).send("Error deleting user");
        }

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
   
      logManage(userId,'เปลี่ยนสถานะผู้ใช้');
      res.send("User status updated successfully");
    });
});

// ส่วน dashboard
// จำนวนศิษย์เก่าทั้งหมด
router.get('/total-alumni', (req, res) => {
    const query = 'SELECT COUNT(*) AS totalAlumni FROM users WHERE role_id = 3 AND deleted_at IS NULL';
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

// สถิติการบริจาคแยกตามไตรมาส
// router.get('/donation-stats', (req, res) => {
//     const query = `
//         SELECT 
//             QUARTER(donation_date) AS quarter, 
//             YEAR(donation_date) AS year, 
//             SUM(amount) AS total_donations 
//         FROM donations 
//         WHERE deleted_at IS NULL
//         GROUP BY QUARTER(donation_date), YEAR(donation_date)
//     `;
//     db.query(query, (err, results) => {
//         if (err) {
//             console.error('Database query failed:', err);
//             return res.status(500).json({ error: 'Database query failed' });
//         }
//         res.json(results);
//     });
// });

// GET /admin/dashboard-stats
router.get('/dashboard-stats', (req, res) => {
    let result = {
      totalParticipants: 0,
      ongoingActivity: 0,
      ongoingProject: 0,
      totalDonations: 0,
    };
  
    db.query('SELECT COUNT(*) AS total FROM participants', (err, participants) => {
      if (err) {
        console.error('Error fetching participants:', err);
        return res.status(500).json({ message: 'Internal server error' });
      }
      result.totalParticipants = participants[0].total;
  
      db.query("SELECT COUNT(*) AS total FROM activity WHERE status = 2", (err, activities) => {
        if (err) {
          console.error('Error fetching activities:', err);
          return res.status(500).json({ message: 'Internal server error' });
        }
        result.ongoingActivity = activities[0].total;
  
        db.query("SELECT COUNT(*) AS total FROM donationproject WHERE status = 1", (err, projects) => {
          if (err) {
            console.error('Error fetching donation projects:', err);
            return res.status(500).json({ message: 'Internal server error' });
          }
          result.ongoingProject = projects[0].total;
  
          db.query('SELECT SUM(amount) AS total FROM donations', (err, donations) => {
            if (err) {
              console.error('Error fetching donations:', err);
              return res.status(500).json({ message: 'Internal server error' });
            }
            result.totalDonations = donations[0].total || 0;
  
            // ส่งผลลัพธ์สุดท้าย
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