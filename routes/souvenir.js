// souvenir.js (User)
const express = require("express");
const route = express.Router();
const multer = require('multer');
const path = require('path');
const db = require('../db');
const { logPayment, logOrder } = require('../logUserAction');

const generatePayload = require('promptpay-qr');
const QRCode = require('qrcode');


// ตั้งค่าการจัดเก็บไฟล์
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '../uploads/'));
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});

const upload = multer({ storage });

// ดึงที่อยู่ของผู้ใช้
route.get("/user/shippingAddress", async (req, res) => {
    const { user_id } = req.query;
    if (!user_id) return res.status(400).json({ error: "user_id required" });

    try {
        // ดึงข้อมูลจากตาราง user_addresses
        const [rows] = await db.promise().query(
            `SELECT ua.*, p.full_name
            FROM user_addresses AS ua
            JOIN profiles AS p ON ua.user_id = p.user_id
            WHERE ua.user_id = ? and ua.deleted_at IS NULL
            ORDER BY ua.updated_at DESC`,
            [user_id]
        );

        // map rows เป็น array ของ object
        const addresses = rows.map(r => ({
            user_addresses_id: r.user_addresses_id,
            full_name: r.full_name,
            shippingAddress: r.shippingAddress,
            province_name: r.province_name,
            district_name: r.district_name,
            sub_district_name: r.sub_district_name,
            province_id: r.province_id,
            district_id: r.district_id,
            sub_district_id: r.sub_district_id,
            zip_code: r.zip_code,
            phone: r.phone,
            is_default: r.is_default
        }));

        res.json(addresses);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal server error" });
    }
});

// เพิ่มที่อยู่
route.post("/user/shippingAddress", async (req, res) => {
    try {
        const {
            user_id,
            shippingAddress,
            province_id,
            district_id,
            sub_district_id,
            province_name,
            district_name,
            sub_district_name,
            zip_code,
            is_default,
            phone
        } = req.body;

        if (!user_id || !shippingAddress) {
            return res.status(400).json({ error: "ข้อมูลไม่ครบถ้วน" });
        }

        // ถ้า is_default = 1 จะเคลียร์ default address เดิม
        if (is_default === 1) {
            await db.promise().query(
                "UPDATE user_addresses SET is_default = 0 WHERE user_id = ?",
                [user_id]
            );
        }

        // เพิ่มที่อยู่ใหม่
        const [result] = await db.promise().query(
            `INSERT INTO user_addresses 
            (user_id, shippingAddress, province_id ,province_name,district_id, district_name, sub_district_id ,sub_district_name, zip_code,phone, is_default, created_at, updated_at)
            VALUES (?, ?, ?,?,?,?, ?, ?, ?, ?,?, NOW(), NOW())`,
            [user_id, shippingAddress, province_id, province_name, district_id, district_name, sub_district_id, sub_district_name, zip_code, phone, is_default]
        );

        res.status(201).json({
            success: true,
            user_addresses_id: result.insertId,
            shippingAddress: shippingAddress,
            message: "เพิ่มที่อยู่สำเร็จ"
        });

    } catch (err) {
        console.error("Error saving address:", err);
        res.status(500).json({ error: "เกิดข้อผิดพลาดในการบันทึกที่อยู่" });
    }
});

// ตั้งค่าที่อยู่หลัก
route.post("/user/shippingAddress/default", async (req, res) => {
    const { user_id, user_addresses_id } = req.body;
    if (!user_id || !user_addresses_id)
        return res.status(400).json({ error: "user_id and user_addresses_id required" });

    try {
        // ลบ default เก่า
        await db.promise().query(
            `UPDATE user_addresses SET is_default = 0 WHERE user_id = ? AND is_default = 1`,
            [user_id]
        );

        // ตั้ง default ใหม่
        await db.promise().query(
            `UPDATE user_addresses SET is_default = 1 WHERE user_id = ? AND user_addresses_id = ?`,
            [user_id, user_addresses_id]
        );

        res.json({ success: true, message: "ตั้งค่าที่อยู่เริ่มต้นเรียบร้อยแล้ว" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal server error" });
    }
});

// แก้ไขที่อยู่
route.put("/user/shippingAddress", async (req, res) => {
    const {
        user_id,
        user_addresses_id,
        shippingAddress,
        province_id,
        district_id,
        sub_district_id,
        province_name,
        district_name,
        sub_district_name,
        zip_code,
        is_default,
        phone
    } = req.body;

    if (!user_id || !user_addresses_id || !shippingAddress) {
        return res.status(400).json({ error: "ข้อมูลไม่ครบถ้วน" });
    }

    try {
        // ถ้า is_default = 1 จะเคลียร์ default address เดิม
        if (is_default === 1) {
            await db.promise().query(
                "UPDATE user_addresses SET is_default = 0 WHERE user_id = ?",
                [user_id]
            );
        }

        // อัปเดต address
        await db.promise().query(
            `UPDATE user_addresses
             SET shippingAddress = ?,province_id = ?, province_name = ?, district_id =? ,district_name = ?, sub_district_id = ?,sub_district_name = ?, zip_code = ?, phone = ? ,is_default = ?, updated_at = NOW()
             WHERE user_addresses_id = ? AND user_id = ?`,
            [
                shippingAddress,
                province_id,
                province_name,
                district_id,
                district_name,
                sub_district_id,
                sub_district_name,
                zip_code,
                phone,
                is_default,
                user_addresses_id,
                user_id
            ]
        );

        res.json({ success: true, message: "แก้ไขที่อยู่สำเร็จ" });

    } catch (err) {
        console.error("Error updating address:", err);
        res.status(500).json({ error: "เกิดข้อผิดพลาดในการแก้ไขที่อยู่" });
    }
});

// ลบที่อยู่ แบบsoft delete
route.delete("/user/shippingAddress/:id", async (req, res) => {
    try {
        const { id } = req.params;

        await db.promise().query(
            "UPDATE user_addresses SET deleted_at = NOW() WHERE user_addresses_id = ?",
            [id]
        );

        res.json({ success: true, message: "ลบที่อยู่เรียบร้อยแล้ว (soft delete)" });
    } catch (err) {
        console.error("Error soft deleting address:", err);
        res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด" });
    }
});

// ดึงข้อมูลสินค้าทั้งหมด
// route.get('/', (req, res) => {
//     const query = `
//     SELECT 
//         p.product_id,
//         p.product_name,
//         p.description,
//         p.price,
//         p.image,
//         r.role_id,
//         COALESCE(SUM(ps.quantity - ps.sold - ps.reserved - IFNULL(pending.total_pending, 0)), 0) AS available_stock
//     FROM products p
//     JOIN users u ON p.user_id = u.user_id
//     JOIN role r ON u.role_id = r.role_id
//     LEFT JOIN product_slots ps 
//         ON p.product_id = ps.product_id AND ps.status = 'active'
//     LEFT JOIN (
//         SELECT od.product_id, SUM(od.quantity) AS total_pending
//         FROM order_detail od
//         JOIN orders o ON od.order_id = o.order_id
//         WHERE o.order_status = 'pending_verification'
//         GROUP BY od.product_id
//     ) AS pending
//         ON pending.product_id = p.product_id
//     WHERE p.status = "1"
//     GROUP BY p.product_id
// `;

//     // ps.quantity → จำนวนสินค้าทั้งหมดในล็อต
//     // ps.sold → จำนวนสินค้าที่ขายแล้ว (confirmed)
//     // ps.reserved → จำนวนสินค้าที่อยู่ในตะกร้า
//     // pending.total_pending → จำนวนสินค้าที่อยู่ใน order รอ admin confirm
//     // SUM(...) → ถ้ามีหลายล็อตรวมกัน
//     // COALESCE(..., 0) → ถ้า NULL ให้เป็น 0

//     db.query(query, (err, results) => {
//         if (err) {
//             console.error('Database query failed:', err);
//             return res.status(500).json({ error: 'Database query failed' });
//         }

//         const products = results.map(item => ({
//             ...item,
//             is_sold_out: item.available_stock <= 0  //หน้าเว็บจะแสดง “สินค้าหมด”
//         }));

//         res.json(products);
//     });
// });

// ดึงข้อมูลสินค้าทั้งหมด
route.get('/', (req, res) => {
    const query = `
    SELECT 
        p.product_id,
        p.product_name,
        p.description,
        p.price,
        p.image,
        p.is_official, 
        r.role_id,
        COALESCE(SUM(ps.quantity - ps.sold - ps.reserved - IFNULL(pending.total_pending, 0)), 0) AS available_stock
    FROM products p
    JOIN users u ON p.user_id = u.user_id
    JOIN role r ON u.role_id = r.role_id
    LEFT JOIN product_slots ps 
        ON p.product_id = ps.product_id AND ps.status = 'active'
    LEFT JOIN (
        SELECT od.product_id, SUM(od.quantity) AS total_pending
        FROM order_detail od
        JOIN orders o ON od.order_id = o.order_id
        WHERE o.order_status = 'pending_verification'
        GROUP BY od.product_id
    ) AS pending
        ON pending.product_id = p.product_id
    WHERE p.status = "1"
    GROUP BY p.product_id
    ORDER BY p.is_official DESC, p.product_id DESC 
    `;

    db.query(query, (err, results) => {
        if (err) {
            console.error('Database query failed:', err);
            return res.status(500).json({ error: 'Database query failed' });
        }

        const products = results.map(item => ({
            ...item,
            is_sold_out: item.available_stock <= 0
        }));

        res.json(products);
    });
});


// ดึงรายละเอียดของสินค้า
route.get('/souvenirDetail/:id', async (req, res) => {
    const productId = req.params.id;

    try {
        // ดึงข้อมูลสินค้าและ promptpay_number
        const [productRows] = await db.promise().query(
            `SELECT p.*, pm.promptpay_number, pm.account_name, pm.account_number, pm.bank_name
             FROM products p
             JOIN payment_methods pm ON p.payment_method_id = pm.payment_method_id
             WHERE p.product_id = ?`,
            [productId]
        );

        if (!productRows || productRows.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }

        // ดึง slot ที่ active และอยู่ในช่วงวันที่
        const [slotRows] = await db.promise().query(
            `SELECT slot_id, slot_name, quantity, sold, reserved, start_date, end_date, status
             FROM product_slots
             WHERE product_id = ? AND status = 'active'
             AND (start_date <= NOW() AND (end_date IS NULL OR end_date >= NOW()))
             ORDER BY start_date ASC LIMIT 1`,
            [productId]
        );

        let slotInfo = null;
        let outOfStock = false;
        if (slotRows.length > 0) {
            const slot = slotRows[0];
            const available = slot.quantity - slot.sold - slot.reserved;
            slotInfo = {
                slot_id: slot.slot_id,
                slot_name: slot.slot_name,
                quantity: slot.quantity, // จำนวนที่เปิดขายใน slot นี้
                sold: slot.sold,        // จำนวนที่ขายไปแล้ว
                reserved: slot.reserved, // จำนวนที่จองไว้
                available: slot.quantity - slot.sold - slot.reserved, //available = จำนวนที่ยังซื้อได้
                start_date: slot.start_date,
                end_date: slot.end_date,
                status: slot.status
            };
            if (available <= 0) {
                outOfStock = true;
            } else {
                outOfStock = true;
            }
        }

        // รวมข้อมูลสินค้าและ slot
        const result = {
            ...productRows[0],
            slot: slotInfo,
            outOfStock: outOfStock
        };

        res.status(200).json(result);
    } catch (err) {
        console.error('Error fetching product details:', err);
        return res.status(500).json({ error: 'Error fetching product details' });
    }
});


// รอการอนุมัติคำขอ
route.get('/pending-requests', (req, res) => {
    const userId = req.session.user?.id;

    if (!userId) {
        return res.status(401).json({ error: "ไม่ได้เข้าสู่ระบบ" });
    }
    const query = `
    SELECT 
    products.*, role.role_id
    FROM products 
    JOIN users ON products.user_id = users.user_id
    JOIN role ON users.role_id = role.role_id
    WHERE status = "0" AND products.user_id = ?
    `;

    db.query(query, [userId, userId], (err, results) => {
        if (err) {
            console.error("Error fetching pending requests:", err);
            return res.status(500).json({ error: "ดึงข้อมูลไม่สำเร็จ" });
        }
        res.json(results);
    });
});

// เพิ่มสินค้า
// route.post('/addsouvenir', upload.single('image'), (req, res) => {
//     const { productName, description, price, quantity, paymentMethod,
//         bankName, accountNumber, accountName, promptpayNumber, start_date, end_date, slot_name } = req.body;
//     const user_id = req.session.user?.id;
//     const image = req.file ? req.file.filename : null;

//     if (!image) {
//         return res.status(400).json({ error: 'Image is required' });
//     }

//     if (!productName || !description || !price || !quantity || !paymentMethod ||
//         !bankName || !accountNumber || !accountName || !slot_name) {
//         return res.status(400).json({ error: 'ต้องกรอกข้อมูลทุกช่องให้ครบถ้วน' });
//     }

//     db.beginTransaction((err) => {
//         if (err) {
//             return res.status(500).json({ error: 'Failed to start transaction' });
//         }

//         const queryPayment = `
//             INSERT INTO payment_methods 
//             (method_name, bank_name, account_name, account_number, promptpay_number) 
//             VALUES (?, ?, ?, ?, ?)
//         `;
//         const valuesPayment = [
//             paymentMethod,
//             bankName,
//             accountName,
//             accountNumber,
//             promptpayNumber
//         ];

//         db.query(queryPayment, valuesPayment, (err, result) => {
//             if (err) {
//                 return db.rollback(() => {
//                     return res.status(500).json({ error: 'Error inserting payment method' });
//                 });
//             }

//             const payment_method_id = result.insertId;

//             //ตรวจสอบ role เพื่อกำหนด is_official
//             const isOfficial = (user.role_id === 1 || user.role_id === 2) ? 1 : 0;

//             const queryProduct = `
//                 INSERT INTO products 
//                 (product_name, description, image, price, user_id, status, payment_method_id, is_official) 
//                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)
//             `;
//             const valuesProduct = [
//                 productName,
//                 description,
//                 image,
//                 price,
//                 user_id,
//                 "0",  // ยังไม่อนุมัติ
//                 payment_method_id,
//                 isOfficial
//             ];

//             db.query(queryProduct, valuesProduct, (err, result) => {
//                 if (err) {
//                     return db.rollback(() => {
//                         db.query(`DELETE FROM payment_methods WHERE payment_method_id = ?`, [payment_method_id]);
//                         return res.status(500).json({ error: 'Error inserting product' });
//                     });
//                 }

//                 const product_id = result.insertId;

//                 // เพิ่ม slot ให้สินค้า
//                 const querySlot = `
//                     INSERT INTO product_slots 
//                     (product_id, slot_name, quantity, sold, reserved, start_date, end_date, status, created_at)
//                     VALUES (?, ?, ?, 0, 0, ?, ?, 'active', NOW())
//                 `;
//                 db.query(querySlot, [product_id, slot_name, quantity, start_date, end_date], (err) => {
//                     if (err) {
//                         return db.rollback(() => {
//                             return res.status(500).json({ error: 'Error inserting product slot' });
//                         });
//                     }

//                     // เพิ่มแจ้งเตือนหลังจากเพิ่มสินค้า
//                     db.query(`SELECT user_id FROM users WHERE role_id IN (1, 2)`, (err, resultUsers) => {
//                         if (err) {
//                             return db.rollback(() => {
//                                 return res.status(500).json({ error: 'Failed to fetch target users for notification' });
//                             });
//                         }

//                         const notifications = resultUsers.map(row => [
//                             row.user_id,
//                             'souvenir_request',
//                             `มีคำขอขายของที่ระลึก: ${productName}`
//                         ]);

//                         if (notifications.length > 0) {
//                             db.query(
//                                 `INSERT INTO notifications (user_id, type, message)
//                                  VALUES ? 
//                                  ON DUPLICATE KEY UPDATE 
//                                  message = VALUES(message),
//                                  send_date = NOW(),
//                                  status = 'ยังไม่อ่าน';`,
//                                 [notifications],
//                                 (err) => {
//                                     if (err) {
//                                         return db.rollback(() => {
//                                             return res.status(500).json({ error: 'Failed to insert notifications' });
//                                         });
//                                     }

//                                     db.commit(err => {
//                                         if (err) {
//                                             return db.rollback(() => {
//                                                 return res.status(500).json({ error: 'Failed to commit transaction' });
//                                             });
//                                         }
//                                         return res.status(200).json({ message: 'Product, slot, payment method, and notifications added successfully' });
//                                     });
//                                 }
//                             );
//                         } else {
//                             db.commit((err) => {
//                                 if (err) {
//                                     return db.rollback(() => {
//                                         return res.status(500).json({ error: 'Failed to commit transaction' });
//                                     });
//                                 }
//                                 return res.status(200).json({ message: 'Product and slot added (no users to notify)' });
//                             });
//                         }
//                     });
//                 });
//             });
//         });
//     });
// });

// เพิ่มสินค้าอันใหม่ 
route.post('/addsouvenir', upload.single('image'), (req, res) => {
    const { productName, description, price, quantity, paymentMethod,
        bankName, accountNumber, accountName, promptpayNumber, start_date, end_date, slot_name } = req.body;
    const user = req.session.user; 
    const user_id = user?.id;
    const image = req.file ? req.file.filename : null;

    if (!image) {
        return res.status(400).json({ error: 'Image is required' });
    }

    if (!productName || !description || !price || !quantity || !paymentMethod ||
        !bankName || !accountNumber || !accountName || !slot_name) {
        return res.status(400).json({ error: 'ต้องกรอกข้อมูลทุกช่องให้ครบถ้วน' });
    }

    db.beginTransaction((err) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to start transaction' });
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
                return db.rollback(() => {
                    return res.status(500).json({ error: 'Error inserting payment method' });
                });
            }

            const payment_method_id = result.insertId;

            // ตรวจสอบ role เพื่อกำหนด is_official
            const isOfficial = (user.role_id === 1 || user.role_id === 2) ? 1 : 0;

            const queryProduct = `
                INSERT INTO products 
                (product_name, description, image, price, user_id, status, payment_method_id, is_official) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `;
            const valuesProduct = [
                productName,
                description,
                image,
                price,
                user_id,
                "0",  // ยังไม่อนุมัติ
                payment_method_id,
                isOfficial
            ];

            db.query(queryProduct, valuesProduct, (err, result) => {
                if (err) {
                    return db.rollback(() => {
                        db.query(`DELETE FROM payment_methods WHERE payment_method_id = ?`, [payment_method_id]);
                        return res.status(500).json({ error: 'Error inserting product' });
                    });
                }

                const product_id = result.insertId;

                const querySlot = `
                    INSERT INTO product_slots 
                    (product_id, slot_name, quantity, sold, reserved, start_date, end_date, status, created_at)
                    VALUES (?, ?, ?, 0, 0, ?, ?, 'active', NOW())
                `;
                db.query(querySlot, [product_id, slot_name, quantity, start_date, end_date], (err) => {
                    if (err) {
                        return db.rollback(() => {
                            return res.status(500).json({ error: 'Error inserting product slot' });
                        });
                    }

                    db.query(`SELECT user_id FROM users WHERE role_id IN (1, 2)`, (err, resultUsers) => {
                        if (err) {
                            return db.rollback(() => {
                                return res.status(500).json({ error: 'Failed to fetch target users for notification' });
                            });
                        }

                        const notifications = resultUsers.map(row => [
                            row.user_id,
                            'souvenir_request',
                            `มีคำขอขายของที่ระลึก: ${productName}`
                        ]);

                        if (notifications.length > 0) {
                            db.query(
                                `INSERT INTO notifications (user_id, type, message)
                                 VALUES ? 
                                 ON DUPLICATE KEY UPDATE 
                                 message = VALUES(message),
                                 send_date = NOW(),
                                 status = 'ยังไม่อ่าน';`,
                                [notifications],
                                (err) => {
                                    if (err) {
                                        return db.rollback(() => {
                                            return res.status(500).json({ error: 'Failed to insert notifications' });
                                        });
                                    }

                                    db.commit(err => {
                                        if (err) {
                                            return db.rollback(() => {
                                                return res.status(500).json({ error: 'Failed to commit transaction' });
                                            });
                                        }
                                        return res.status(200).json({ message: 'Product, slot, payment method, and notifications added successfully' });
                                    });
                                }
                            );
                        } else {
                            db.commit((err) => {
                                if (err) {
                                    return db.rollback(() => {
                                        return res.status(500).json({ error: 'Failed to commit transaction' });
                                    });
                                }
                                return res.status(200).json({ message: 'Product and slot added (no users to notify)' });
                            });
                        }
                    });
                });
            });
        });
    });
});



// ดึงตะกร้ามาจ้า
route.get('/cart', (req, res) => {
    const user_id = req.session.user?.id;

    if (!user_id) {
        return res.status(400).json({ error: 'User ID is required' });
    }

    const query = `
        SELECT 
            cart.*, 
            products.product_id, 
            products.product_name, 
            products.price, 
            products.image,
            products.payment_method_id,
            pm.promptpay_number
        FROM cart
        JOIN products ON cart.product_id = products.product_id
        LEFT JOIN payment_methods pm ON products.payment_method_id = pm.payment_method_id
        WHERE cart.user_id = ?
    `;

    db.query(query, [user_id], (err, results) => {
        if (err) {
            console.error('Error executing query:', err);
            return res.status(500).json({ error: 'Error fetching cart details', details: err });
        }

        res.status(200).json(results.length > 0 ? results : []);
    });
});

// ดึงจำนวนสินค้าในตะกร้า
route.get('/cart/count', (req, res) => {
    const user_id = req.session.user?.id;

    if (!user_id) {
        return res.status(400).json({ error: "User ID is required" });
    }

    const query = `SELECT SUM(quantity) AS cartCount FROM cart WHERE user_id = ?`;

    db.query(query, [user_id], (err, results) => {
        if (err) {
            console.error('Error fetching cart count:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        res.status(200).json({ cartCount: results[0].cartCount || 0 });
    });
});


// อันใหม่
// เพิ่มสินค้าลงตะกร้า
route.post('/cart/add', (req, res) => {
    const {product_id, quantity } = req.body;
    const user_id = req.session.user?.id;

    if (!user_id || !product_id || !quantity) {
        return res.status(400).json({ message: "ข้อมูลไม่ครบถ้วนหรือไม่ถูกต้อง" });
    }

    db.beginTransaction(err => {
        if (err) return res.status(500).json({ message: "ไม่สามารถเริ่ม transaction ได้" });

        db.query(`SELECT price FROM products WHERE product_id = ?`, [product_id], (err, productRows) => {
            if (err) return db.rollback(() => res.status(500).json({ message: "เกิดข้อผิดพลาดในการค้นหาสินค้า" }));
            if (!productRows || productRows.length === 0) return db.rollback(() => res.status(400).json({ message: "ไม่พบสินค้า" }));

            const { price } = productRows[0];
            const total = price * quantity;

            db.query(
                `SELECT slot_id, quantity, sold, reserved 
                 FROM product_slots 
                 WHERE product_id = ? AND status = 'active' 
                 AND (start_date <= NOW() AND (end_date IS NULL OR end_date >= NOW()))
                 ORDER BY start_date ASC LIMIT 1`,
                [product_id],
                (err, slotRows) => {
                    if (err) return db.rollback(() => res.status(500).json({ message: "เกิดข้อผิดพลาดในการค้นหาสล็อต" }));
                    if (!slotRows || slotRows.length === 0) return db.rollback(() => res.status(400).json({ message: "สินค้าหมดหรือไม่มีสล็อตที่ใช้งานได้" }));

                    const slot = slotRows[0];
                    const available = slot.quantity - slot.sold - slot.reserved;

                    if (available < quantity) {
                        return db.rollback(() => res.status(400).json({
                            message: `จำนวนสินค้าไม่พอในสต็อก (คงเหลือ ${available} ชิ้น)`
                        }));
                    }

                    // เพิ่มหรืออัปเดต cart
                    db.query(`SELECT quantity FROM cart WHERE user_id = ? AND product_id = ? FOR UPDATE`, [user_id, product_id], (err, cartRows) => {
                        if (err) return db.rollback(() => res.status(500).json({ message: "เกิดข้อผิดพลาดในการค้นหาตะกร้า" }));

                        let newQuantity = quantity;
                        let newTotal = total;
                        if (cartRows && cartRows.length > 0) {
                            newQuantity += cartRows[0].quantity;
                            newTotal = price * newQuantity;
                            db.query(
                                `UPDATE cart SET quantity = ?, total = ? WHERE user_id = ? AND product_id = ?`,
                                [newQuantity, newTotal, user_id, product_id],
                                afterCartUpdate
                            );
                        } else {
                            db.query(
                                `INSERT INTO cart (user_id, product_id, quantity, total) VALUES (?, ?, ?, ?)`,
                                [user_id, product_id, quantity, total],
                                afterCartUpdate
                            );
                        }

                        function afterCartUpdate(err) {
                            if (err) return db.rollback(() => res.status(500).json({ message: "เกิดข้อผิดพลาดในการอัปเดตตะกร้า" }));

                            // อัปเดต reserved ใน slot
                            db.query(
                                `UPDATE product_slots 
                                 SET reserved = reserved + ?,
                                     status = CASE WHEN sold + reserved + ? >= quantity THEN 'ended' ELSE 'active' END
                                 WHERE slot_id = ?`,
                                [quantity, quantity, slot.slot_id],
                                (err) => {
                                    if (err) return db.rollback(() => res.status(500).json({ message: "เกิดข้อผิดพลาดในการอัปเดตสล็อต" }));

                                    // เปิดล็อตถัดไปอัตโนมัติ ถ้ามี
                                    db.query(
                                        `UPDATE product_slots
                                        SET status = 'active'
                                        WHERE product_id = ? AND status = 'pending'
                                        ORDER BY start_date ASC
                                        LIMIT 1`,
                                        [product_id],
                                        (errNext) => {
                                            if (errNext) console.error("เปิดล็อตถัดไปล้มเหลว", errNext);
                                        });


                                    // เช็คสต็อกเหลือน้อย
                                    const available = slot.quantity - slot.sold - (slot.reserved + quantity);
                                    if (available <= 5) {
                                        // แจ้งเตือนแอดมิน
                                        db.query(
                                            `SELECT product_name FROM products WHERE product_id = ?`,
                                            [product_id],
                                            (err, prodRows) => {
                                                const productName = prodRows && prodRows.length > 0 ? prodRows[0].product_name : `ID:${product_id}`;
                                                db.query(
                                                    `SELECT user_id FROM users WHERE role_id = 1 AND is_active = 1`,
                                                    (err, admins) => {
                                                        if (!err && admins.length > 0) {
                                                            const message = `ล็อตสินค้า ${slot.slot_name} ของ "${productName}" คงเหลือ ${available} ชิ้น`;
                                                            admins.forEach(admin => {
                                                                db.query(
                                                                    `INSERT INTO notifications (user_id, type, message, related_id, send_date, status)
                                                                        VALUES (?, 'stock', ?, ?, NOW(), 'ยังไม่อ่าน')
                                                                        ON DUPLICATE KEY UPDATE 
                                                                            message = VALUES(message),
                                                                            send_date = NOW(),
                                                                            status = 'ยังไม่อ่าน';`,
                                                                    [admin.user_id, message, slot.slot_id]
                                                                );
                                                            });
                                                        }
                                                    }
                                                );
                                            }
                                        );
                                    }

                                    db.commit(err => {
                                        if (err) return db.rollback(() => res.status(500).json({ message: "เกิดข้อผิดพลาดในการบันทึก transaction" }));
                                        res.json({
                                            message: "เพิ่มสินค้าลงตะกร้าสำเร็จ",
                                            cartCount: newQuantity
                                        });
                                    });
                                }
                            );
                        }
                    });
                }
            );
        });
    });
});

// อัปเดตจำนวนสินค้าในตะกร้า
route.put('/cart/update', (req, res) => {
    const {product_id, quantity } = req.body;
    const user_id = req.session.user?.id;

    if (!user_id || !product_id || !Number.isInteger(quantity) || quantity < 1) {
        return res.status(400).json({ message: "ข้อมูลไม่ครบถ้วนหรือไม่ถูกต้อง" });
    }

    console.log(`Cart update request: User=${user_id}, Product=${product_id}, Quantity=${quantity}`);

    db.beginTransaction(err => {
        if (err) {
            console.error("Error starting transaction:", err);
            return res.status(500).json({ message: "ไม่สามารถเริ่ม transaction ได้" });
        }

        // ดึงข้อมูลสินค้า
        db.query(`SELECT price, product_name FROM products WHERE product_id = ?`, [product_id], (err, productRows) => {
            if (err) {
                console.error("Error fetching product:", err);
                return db.rollback(() => res.status(500).json({ message: "เกิดข้อผิดพลาดในการค้นหาสินค้า" }));
            }
            if (!productRows || productRows.length === 0) {
                return db.rollback(() => res.status(400).json({ message: "ไม่พบสินค้า" }));
            }

            const { price, product_name } = productRows[0];
            const total = price * quantity;
            //console.log(`Product found: ${product_name}, Price: ${price}`);

            // ดึงข้อมูลสล็อต
            db.query(
                `SELECT slot_id, slot_name, quantity, sold, reserved 
                 FROM product_slots 
                 WHERE product_id = ? AND status = 'active' 
                 AND (start_date <= NOW() AND (end_date IS NULL OR end_date >= NOW()))
                 ORDER BY start_date ASC LIMIT 1`,
                [product_id],
                (err, slotRows) => {
                    if (err) {
                        console.error("Error fetching slot:", err);
                        return db.rollback(() => res.status(500).json({ message: "เกิดข้อผิดพลาดในการค้นหาสล็อต" }));
                    }
                    if (!slotRows || slotRows.length === 0) {
                        return db.rollback(() => res.status(400).json({ message: "ไม่มีสล็อตที่ใช้งานได้สำหรับสินค้านี้" }));
                    }

                    const slot = slotRows[0];

                    // ดึงข้อมูลตะกร้าปัจจุบัน
                    db.query(`SELECT quantity FROM cart WHERE user_id = ? AND product_id = ? FOR UPDATE`, [user_id, product_id], (err, cartRows) => {
                        if (err) {
                            console.error("Error fetching cart:", err);
                            return db.rollback(() => res.status(500).json({ message: "เกิดข้อผิดพลาดในการค้นหาตะกร้า" }));
                        }
                        if (!cartRows || cartRows.length === 0) {
                            return db.rollback(() => res.status(400).json({ message: "ไม่พบสินค้าในตะกร้า" }));
                        }

                        const prevQty = cartRows[0].quantity;
                        const diff = quantity - prevQty;
                        console.log(`Cart update - Previous: ${prevQty}, New: ${quantity}, Difference: ${diff}`);

                        // ตรวจสอบ stock
                        const available = slot.quantity - slot.sold - slot.reserved;
                        if (available < diff) {
                            // console.log(`Insufficient stock - Available: ${available}, Requested diff: ${diff}`);
                            return db.rollback(() => res.status(400).json({
                                message: `จำนวนสินค้าไม่พอในสล็อต (คงเหลือ ${available} ชิ้น)`
                            }));
                        }

                        // อัปเดตตะกร้า
                        db.query(
                            `UPDATE cart SET quantity = ?, total = ?, updated_at = NOW() WHERE user_id = ? AND product_id = ?`,
                            [quantity, total, user_id, product_id],
                            (err, cartResult) => {
                                if (err) {
                                    console.error("Error updating cart:", err);
                                    return db.rollback(() => res.status(500).json({ message: "เกิดข้อผิดพลาดในการอัปเดตตะกร้า" }));
                                }

                                console.log(`Cart updated successfully for user ${user_id}, product ${product_id}`);

                                // คำนวณ reserved ใหม่
                                db.query(
                                    `SELECT SUM(quantity) AS totalReserved FROM cart WHERE product_id = ?`,
                                    [product_id],
                                    (err, sumRows) => {
                                        if (err) {
                                            console.error("Error calculating total reserved:", err);
                                            return db.rollback(() => res.status(500).json({ message: "เกิดข้อผิดพลาดในการคำนวณ reserved" }));
                                        }

                                        const newTotalReserved = sumRows[0]?.totalReserved || 0;
                                        console.log(`Calculated total reserved for product ${product_id}: ${newTotalReserved}`);

                                        // อัปเดตสล็อต
                                        db.query(
                                            `UPDATE product_slots 
                                            SET reserved = ?, 
                                                status = CASE WHEN sold + ? >= quantity THEN 'inactive' ELSE 'active' END,
                                                updated_at = NOW()
                                            WHERE slot_id = ?`,
                                            [newTotalReserved, newTotalReserved, slot.slot_id],
                                            (err, slotResult) => {
                                                if (err) {
                                                    console.error("Error updating slot:", err, {
                                                        newTotalReserved,
                                                        slot_id: slot.slot_id,
                                                        sql_values: [newTotalReserved, newTotalReserved, slot.slot_id]
                                                    });
                                                    return db.rollback(() => res.status(500).json({ message: "เกิดข้อผิดพลาดในการอัปเดตสล็อต" }));
                                                }

                                                console.log(`Slot updated successfully - Reserved: ${newTotalReserved}`);
                                                const newRemaining = slot.quantity - slot.sold - newTotalReserved;

                                                // เปิดล็อตถัดไปอัตโนมัติ ถ้ามีล็อต pending
                                                db.query(
                                                    `UPDATE product_slots
                                                    SET status = 'active'
                                                    WHERE product_id = ? AND status = 'pending'
                                                    ORDER BY start_date ASC
                                                    LIMIT 1`,
                                                    [product_id],
                                                    (errNext) => {
                                                        if (errNext) console.error("เปิดล็อตถัดไปล้มเหลว", errNext);
                                                    }
                                                );

                                                // ส่วนแจ้งเตือน admin (ทำให้ปลอดภัยขึ้น)
                                                const sendLowStockAlert = () => {
                                                    if (newRemaining <= 5 && newRemaining >= 0) {
                                                        db.query(
                                                            `SELECT user_id FROM users WHERE role_id = 1 AND is_active = 1`,
                                                            (err, admins) => {
                                                                if (!err && admins && admins.length > 0) {
                                                                    const alertMessage = `สล็อตสินค้า "${slot.slot_name || 'ไม่ระบุ'}" ของ "${product_name}" คงเหลือ ${newRemaining} ชิ้น`;

                                                                    admins.forEach(admin => {
                                                                        db.query(
                                                                            `INSERT INTO notifications (user_id, type, message, related_id, send_date, status)
                                                                             VALUES (?, 'stock', ?, ?, NOW(), 'ยังไม่อ่าน')
                                                                             ON DUPLICATE KEY UPDATE 
                                                                                 message = VALUES(message),
                                                                                 send_date = NOW(),
                                                                                 status = 'ยังไม่อ่าน'`,
                                                                            [admin.user_id, alertMessage, slot.slot_id],
                                                                            (err) => {
                                                                                if (err) console.error("Error creating notification:", err);
                                                                            }
                                                                        );
                                                                    });
                                                                }
                                                            }
                                                        );
                                                    }
                                                };

                                                // ส่วน logging (ทำให้ปลอดภัยขึ้น)
                                                // const logAction = (callback) => {
                                                //     if (typeof logOrder === 'function') {
                                                //         logOrder(user_id, null, `อัปเดตจำนวนสินค้า "${product_name}" ในตะกร้าจาก ${prevQty} เป็น ${quantity} ชิ้น`, callback);
                                                //     } else {
                                                //         console.log(`Log: User ${user_id} updated ${product_name} from ${prevQty} to ${quantity}`);
                                                //         callback();
                                                //     }
                                                // };

                                                // ดึงข้อมูลตะกร้าทั้งหมด
                                                db.query(
                                                    `SELECT 
                                                        c.product_id,
                                                        c.quantity,
                                                        c.total,
                                                        p.product_name,
                                                        p.price,
                                                        p.image
                                                    FROM cart c
                                                    JOIN products p ON c.product_id = p.product_id
                                                    WHERE c.user_id = ?
                                                    ORDER BY c.updated_at DESC`,
                                                    [user_id],
                                                    (err, allCartItems) => {
                                                        // ไม่ให้ error ตรงนี้หยุดการทำงาน
                                                        if (err) {
                                                            console.error("Error fetching all cart items (non-critical):", err);
                                                            allCartItems = null;
                                                        }

                                                        // เรียกส่วน notification และ logging แบบ async
                                                        sendLowStockAlert();

                                                        // logAction((logErr) => {
                                                        //     if (logErr) console.error("Error logging action:", logErr);
                                                        // });

                                                        // คำนวณสรุปตะกร้า
                                                        let cartSummary = null;
                                                        if (allCartItems && allCartItems.length > 0) {
                                                            const totalItems = allCartItems.reduce((sum, item) => sum + parseInt(item.quantity || 0), 0);
                                                            const totalAmount = allCartItems.reduce((sum, item) => sum + parseFloat(item.total || 0), 0);

                                                            cartSummary = {
                                                                total_items: totalItems,
                                                                total_amount: totalAmount,
                                                                item_count: allCartItems.length,
                                                                items: allCartItems
                                                            };
                                                        }

                                                        // Commit transaction
                                                        db.commit(err => {
                                                            if (err) {
                                                                console.error("Error committing transaction:", err);
                                                                return db.rollback(() => res.status(500).json({ message: "เกิดข้อผิดพลาดในการบันทึกการเปลี่ยนแปลง" }));
                                                            }

                                                            // console.log(`Transaction committed successfully`);

                                                            // ส่ง response
                                                            const responseData = {
                                                                success: true,
                                                                message: "อัปเดตจำนวนสินค้าในตะกร้าสำเร็จ",
                                                                updated_item: {
                                                                    product_id,
                                                                    product_name,
                                                                    quantity,
                                                                    total,
                                                                    price_per_unit: price
                                                                },
                                                                stock_remaining: newRemaining,
                                                                stock_reserved: newTotalReserved,
                                                                cart_summary: cartSummary
                                                            };

                                                            // console.log(`Sending success response`);
                                                            res.json(responseData);
                                                        });
                                                    }
                                                );
                                            }
                                        );
                                    }
                                );
                            }
                        );
                    });
                }
            );
        });
    });
});

// ลบสินค้าออกจากตะกร้า
route.delete('/cart/:productId', (req, res) => {
    const { productId } = req.params;
    const userId = req.session.user?.id;

    if (!userId || !productId) {
        return res.status(400).json({ message: "ต้องการ user_id และ product_id" });
    }

    db.beginTransaction(err => {
        if (err) return res.status(500).json({ message: "ไม่สามารถเริ่ม transaction ได้" });

        db.query(`SELECT quantity FROM cart WHERE user_id = ? AND product_id = ? FOR UPDATE`, [userId, productId], (err, cartRows) => {
            if (err) return db.rollback(() => res.status(500).json({ message: "เกิดข้อผิดพลาดในการค้นหาตะกร้า" }));
            if (!cartRows || cartRows.length === 0) return db.rollback(() => res.status(404).json({ message: "ไม่พบสินค้าในตะกร้า" }));

            const quantityInCart = cartRows[0].quantity;

            db.query(
                `SELECT slot_id, reserved, quantity, sold 
                 FROM product_slots 
                 WHERE product_id = ? AND status IN ('active', 'ended')
                 ORDER BY start_date ASC LIMIT 1`,
                [productId],
                (err, slotRows) => {
                    if (err) return db.rollback(() => res.status(500).json({ message: "เกิดข้อผิดพลาดในการค้นหาสล็อต" }));
                    if (!slotRows || slotRows.length === 0) return db.rollback(() => res.status(400).json({ message: "ไม่มีสล็อตสำหรับสินค้านี้" }));

                    const slot = slotRows[0];

                    db.query(`DELETE FROM cart WHERE user_id = ? AND product_id = ?`, [userId, productId], (err) => {
                        if (err) return db.rollback(() => res.status(500).json({ message: "เกิดข้อผิดพลาดในการลบสินค้าจากตะกร้า" }));

                        // คำนวณ reserved ใหม่และอัปเดต status
                        const newReserved = Math.max(0, slot.reserved - quantityInCart);
                        const newStatus = (slot.quantity - slot.sold - newReserved > 0) ? 'active' : 'ended';

                        db.query(
                            `UPDATE product_slots 
                             SET reserved = ?, status = ?
                             WHERE slot_id = ?`,
                            [newReserved, newStatus, slot.slot_id],
                            (err) => {
                                if (err) return db.rollback(() => res.status(500).json({ message: "เกิดข้อผิดพลาดในการอัปเดตสล็อต" }));

                                // หลังจากอัปเดต reserved และ status ของล็อตแรกเรียบร้อย
                                db.query(
                                    `UPDATE product_slots
                                    SET status = 'active'
                                    WHERE product_id = ? AND status = 'pending'
                                    ORDER BY start_date ASC
                                    LIMIT 1`,
                                    [productId],
                                    (errNext) => {
                                        if (errNext) console.error("เปิดล็อตถัดไปล้มเหลว", errNext);
                                });

                                db.commit(err => {
                                    if (err) return db.rollback(() => res.status(500).json({ message: "เกิดข้อผิดพลาดในการบันทึก transaction" }));
                                    res.json({
                                        message: "ลบสินค้าออกจากตะกร้าเรียบร้อยแล้ว",
                                        removed_quantity: quantityInCart
                                    });
                                });
                            }
                        );
                    });
                }
            );
        });
    });
});

// จ่ายเงินอันเดิม
route.post('/checkout', upload.single('paymentSlip'), async (req, res) => {
    const {products, user_addresses_id } = req.body;
    const user_id = req.session.user?.id;

    if (!user_id || !products || !user_addresses_id) {
        return res.status(400).json({ error: "ข้อมูลไม่ครบถ้วน" });
    }

    // (พลอยเพิ่ม)ดึงข้อมูลที่อยู่จาก user_addresses
    const [addrRows] = await db.promise().query(
        `SELECT * FROM user_addresses WHERE user_addresses_id = ?`,
        [user_addresses_id]
    );

    if (!addrRows.length) {
        return res.status(400).json({ error: "ที่อยู่ไม่ถูกต้อง" });
    }

    let parsedProducts;
    try {
        parsedProducts = JSON.parse(products);
    } catch (err) {
        return res.status(400).json({ error: "รูปแบบสินค้าไม่ถูกต้อง" });
    }

    if (!Array.isArray(parsedProducts) || parsedProducts.length === 0) {
        return res.status(400).json({ error: "ไม่มีรายการสินค้า" });
    }

    // ตรวจสอบว่าทุก product มี seller_id หรือไม่
    let sellerId;
    let sellerProducts = parsedProducts;
    if (parsedProducts.length > 0 && parsedProducts[0].user_id) {
        const sellerIds = [...new Set(parsedProducts.map(p => p.user_id))];
        if (sellerIds.length !== 1) {
            return res.status(400).json({ error: "กรุณาเลือกชำระสินค้าเฉพาะของผู้ขายเดียวกันเท่านั้น" });
        }
        sellerId = sellerIds[0];
    } else {
        const [sellerRows] = await db.promise().query(
            `SELECT user_id FROM products WHERE product_id = ? LIMIT 1`,
            [parsedProducts[0].product_id]
        );
        if (!sellerRows || sellerRows.length === 0) {
            return res.status(400).json({ error: "ไม่พบข้อมูลผู้ขายของสินค้า" });
        }
        sellerId = sellerRows[0].user_id;
    }

    // ตรวจสอบ promptpay_number ของสินค้าทุกชิ้น
    const promptpays = [...new Set(parsedProducts.map(p => p.promptpay_number))];
    if (promptpays.length !== 1 || !promptpays[0]) {
        return res.status(400).json({ error: "กรุณาเลือกชำระสินค้าเฉพาะที่มี PromptPay เดียวกันเท่านั้น" });
    }
    const promptpayNumber = promptpays[0];

    try {
        // ดึง payment_method_id จากสินค้าชิ้นแรก
        let paymentMethodId;
        if (sellerProducts.length > 0) {
            const [pmRows] = await db.promise().query(
                `SELECT payment_method_id FROM products WHERE product_id = ? LIMIT 1`,
                [sellerProducts[0].product_id]
            );
            if (!pmRows || pmRows.length === 0) {
                return res.status(400).json({ error: "ไม่พบ payment method ของสินค้า" });
            }
            paymentMethodId = pmRows[0].payment_method_id;
        } else {
            return res.status(400).json({ error: "ไม่มีสินค้า" });
        }

        const slipPath = req.file ? req.file.filename : null;

        const total_amount = sellerProducts.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const total_quantity = sellerProducts.reduce((sum, item) => sum + item.quantity, 0);

        // สร้างคำสั่งซื้อ (order_status = 'pending_verification')
        const [orderResult] = await db.promise().query(
            `INSERT INTO orders (
                user_id, 
                seller_id, 
                payment_status, 
                quantity, 
                order_status, 
                total_amount, 
                user_addresses_id,
                order_date
            )
            VALUES (?, ?, 'pending', ?, 'pending_verification', ?, ?, NOW())`,
            [user_id, sellerId, total_quantity, total_amount, user_addresses_id]
        );

        const orderId = orderResult.insertId;

        // บันทึก log การสั่งซื้อ
        logOrder(user_id, orderId, "สั่งซื้อสินค้า");

        // เพิ่มข้อมูลการชำระเงิน (payment_status = 'paid')
        const [paymentResult] = await db.promise().query(
            `INSERT INTO payment (order_id, amount, payment_status, payment_date, created_at, payment_method_id, slip_path)
             VALUES (?, ?, 'pending', NOW(), NOW(), ?, ?)`,
            [orderId, total_amount, paymentMethodId, slipPath]
        );

        const paymentId = paymentResult.insertId;

        await db.promise().query(
            `UPDATE orders SET payment_id = ? WHERE order_id = ?`,
            [paymentId, orderId]
        );

        if (slipPath) {
            logOrder(user_id, orderId, "อัปโหลดสลิปการชำระเงิน");
        }

        // เพิ่มรายละเอียดสินค้า
        const insertItems = sellerProducts.map(product =>
            db.promise().query(
                `INSERT INTO order_detail (order_id, product_id, quantity, total)
                VALUES (?, ?, ?, ?)`,
                [orderId, product.product_id, product.quantity, product.price * product.quantity]
            )
        );

        await Promise.all(insertItems);

        // ลบสินค้าจากตะกร้า
        const productIds = sellerProducts.map(p => p.product_id);
        await db.promise().query(
            `DELETE FROM cart WHERE user_id = ? AND product_id IN (${productIds.map(() => '?').join(',')})`,
            [user_id, ...productIds]
        );

        // แจ้งเตือนแอดมิน
        await notifyAdminNewOrder(orderId, user_id);


        res.status(200).json({ message: "สั่งซื้อสำเร็จ", orderId });

    } catch (error) {
        console.error("Checkout error:", error);
        res.status(500).json({ error: "เกิดข้อผิดพลาดในการสั่งซื้อ" });
    }
});

// route.post('/checkout', upload.single('paymentSlip'), async (req, res) => {
//     const { products, user_addresses_id } = req.body;
//     const user_id = req.session.user?.id;

//     if (!user_id || !products || !user_addresses_id) {
//         return res.status(400).json({ error: "ข้อมูลไม่ครบถ้วน" });
//     }

//     // ดึงข้อมูลที่อยู่
//     const [addrRows] = await db.promise().query(
//         `SELECT * FROM user_addresses WHERE user_addresses_id = ?`,
//         [user_addresses_id]
//     );
//     if (!addrRows.length) return res.status(400).json({ error: "ที่อยู่ไม่ถูกต้อง" });

//     let parsedProducts;
//     try {
//         parsedProducts = JSON.parse(products);
//     } catch (err) {
//         return res.status(400).json({ error: "รูปแบบสินค้าไม่ถูกต้อง" });
//     }

//     if (!Array.isArray(parsedProducts) || parsedProducts.length === 0) {
//         return res.status(400).json({ error: "ไม่มีรายการสินค้า" });
//     }

//     const isOfficial = parsedProducts.some(p => p.is_official === 1);

//     let sellerId = null;
//     let paymentMethodId = null;

//     try {
//         if (isOfficial) {
//             // กรณีสินค้าของสมาคม
//             const [pmRows] = await db.promise().query(
//                 `SELECT payment_method_id FROM payment_methods WHERE is_official = "1" LIMIT 1`
//             );
//             if (!pmRows.length) return res.status(400).json({ error: "ไม่พบบัญชีสมาคม" });
//             paymentMethodId = pmRows[0].payment_method_id;
//         } else {
//             // กรณีสินค้าผู้ขายทั่วไป
//             const sellerIds = [...new Set(parsedProducts.map(p => p.user_id))];
//             if (sellerIds.length !== 1)
//                 return res.status(400).json({ error: "เลือกสินค้าได้จากผู้ขายเดียวเท่านั้น" });

//             sellerId = sellerIds[0];

//             const [pmRows] = await db.promise().query(
//                 `SELECT payment_method_id FROM products WHERE user_id = ? LIMIT 1`,
//                 [sellerId]
//             );
//             if (!pmRows.length) return res.status(400).json({ error: "ไม่พบ payment method ของผู้ขาย" });
//             paymentMethodId = pmRows[0].payment_method_id;
//         }

//         // คำนวณยอดรวม
//         const total_amount = parsedProducts.reduce((sum, item) => sum + (item.price * item.quantity), 0);
//         const total_quantity = parsedProducts.reduce((sum, item) => sum + item.quantity, 0);
//         const slipPath = req.file ? req.file.filename : null;

//         // บันทึกคำสั่งซื้อ
//         const [orderResult] = await db.promise().query(
//             `INSERT INTO orders (
//                 user_id, seller_id, payment_status, quantity, order_status, total_amount, user_addresses_id, order_date
//             )
//             VALUES (?, ?, 'pending', ?, 'pending_verification', ?, ?, NOW())`,
//             [user_id, sellerId, total_quantity, total_amount, user_addresses_id]
//         );

//         const orderId = orderResult.insertId;

//         // เพิ่มข้อมูลการชำระเงิน
//         const [paymentResult] = await db.promise().query(
//             `INSERT INTO payment (order_id, amount, payment_status, payment_date, created_at, payment_method_id, slip_path)
//             VALUES (?, ?, 'pending', NOW(), NOW(), ?, ?)`,
//             [orderId, total_amount, paymentMethodId, slipPath]
//         );

//         const paymentId = paymentResult.insertId;
//         await db.promise().query(`UPDATE orders SET payment_id = ? WHERE order_id = ?`, [paymentId, orderId]);

//         // เพิ่มรายละเอียดสินค้า
//         const insertItems = parsedProducts.map(p =>
//             db.promise().query(
//                 `INSERT INTO order_detail (order_id, product_id, quantity, total)
//                 VALUES (?, ?, ?, ?)`,
//                 [orderId, p.product_id, p.quantity, p.price * p.quantity]
//             )
//         );
//         await Promise.all(insertItems);

//         // ลบออกจากตะกร้า
//         const productIds = parsedProducts.map(p => p.product_id);
//         await db.promise().query(
//             `DELETE FROM cart WHERE user_id = ? AND product_id IN (${productIds.map(() => '?').join(',')})`,
//             [user_id, ...productIds]
//         );

//         await notifyAdminNewOrder(orderId, user_id);

//         res.status(200).json({ message: "สั่งซื้อสำเร็จ", orderId });

//     } catch (error) {
//         console.error("Checkout error:", error);
//         res.status(500).json({ error: "เกิดข้อผิดพลาดในการสั่งซื้อ" });
//     }
// });

// ดึงข้อมูลบัญชีธนาคารของ seller หรือสินค้าทางการ
// ดึงข้อมูลบัญชีธนาคาร (รองรับทั้งสมาคมและผู้ขาย)
route.get('/bank-info', async (req, res) => {
    try {
        const { isOfficial, sellerId } = req.query;

        let rows;

        if (isOfficial === "true") {
            // กรณีสินค้าของสมาคม
            [rows] = await db.promise().query(`
                SELECT 
                    account_name, 
                    bank_name, 
                    account_number, 
                    promptpay_number
                FROM payment_methods
                WHERE is_official = 1
                LIMIT 1
            `);
        } else if (sellerId && !isNaN(Number(sellerId))) {
            // กรณีสินค้าผู้ขายทั่วไป
            [rows] = await db.promise().query(`
                SELECT 
                    pm.account_name, 
                    pm.bank_name, 
                    pm.account_number, 
                    pm.promptpay_number
                FROM payment_methods pm
                JOIN products p ON p.payment_method_id = pm.payment_method_id
                WHERE p.user_id = ?
                LIMIT 1
            `, [sellerId]);
        } else {
           
            // ถ้าไม่มี params ให้ดึงข้อมูลสมาคม (official) เป็น default
            [rows] = await db.promise().query(`
                SELECT 
                    account_name, 
                    bank_name, 
                    account_number, 
                    promptpay_number
                FROM payment_methods
                WHERE is_official = 1
                LIMIT 1
            `);
        }

        if (!rows || rows.length === 0) {
            // ถ้าไม่พบข้อมูลจริงๆ ใน DB ถึงจะคืน default
            return res.status(200).json({
                success: true,
                data: {
                    account_name: "-",
                    bank_name: "-",
                    account_number: "-",
                    promptpay_number: null
                }
            });
        }

        // ส่งข้อมูลบัญชีกลับ
        res.json({
            success: true,
            data: rows[0]
        });

    } catch (error) {
        console.error("Error fetching bank info:", error);
        res.status(500).json({
            success: false,
            message: "เกิดข้อผิดพลาดจากเซิร์ฟเวอร์"
        });
    }
});



// ฟังก์ชันแจ้งเตือนแอดมินและผู้ขายเมื่อมีการสั่งซื้อใหม่
async function notifyAdminNewOrder(orderId, buyerId) {
    const insertNoti = `
        INSERT INTO notifications (user_id, type, message, related_id, send_date, status)
        VALUES (?, 'order', ?, ?, NOW(), 'ยังไม่อ่าน')
        ON DUPLICATE KEY UPDATE 
            message = VALUES(message),
            send_date = NOW(),
            status = 'ยังไม่อ่าน';
    `;

    try {
        // ดึงชื่อสินค้าทั้งหมดในคำสั่งซื้อ
        const [products] = await db.promise().query(
            `SELECT GROUP_CONCAT(p.product_name SEPARATOR ', ') AS product_names
             FROM order_detail oi
             JOIN products p ON oi.product_id = p.product_id
             WHERE oi.order_id = ?`,
            [orderId]
        );

        const productNames = products[0]?.product_names || "สินค้า";

        // แจ้งเตือนแอดมิน
        const [admins] = await db.promise().query(
            `SELECT user_id FROM users WHERE role_id = 1 AND is_active = 1`
        );
        if (admins && admins.length > 0) {
            const message = `มีคำสั่งซื้อใหม่รายการที่: ${orderId} (${productNames})`;
            for (const admin of admins) {
                await db.promise().query(insertNoti, [admin.user_id, message, orderId]);
            }
        }

        // แจ้งเตือนผู้ขาย
        const [sellers] = await db.promise().query(
            `SELECT DISTINCT p.user_id AS seller_id
             FROM order_detail oi 
             JOIN products p ON oi.product_id = p.product_id 
             WHERE oi.order_id = ?`,
            [orderId]
        );

        if (sellers && sellers.length > 0) {
            for (const seller of sellers) {
                const sellerMessage = `มีคำสั่งซื้อสินค้าของคุณ (${productNames})`;
                await db.promise().query(insertNoti, [seller.seller_id, sellerMessage, orderId]);
            }
        }
    } catch (err) {
        console.error("Error notifying (admin/sellers):", err);
    }
}


// ประวัติการซื้อ
route.get('/order_history', async (req, res) => {
    const userId = req.session.user?.id;

    if (!userId) {
        return res.status(400).json({ error: 'กรุณาระบุ user_id' });
    }

    try {
        const [orders] = await db.promise().query(
            `SELECT o.order_id, o.total_amount, o.shippingAddress, o.order_status, o.order_date, p.payment_status 
             FROM orders o
             LEFT JOIN payment p ON o.payment_id = p.payment_id
             WHERE o.user_id = ?
             ORDER BY o.order_date DESC`, [userId]
        );

        if (orders.length === 0) {
            return res.status(404).json({ message: 'ไม่พบประวัติการสั่งซื้อ' });
        }

        const orderDetailsPromises = orders.map(async (order) => {
            const [orderDetails] = await db.promise().query(
                `SELECT od.product_id, od.quantity, od.total, p.product_name
                FROM order_detail od
                LEFT JOIN products p ON od.product_id = p.product_id
                WHERE od.order_id = ?`, [order.order_id]
            );

            order.details = orderDetails;
            return order;
        });

        const ordersWithDetails = await Promise.all(orderDetailsPromises);

        res.json(ordersWithDetails);

    } catch (error) {
        console.error("Error fetching order history:", error);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูลประวัติการสั่งซื้อ' });
    }
});

// สร้าคิวอาร์โค้ดสำหรับ PromptPay
// route.post('/generateQR', async (req, res) => {
//     const { amount, numberPromtpay } = req.body;

//     console.log("REQ BODY:", req.body); // ตรวจสอบข้อมูลที่ส่งมา

//     if (!numberPromtpay || isNaN(amount)) {
//         return res.status(400).json({ RespCode: 400, RespMessage: 'ข้อมูลไม่ครบถ้วน' });
//     }

//     try {
//         const payload = generatePayload(numberPromtpay, { amount: parseFloat(amount) });

//         const qrUrl = await QRCode.toDataURL(payload);

//         return res.status(200).json({
//             RespCode: 200,
//             RespMessage: 'QR Code generated successfully',
//             Result: qrUrl
//         });
//     } catch (err) {
//         console.error('Error generating QR code:', err);
//         return res.status(500).json({
//             RespCode: 500,
//             RespMessage: 'Internal Server Error',
//             error: err.toString()
//         });
//     }
// });

route.post('/generateQR', async (req, res) => {
    const { amount, numberPromtpay } = req.body;
    console.log("REQ BODY:", req.body);

    // ถ้าไม่มี promptpay ให้ตอบกลับแบบไม่ error
    if (!numberPromtpay) {
        return res.status(200).json({
            RespCode: 200,
            RespMessage: 'No PromptPay provided. Use bank transfer instead.',
            Result: null
        });
    }

    try {
        const payload = generatePayload(numberPromtpay, { amount: parseFloat(amount) });
        const qrUrl = await QRCode.toDataURL(payload);

        return res.status(200).json({
            RespCode: 200,
            RespMessage: 'QR Code generated successfully',
            Result: qrUrl
        });
    } catch (err) {
        console.error('Error generating QR code:', err);
        return res.status(500).json({
            RespCode: 500,
            RespMessage: 'Internal Server Error',
            error: err.toString()
        });
    }
});


module.exports = route;