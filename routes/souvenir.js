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


// ดึงข้อมูลสินค้าทั้งหมด
route.get('/', (req, res) => {
    const query = `
    SELECT 
    products.*, role.role_id
    FROM products 
    JOIN users ON products.user_id = users.user_id
    JOIN role ON users.role_id = role.role_id
    WHERE status = "1"
    `;
  
    db.query(query, (err, results) => {
        if (err) {
            console.error('Database query failed:', err);
            res.status(500).json({ error: 'Database query failed' });
            return;
        }
        res.json(results);
    });
});

// ดึงรายละเอียดของสินค้า
route.get('/souvenirDetail/:id', (req, res) => {
    const productId = req.params.id;

    const query = `
        SELECT p.*, pm.promptpay_number
        FROM products p
        JOIN payment_methods pm ON p.payment_method_id = pm.payment_method_id
        WHERE p.product_id = ?
    `;

    db.query(query, [productId], (err, results) => {
        if (err) {
            console.error('Error fetching product details:', err);
            return res.status(500).json({ error: 'Error fetching product details' });
        }

        if (results.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }


        res.status(200).json(results[0]);
    });
});

route.post('/addsouvenir', upload.single('image'), (req, res) => {
    const { productName, description, price, stock } = req.body;
        res.status(200).json({
            ...results[0],
            out_of_stock: results[0].stock <= 0
        });

    });
});

// รอการอนุมัติคำขอ
route.get('/pending-requests', (req, res) => {
    const userId = req.session.user?.id;

    if (!userId) {
        return res.status(401).json({ error: "ไม่ได้เข้าสู่ระบบ" });
    }

    // ตอนนี้มีแค่สินค้า
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

    // Begin transaction
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
                "0",  // ยังไม่อนุมัติ
                payment_method_id
            ];

            db.query(queryProduct, valuesProduct, (err, result) => {
                if (err) {
                    return db.rollback(() => {
                        // Rollback: ลบ payment method ที่เพิ่มไป
                        db.query(`DELETE FROM payment_methods WHERE id = ?`, [payment_method_id], (deleteErr) => {
                            if (deleteErr) {
                                console.error('Rollback failed:', deleteErr);
                            }
                        });
                        return res.status(500).json({ error: 'Error inserting product' });
                    });
                }

                //เพิ่มแจ้งเตือนหลังจากเพิ่มสินค้า
                const insertedProductName = productName;
                const notifyQuery = `
                    INSERT INTO notifications (user_id, type, message)
                    VALUES ? 
                `;

                db.query(`SELECT user_id FROM users WHERE role_id IN (1, 2)`, (err, resultUsers) => {
                    if (err) {
                        return db.rollback(() => {
                            return res.status(500).json({ error: 'Failed to fetch target users for notification' });
                        });
                    }

                    const notifications = resultUsers.map(row => [
                        row.user_id,
                        'souvenir_request',
                        `มีคำขอเพิ่มของที่ระลึก: ${insertedProductName}`
                    ]);

                    if (notifications.length > 0) {
                        db.query(notifyQuery, [notifications], (err, notifyResult) => {
                            if (err) {
                                return db.rollback(() => {
                                    return res.status(500).json({ error: 'Failed to insert notifications' });
                                });
                            }

                            // Commit transaction if everything is successful
                            db.commit((err) => {
                                if (err) {
                                    return db.rollback(() => {
                                        return res.status(500).json({ error: 'Failed to commit transaction' });
                                    });
                                }
                                return res.status(200).json({ message: 'Product, payment method, and notifications added successfully' });
                            });
                        });
                    } else {
                        db.commit((err) => {
                            if (err) {
                                return db.rollback(() => {
                                    return res.status(500).json({ error: 'Failed to commit transaction' });
                                });
                            }
                            return res.status(200).json({ message: 'Product and payment method added (no users to notify)' });
                        });
                    }
                });
            });
        });
    });
});


// ดึงตะกร้ามาจ้า
route.get('/cart', (req, res) => {
    const user_id = req.query.user_id;

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
    const { user_id } = req.query;

    if (!user_id) {
        return res.status(400).json({ error: "User ID is required" });
    }

    const query = `SELECT SUM(quantity) AS cartCount FROM cart WHERE user_id = ?`;

    db.query(query, [user_id], (err, results) => {
        if (err) {
            console.error('Error fetching cart count:', err);
            return res.status(500).json({ error: 'Database error' });
        }
      
        res.status(200).json({ message: 'Product added successfully' });
    });
});

// ดึงตะกร้ามาจ้า
route.get('/cart', (req, res) => {
    const user_id = req.query.user_id;

    if (!user_id) {
        return res.status(400).json({ error: 'User ID is required' });
    }

    const query = `
        SELECT cart.*, products.product_id, products.product_name, users.user_id, 
        products.price,products.image
        FROM cart
        JOIN users ON cart.user_id = users.user_id
        JOIN products ON cart.product_id = products.product_id
        WHERE cart.user_id = ?
    `;

    db.query(query, [user_id], (err, results) => {
        if (err) {
            console.error('Error executing query:', err);  // เพิ่ม log ข้อผิดพลาด
            return res.status(500).json({ error: 'Error fetching cart details', details: err });
        }

        res.status(200).json(results.length > 0 ? results : []);
    });
});

route.put("/cart/update", (req, res) => {
    const { user_id, product_id, quantity } = req.body;

    if (!user_id || !product_id || quantity < 1) {
        return res.status(400).json({ message: "ข้อมูลไม่ถูกต้อง" });
    }

    const sql = "UPDATE cart SET quantity = ? WHERE user_id = ? AND product_id = ?";
    db.query(sql, [quantity, user_id, product_id], (err, result) => {
        if (err) {
            console.error("Error updating cart:", err);
            return res.status(500).json({ message: "เกิดข้อผิดพลาด" });
        }
        res.json({ message: "อัปเดตจำนวนสินค้าเรียบร้อย" });
    });
});


route.post('/cart/add', (req, res) => {
    const { product_id, quantity, user_id, total } = req.body;

    // ตรวจสอบค่าที่ได้รับ
        console.log("จำนวนสินค้าในตะกร้า:", results[0].cartCount);
        res.json({ cartCount: results[0].cartCount || 0 });
    });
});


// อัพเดตจำนวนสินค้า
route.put('/cart/update', (req, res) => {
    const { user_id, product_id, quantity, total } = req.body;

    if (!user_id || !product_id || quantity < 1 || isNaN(total)) {
        return res.status(400).json({ message: "ข้อมูลไม่ถูกต้อง" });
    }

    // เริ่ม Transaction
    db.beginTransaction(err => {
        if (err) return res.status(500).send("ไม่สามารถเริ่ม transaction");

        // ดึง stock ปัจจุบัน
        const stockQuery = `SELECT stock FROM products WHERE product_id = ? FOR UPDATE`;
        db.query(stockQuery, [product_id], (err, stockResult) => {
            if (err) return db.rollback(() => res.status(500).send("ดึง stock ผิดพลาด"));

            const stock = stockResult[0]?.stock || 0;
            if (stock < quantity) {
                return db.rollback(() => res.status(400).send("จำนวนสินค้าไม่พอในคลัง"));
            }

            // ตรวจสอบจำนวนสินค้าเดิมใน cart
            const checkCartQuery = `SELECT quantity FROM cart WHERE user_id = ? AND product_id = ?`;
            db.query(checkCartQuery, [user_id, product_id], (err, cartResult) => {
                if (err) return db.rollback(() => res.status(500).send("ตรวจสอบ cart ผิดพลาด"));

                const prevQty = cartResult[0]?.quantity || 0;
                const diff = quantity - prevQty;

                // อัปเดตจำนวนใน cart
                const updateCart = `UPDATE cart SET quantity = ?, total = ? WHERE user_id = ? AND product_id = ?`;
                db.query(updateCart, [quantity, total, user_id, product_id], (err) => {
                    if (err) return db.rollback(() => res.status(500).send("อัปเดต cart ผิดพลาด"));

                    // อัปเดต stock
                    const updateStock = `UPDATE products SET stock = stock - ? WHERE product_id = ?`;
                    db.query(updateStock, [diff, product_id], (err) => {
                        if (err) return db.rollback(() => res.status(500).send("อัปเดต stock ผิดพลาด"));

                        db.commit(err => {
                            if (err) return db.rollback(() => res.status(500).send("commit ผิดพลาด"));
                            res.json({ message: "อัปเดตจำนวนสินค้าในตะกร้าสำเร็จ" });
                        });
                    });
                });
            });
        });
    });
});

// เพิ่มจำนวนสินค้า
route.post('/cart/add', (req, res) => {
    const { product_id, quantity, user_id, total } = req.body;

    if (!product_id || !quantity || !user_id || isNaN(total)) {
        return res.status(400).send("ข้อมูลไม่ครบถ้วนหรือค่าผิดพลาด");
    }

    const query = `UPDATE cart SET quantity = ?, total = ? WHERE user_id = ? AND product_id = ?`;

    db.query(query, [quantity, total, user_id, product_id], (err, result) => {
        if (err) {
            console.error("Error updating cart:", err);
            return res.status(500).send("Error updating cart");
        }

        if (result.affectedRows === 0) {
            const insertQuery = `INSERT INTO cart (user_id, product_id, quantity, total) VALUES (?, ?, ?, ?)`;
            db.query(insertQuery, [user_id, product_id, quantity, total], (err, result) => {
                if (err) {
                    console.error("Error inserting into cart:", err);
                    return res.status(500).send("Error adding to cart");
                }
                res.send("เพิ่มสินค้าเข้าตะกร้าแล้ว!");
            });
        } else {
            res.send("ตะกร้าของคุณถูกอัปเดตแล้ว!");
        }
    });
});



// สำหรับลบสินค้าในตะกร้า
route.delete('/cart/:productId', (req, res) => {
    const { productId } = req.params;
    const deleteQuery = 'DELETE FROM cart WHERE product_id = ?';

    db.query(deleteQuery, [productId], (err, results) => {
        if (err) {
            console.error("Error deleting item:", err);
            return res.status(500).json({ error: "Error deleting item from cart" });
        }

        res.status(200).json({ message: "Item deleted from cart" });
    });
});

    // เริ่ม Transaction
    db.beginTransaction(err => {
        if (err) return res.status(500).send("ไม่สามารถเริ่ม transaction");

        // ดึง stock ปัจจุบัน
        const stockQuery = `SELECT stock FROM products WHERE product_id = ? FOR UPDATE`;
        db.query(stockQuery, [product_id], (err, stockResult) => {
            if (err) return db.rollback(() => res.status(500).send("ดึง stock ผิดพลาด"));

            const stock = stockResult[0]?.stock || 0;
            if (stock < quantity) {
                return db.rollback(() => res.status(400).send("จำนวนสินค้าไม่พอในคลัง"));
            }

            // ตรวจว่ามีใน cart แล้วหรือไม่
            const checkCartQuery = `SELECT quantity FROM cart WHERE user_id = ? AND product_id = ?`;
            db.query(checkCartQuery, [user_id, product_id], (err, cartResult) => {
                if (err) return db.rollback(() => res.status(500).send("ตรวจสอบ cart ล้มเหลว"));

                let diff = quantity;
                if (cartResult.length > 0) {
                    const prevQty = cartResult[0].quantity;
                    diff = quantity - prevQty;

                    const updateCart = `UPDATE cart SET quantity = ?, total = ? WHERE user_id = ? AND product_id = ?`;
                    db.query(updateCart, [quantity, total, user_id, product_id], (err) => {
                        if (err) return db.rollback(() => res.status(500).send("อัปเดต cart ล้มเหลว"));

                        const updateStock = `UPDATE products SET stock = stock - ? WHERE product_id = ?`;
                        db.query(updateStock, [diff, product_id], (err) => {
                            if (err) return db.rollback(() => res.status(500).send("อัปเดต stock ล้มเหลว"));

                            db.commit(err => {
                                if (err) return db.rollback(() => res.status(500).send("commit ล้มเหลว"));
                                res.json({ message: "อัปเดตตะกร้าสำเร็จ", updateCart: true });
                            });
                        });
                    });
                } else {
                    // เพิ่มใหม่
                    const insertCart = `INSERT INTO cart (user_id, product_id, quantity, total) VALUES (?, ?, ?, ?)`;
                    db.query(insertCart, [user_id, product_id, quantity, total], (err) => {
                        if (err) return db.rollback(() => res.status(500).send("เพิ่มตะกร้าล้มเหลว"));

                        const updateStock = `UPDATE products SET stock = stock - ? WHERE product_id = ?`;
                        db.query(updateStock, [quantity, product_id], (err) => {
                            if (err) return db.rollback(() => res.status(500).send("อัปเดต stock ล้มเหลว"));

                            db.commit(err => {
                                if (err) return db.rollback(() => res.status(500).send("commit ล้มเหลว"));
                                res.json({ message: "เพิ่มสินค้าสำเร็จ", updateCart: true });
                            });
                        });
                    });
                }
            });
        });
    });
});


// สำหรับลบสินค้าในตะกร้า
route.delete('/cart/:productId', (req, res) => {
    const { productId } = req.params;
    const { userId } = req.body;

    if (!userId) {
        return res.status(400).json({ message: "ต้องการ user_id" });
    }

    // เริ่ม Transaction
    db.beginTransaction(err => {
        if (err) return res.status(500).send("ไม่สามารถเริ่ม transaction");

        // ดึงข้อมูลสินค้าใน cart และ stock ปัจจุบัน
        const cartQuery = `SELECT quantity FROM cart WHERE user_id = ? AND product_id = ?`;
        db.query(cartQuery, [userId, productId], (err, cartResult) => {
            if (err) return db.rollback(() => res.status(500).send("ดึง cart ผิดพลาด"));

            if (cartResult.length === 0) {
                return db.rollback(() => res.status(404).send("ไม่พบสินค้าในตะกร้า"));
            }

            const quantity = cartResult[0].quantity;

            // ลบสินค้าใน cart
            const deleteQuery = `DELETE FROM cart WHERE user_id = ? AND product_id = ?`;
            db.query(deleteQuery, [userId, productId], (err) => {
                if (err) return db.rollback(() => res.status(500).send("ลบสินค้าใน cart ผิดพลาด"));

                // อัปเดต stock
                const updateStockQuery = `UPDATE products SET stock = stock + ? WHERE product_id = ?`;
                db.query(updateStockQuery, [quantity, productId], (err) => {
                    if (err) return db.rollback(() => res.status(500).send("อัปเดต stock ผิดพลาด"));

                    db.commit(err => {
                        if (err) return db.rollback(() => res.status(500).send("commit ผิดพลาด"));
                        res.json({ message: "ลบสินค้าออกจากตะกร้าเรียบร้อยแล้ว" });
                    });
                });
            });
        });
    });
});

// ฟังก์ชันแจ้งเตือนแอดมินและผู้ขายเมื่อมีการสั่งซื้อใหม่
async function notifyAdminNewOrder(orderId, buyerId) {
    const insertNoti = `
        INSERT INTO notifications (user_id, type, message, related_id, send_date, status)
        VALUES (?, 'order', ?, ?, NOW(), 'ยังไม่อ่าน')
    `;

    try {
        // แจ้งเตือนแอดมิน
        const [admins] = await db.promise().query(
            `SELECT user_id FROM users WHERE role_id = 1 AND is_active = 1`
        );
        if (admins && admins.length > 0) {
            const message = `มีคำสั่งซื้อใหม่ Order ID: ${orderId}`;
            for (const admin of admins) {
                await db.promise().query(insertNoti, [admin.user_id, message, orderId]);
            }
        }
    } catch (err) {
        console.error("Error notifying admin:", err);
    }

    try {
        // ดึง seller_id ของสินค้าที่อยู่ใน order นี้
        const [sellers] = await db.promise().query(
            `SELECT DISTINCT p.user_id AS seller_id
             FROM order_detail oi 
             JOIN products p ON oi.product_id = p.product_id 
             WHERE oi.order_id = ?`,
            [orderId]
        );

        if (sellers && sellers.length > 0) {
            const sellerMessage = `สินค้าของคุณได้รับคำสั่งซื้อใหม่`;
            for (const seller of sellers) {
                await db.promise().query(insertNoti, [seller.seller_id, sellerMessage, orderId]);
            }
        }
    } catch (err) {
        console.error("Error notifying sellers:", err);
    }
}


// จ่ายเงิน
route.post('/checkout', upload.single('paymentSlip'), async (req, res) => {
    const { user_id, products, shippingAddress } = req.body;

    if (!user_id || !products || !shippingAddress) {
        return res.status(400).json({ error: "ข้อมูลไม่ครบถ้วน" });
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

    // ตรวจสอบว่าทุก product มี user_id (seller_id) หรือไม่
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

        // ตรวจสอบ stock และอัปเดต stock
        // ลดจำนวนสินค้า
        for (const item of parsedProducts) {
            const [product] = await db.promise().query(
                'SELECT stock FROM products WHERE product_id = ?',
                [item.product_id]
            );

            if (!product.length || product[0].stock < item.quantity) {
                return res.status(400).json({ error: `สินค้ามีจำนวนไม่เพียงพอสำหรับ ${item.product_name}` });
            }

            await db.promise().query(
                'UPDATE products SET stock = stock - ? WHERE product_id = ?',
                [item.quantity, item.product_id]
            );

            // บันทึก log การอัปเดต stock
            logOrder(user_id, null, `อัปเดต stock ของสินค้า ${item.product_name} (-${item.quantity})`);
        }

        // สร้างคำสั่งซื้อ (order_status = 'pending_verification')
        const [orderResult] = await db.promise().query(
            `INSERT INTO orders (
                user_id, 
                seller_id, 
                payment_status, 
                quantity, 
                order_status, 
                total_amount, 
                shippingAddress, 
                order_date
            )
            VALUES (?, ?, 'pending', ?, 'pending_verification', ?, ?, NOW())`,
            [user_id, sellerId, total_quantity, total_amount, shippingAddress]
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

        // อัปเดต payment_id ในตาราง orders
        await db.promise().query(
            `UPDATE orders SET payment_id = ? WHERE order_id = ?`,
            [paymentId, orderId]
        );

        // บันทึก log การอัปโหลดสลิป
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

        // ลบสินค้าจากตะกร้า (เฉพาะของ seller นี้)
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

// ประวัติการซื้อ
route.get('/order_history', async (req, res) => {
    const userId = req.query.user_id;

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
route.post('/generateQR', async (req, res) => {
    const { amount, numberPromtpay } = req.body;

    console.log("REQ BODY:", req.body); // ตรวจสอบข้อมูลที่ส่งมา

    if (!numberPromtpay || isNaN(amount)) {
        return res.status(400).json({ RespCode: 400, RespMessage: 'ข้อมูลไม่ครบถ้วน' });
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