// souvenir.js (User)
const express = require("express");
const route = express.Router();
const multer = require('multer');
const path = require('path');
const db = require('../db');

// const QRCode = require('qrcode');
// const { generatePayload } = require('promptpay');


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

    const query = 'SELECT * FROM products WHERE product_id = ?';
    db.query(query, [productId], (err, results) => {
        if (err) {
            console.error('Error fetching project details:', err);
            return res.status(500).json({ error: 'Error fetching product details' });
        }

        if (results.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }

        res.status(200).json(results[0]);
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
        SELECT cart.*, products.product_id, products.product_name, users.user_id, 
        products.price,products.image
        FROM cart
        JOIN users ON cart.user_id = users.user_id
        JOIN products ON cart.product_id = products.product_id
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



// จ่ายเงิน
route.post('/checkout', async (req, res) => {
    const { user_id, products, shippingAddress } = req.body;

    if (!user_id || !products || products.length === 0) {
        return res.status(400).json({ error: "ข้อมูลไม่ครบถ้วน" });
    }

    const total_amount = products.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const total_quantity = products.reduce((sum, item) => sum + item.quantity, 0);

    try {
        //method_id จากสินค้าเป็นค่าเดียวกันหรือไม่
        const paymentMethodIds = products.map((product) => product.payment_method_id);

        //payment_method_id ของสินค้าทั้งหมดเหมือนกันหรือไม่
        const uniquePaymentMethodIds = new Set(paymentMethodIds);
        if (uniquePaymentMethodIds.size > 1) {
            return res.status(400).json({ error: "สินค้าภายในคำสั่งซื้อมีวิธีการชำระเงินที่แตกต่างกัน" });
        }

        const paymentMethodId = [...uniquePaymentMethodIds][0];

        //สร้างคำสั่งซื้อใหม่
        const [orderResult] = await db.promise().query(
            "INSERT INTO orders (user_id, payment_status, quantity ,order_status, total_amount, shippingAddress, order_date, payment_id) VALUES (?, 'pending', ?, 'processing', ?, ?, NOW(), NULL)",
            [user_id, total_quantity, total_amount, shippingAddress]
        );

        const orderId = orderResult.insertId;

        //สร้างการชำระเงิน
        const [paymentResult] = await db.promise().query(
            "INSERT INTO payment (order_id, amount, payment_status, payment_date, created_at) VALUES (?, ?, 'pending', NOW(), NOW())",
            [orderId, total_amount, paymentMethodId]
        );

        const paymentId = paymentResult.insertId;

        //อัปเดตคำสั่งซื้อให้มี payment_id
        await db.promise().query(
            "UPDATE orders SET payment_id = ? WHERE order_id = ?",
            [paymentId, orderId]
        );

        //เพิ่มสินค้าในorder_detail
        const insertItems = products.map(product =>
            db.promise().query(
                "INSERT INTO order_detail (order_id, product_id, quantity, total) VALUES (?, ?, ?, ?)",
                [orderId, product.product_id, product.quantity, product.total]
            )
        );

        await Promise.all(insertItems);

        //เคลียสินค้าจากตะกร้า
        await db.promise().query("DELETE FROM cart WHERE user_id = ?", [user_id]);

        res.json({ message: "สั่งซื้อสำเร็จ!", orderId });

    } catch (error) {
        console.error("Error processing checkout:", error);
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


module.exports = route;