// const express = require("express");
// const router = express.Router();
// const multer = require('multer');
// const path = require('path');
// const db = require('../db');
// // const moment = require('moment');
// const { logManage, logDonation } = require('../logUserAction');

// // ตั้งค่า Multer สำหรับอัปโหลดไฟล์
// const storage = multer.diskStorage({
//     destination: function (req, file, cb) {
//         cb(null, 'uploads/'); // กำหนดโฟลเดอร์เก็บไฟล์
//     },
//     filename: function (req, file, cb) {
//         cb(null, Date.now() + path.extname(file.originalname)); // ตั้งชื่อไฟล์ไม่ให้ซ้ำกัน
//     }
// });
// const upload = multer({ storage: storage });


// // ดึงสินค้าที่มีปัญหา/ถูกส่งคืน (สำหรับผู้ขาย)
// router.get("/issue-orders", (req, res) => {
//     const sellerId = req.session.user?.id; 

//     const sql = `
//         SELECT 
//             o.order_id, 
//             o.order_status, 
//             o.total_amount,
            
//             -- ข้อมูลผู้ซื้อ
//             pf.full_name AS buyer_name,
            
//             -- ข้อมูลสินค้า 
//             p.product_id, 
//             p.product_name, 
//             od.quantity, 
//             od.total,

//             -- ข้อมูลจาก order_issues 
//             i.issue_id, 
//             i.issue_type, 
//             i.description, 
//             i.resolution_options, 
//             i.evidence_path AS issue_evidence_path,
//             i.created_at AS issue_created_at,
            
//             -- ข้อมูลจาก order_returns 
//             r.return_id, 
//             r.status AS return_status, 
//             r.evidence_path AS return_evidence_path
            
//         FROM orders o
//         JOIN order_detail od ON o.order_id = od.order_id
//         LEFT JOIN products p ON p.product_id = od.product_id
        
//         INNER JOIN order_issues i ON o.order_id = i.order_id 
//         LEFT JOIN order_returns r ON i.issue_id = r.issue_id 
//         LEFT JOIN profiles pf ON o.user_id = pf.user_id 
        
//         WHERE 
//             o.order_status IN ('return_pending', 'return_approved', 'refund_approved', 'resend_processing')
//             AND p.user_id = ? 
        
//         ORDER BY o.create_at DESC
//     `;

//     // ส่ง sellerId เป็นพารามิเตอร์ที่สองของ db.query
//     db.query(sql, [sellerId], (err, results) => { 
//         if (err) return res.status(500).json({ success: false, error: err.message });

//         // จัดกลุ่ม order -> products (เหมือนเดิม)
//         const ordersMap = {};
//         results.forEach(row => {
//             if (!ordersMap[row.order_id]) {
//                 ordersMap[row.order_id] = {
//                     order_id: row.order_id,
//                     order_status: row.order_status,
//                     total_amount: row.total_amount,
//                     buyer_name: row.buyer_name,
                    
//                     issue: {
//                         issue_id: row.issue_id,
//                         issue_type: row.issue_type,
//                         description: row.description,
//                         resolution_options: row.resolution_options,
//                         evidence_path: row.issue_evidence_path,
//                         created_at: row.issue_created_at,
//                     },
                    
//                     returns: row.return_id
//                         ? { 
//                             return_id: row.return_id, 
//                             status: row.return_status, 
//                             evidence_path: row.return_evidence_path, 
//                         }
//                         : null,
                    
//                     products: []
//                 };
//             }
            
//             ordersMap[row.order_id].products.push({
//                 product_id: row.product_id,
//                 product_name: row.product_name,
//                 quantity: row.quantity,
//                 total: row.total
//             });
//         });

//         res.json({ success: true, data: Object.values(ordersMap) });
//     });
// });

// // ผู้ขายอัปเดตสถานะคำสั่งซื้อและหักจำนวนสินค้า
// // router.post('/orders-status/:orderId', async (req, res) => {
// //     const { order_status, tracking_number, transport_company_id } = req.body;
// //     const { orderId } = req.params;
// //     const sellerId = req.session.user?.user_id;
// //     console.log("Session user:", req.session.user);


// //     try {
// //         // ริ่ม Transaction
// //         await new Promise((resolve, reject) => {
// //             db.beginTransaction(err => {
// //                 if (err) return reject(err);
// //                 resolve();
// //             });
// //         });

// //         // ตรวจสอบสิทธิ์ผู้ขาย
// //         const checkQuery = `
// //             SELECT DISTINCT o.order_id 
// //             FROM orders o
// //             JOIN order_detail od ON o.order_id = od.order_id
// //             JOIN products p ON od.product_id = p.product_id
// //             WHERE o.order_id = ? AND p.user_id = ?
// //         `;
// //         const rows = await db.query(checkQuery, [orderId, sellerId]);


// //         // อัปเดตสถานะคำสั่งซื้อ (ตาราง orders)
// //         const updateOrderQuery = `
// //             UPDATE orders 
// //             SET order_status = ?, tracking_number = ?, transport_company_id = ?, update_at = NOW()
// //             WHERE order_id = ?
// //         `;
// //         await db.query(updateOrderQuery, [order_status, tracking_number, transport_company_id, orderId]);

// //         // อัปเดตสถานะการชำระเงินเป็น 'paid' 
// //         const updatePaymentQuery = `
// //             UPDATE payment 
// //             SET payment_status = 'paid', updated_at = NOW()
// //             WHERE order_id = ?
// //         `;
// //         await db.query(updatePaymentQuery, [orderId]);


// //         // จัดการหักจำนวนสินค้าใน product_slots (ถ้าสถานะเป็น 'shipping')
// //         if (order_status === "shipping") {
// //             await deductProductSlots(orderId, sellerId); 
// //             await notifyBuyer(orderId, tracking_number); 
// //         }

// //         // Commit Transaction เมื่อทุกอย่างสำเร็จ
// //         await new Promise((resolve, reject) => {
// //             db.commit(err => {
// //                 if (err) return reject(err);
// //                 resolve();
// //             });
// //         });

// //         res.json({ success: true, message: "อัปเดตสถานะ, การชำระเงิน, และจัดการ slot เรียบร้อย" });

// //     } catch (error) {
// //         // จัดการข้อผิดพลาดและ Rollback
// //         await new Promise(resolve => {
// //             db.rollback(() => {
// //                 resolve(); 
// //             });
// //         });
        
// //         console.error("Order Update Error:", error);
        
// //         const errorMessage = error.message === "คุณไม่มีสิทธิ์อัปเดตคำสั่งซื้อนี้" 
// //                              ? error.message 
// //                              : "เกิดข้อผิดพลาดในการทำรายการ";
                             
// //         const statusCode = error.message === "คุณไม่มีสิทธิ์อัปเดตคำสั่งซื้อนี้" ? 403 : 500;

// //         res.status(statusCode).json({ 
// //             error: errorMessage,
// //         });
// //     }
// // });

// // ผู้ขายอัปเดตสถานะคำสั่งซื้อและหักจำนวนสินค้า
// router.post('/orders-status/:orderId', async (req, res) => {
//   const { order_status, tracking_number, transport_company_id } = req.body;
//   const { orderId } = req.params;
//   const sellerId = req.session.user?.user_id;

//   if (!sellerId) {
//     return res.status(401).json({ error: "กรุณาเข้าสู่ระบบก่อนทำรายการ" });
//   }

//   const connection = await db.promise().getConnection();

//   try {
//     await connection.beginTransaction();

//     const [checkRows] = await connection.query(
//       `
//       SELECT DISTINCT o.order_id 
//       FROM orders o
//       JOIN order_detail od ON o.order_id = od.order_id
//       JOIN products p ON od.product_id = p.product_id
//       WHERE o.order_id = ? AND p.user_id = ?
//       `,
//       [orderId, sellerId]
//     );

//     if (!checkRows.length) {
//       throw new Error("คุณไม่มีสิทธิ์อัปเดตคำสั่งซื้อนี้");
//     }

//     // อัปเดตสถานะคำสั่งซื้อในตาราง orders
//     await connection.query(
//       `
//       UPDATE orders 
//       SET order_status = ?, tracking_number = ?, transport_company_id = ?, update_at = NOW()
//       WHERE order_id = ?
//       `,
//       [order_status, tracking_number || null, transport_company_id || null, orderId]
//     );

//     // อัปเดตสถานะการชำระเงินเป็น 'paid'
//     await connection.query(
//       `
//       UPDATE payment 
//       SET payment_status = 'paid', updated_at = NOW()
//       WHERE order_id = ?
//       `,
//       [orderId]
//     );

//     //ถ้าสถานะเป็น shipping จะหักสินค้าและแจ้งผู้ซื้อ
//     if (order_status === "shipping") {
//       await deductProductSlots(connection, orderId, sellerId); // ส่ง connection เข้าไปด้วย
//       await notifyBuyer(connection, orderId, tracking_number); // ส่ง connection เข้าไปด้วย
//     }

//     logOrder(sellerId, orderId, `อัปเดตสถานะคำสั่งซื้อเป็น ${order_status}`);

//     await connection.commit();

//     res.json({
//       success: true,
//       message: "อัปเดตสถานะ, การชำระเงิน, และจัดการ slot เรียบร้อย"
//     });

//   } catch (error) {
//     //Rollback เมื่อมีข้อผิดพลาด
//     await connection.rollback();
//     console.error("Order Update Error:", error);

//     const errorMessage = error.message === "คุณไม่มีสิทธิ์อัปเดตคำสั่งซื้อนี้"
//       ? error.message
//       : "เกิดข้อผิดพลาดในการทำรายการ";

//     const statusCode = error.message === "คุณไม่มีสิทธิ์อัปเดตคำสั่งซื้อนี้" ? 403 : 500;

//     res.status(statusCode).json({ error: errorMessage });

//   } finally {
//     connection.release();
//   }
// });


// // ----------------------------------------------------------------------
// // ฟังก์ชันย่อย 1: หักจำนวนสินค้าจาก Slots

// async function deductProductSlots(orderId, sellerId) {
//     const getItemsQuery = `
//         SELECT od.product_id, od.quantity
//         FROM order_detail od
//         JOIN products p ON od.product_id = p.product_id
//         WHERE od.order_id = ? AND p.user_id = ?
//     `;
//     const items = await db.query(getItemsQuery, [orderId, sellerId]);

//     // วนลูปผ่านสินค้าแต่ละรายการในคำสั่งซื้อ
//     for (const item of items) {
//         let remaining = item.quantity;
        
//         // หาสล็อตของสินค้าที่ active หรือ pending เรียงตามวันที่เริ่มต้น
//         const findSlotsSql = `
//             SELECT * FROM product_slots
//             WHERE product_id = ? AND status IN ('active', 'pending')
//             ORDER BY start_date ASC
//         `;
//         const slots = await db.query(findSlotsSql, [item.product_id]);

//         // วนลูปผ่าน Slots เพื่อหักจำนวน
//         for (let j = 0; j < slots.length && remaining > 0; j++) {
//             const slot = slots[j];
//             const slotRemaining = slot.quantity - slot.sold - slot.reserved;
//             const deduct = Math.min(slotRemaining, remaining);
            
//             if (deduct <= 0) continue;

//             const updateSlotSql = `
//                 UPDATE product_slots
//                 SET sold = sold + ?,
//                     status = CASE 
//                                 WHEN sold + ? >= quantity THEN 'ended' 
//                                 ELSE status 
//                             END
//                 WHERE slot_id = ?
//             `;
//             // ใช้ status เดิม ถ้ายังไม่หมด
//             await db.query(updateSlotSql, [deduct, deduct, slot.slot_id]); 
            
//             remaining -= deduct;

//             // ถ้า Slot หมด และมี Slot ถัดไปที่เป็น 'pending' ให้เปิดใช้งาน
//             if (slotRemaining - deduct <= 0 && j + 1 < slots.length) {
//                 const nextSlot = slots[j + 1];
//                 if (nextSlot.status === 'pending') {
//                     await db.query(`UPDATE product_slots SET status = 'active' WHERE slot_id = ?`, [nextSlot.slot_id]);
//                 }
//             }
//         }
//     }
// }

// // ----------------------------------------------------------------------
// // ฟังก์ชันย่อย 2: แจ้งเตือนผู้ซื้อ (Notification Logic)
// // ----------------------------------------------------------------------

// async function notifyBuyer(orderId, tracking_number) {
//     const userQuery = `SELECT user_id FROM orders WHERE order_id = ?`;
//     const rows = await db.query(userQuery, [orderId]);
    
//     if (rows && rows.length > 0) {
//         const buyerId = rows[0].user_id;
//         const message = `คำสั่งซื้อ #${orderId} ของคุณกำลังจัดส่ง เลขพัสดุ: ${tracking_number || '-'}`;
//         const notifyQuery = `
//             INSERT INTO notifications (user_id, type, message, related_id, send_date, status)
//             VALUES (?, 'order', ?, ?, NOW(), 'ยังไม่อ่าน')
//         `;
//         // ไม่ต้องรอผลลัพธ์การแจ้งเตือน
//         db.query(notifyQuery, [buyerId, message, orderId]).catch(e => console.error("Notification Error:", e));
//     }
// }

// //ดึง orders ของสินค้าตาม productId (ploy)
// router.get('/product-orders/:productId', (req, res) => {
//   const { productId } = req.params;

//   const query = `
//     SELECT 
//       od.order_detail_id,
//       od.quantity,
//       od.total AS order_price,
//       o.order_id,
//       o.order_date,
//       o.order_status,
//       o.payment_status,
//       o.tracking_number,
//       u.user_id AS buyer_id,
//       p.full_name AS buyer_name,
//       tc.name AS transport_company_name,
//       tc.code AS transport_company_code,
//       ua.shippingAddress,
//       ua.sub_district_name,
//       ua.district_name,
//       ua.province_name,
//       ua.zip_code,
//       ua.phone,
//       CONCAT(
//         ua.shippingAddress, ' ',
//         ua.sub_district_name, ' ',
//         ua.district_name, ' ',
//         ua.province_name, ' ',
//         ua.zip_code
//       ) AS full_address,
//       pay.slip_path,
//       pay.payment_date,
//       pay.amount AS payment_amount,

//       -- ดึงข้อมูลปัญหาเต็ม
//       oi.issue_id,
//       oi.order_id AS issue_order_id,
//       oi.user_id AS issue_user_id,
//       oi.issue_type,
//       oi.description,
//       oi.evidence_path,
//       oi.contacted,
//       oi.created_at AS issue_created_at,
//       oi.resolution_options
//     FROM order_detail od
//     JOIN orders o ON od.order_id = o.order_id
//     JOIN users u ON o.user_id = u.user_id
//     JOIN profiles p ON u.user_id = p.user_id
//     LEFT JOIN transport_company tc ON o.transport_company_id = tc.transport_company_id
//     LEFT JOIN payment pay ON o.order_id = pay.order_id
//     LEFT JOIN user_addresses ua ON o.user_addresses_id = ua.user_addresses_id
//     LEFT JOIN order_issues oi ON o.order_id = oi.order_id
//     WHERE od.product_id = ?
//     ORDER BY o.order_date DESC
//   `;

//   db.query(query, [productId], (err, results) => {
//     if (err) {
//       console.error("Error fetching product orders:", err);
//       return res.status(500).json({ error: "Database error" });
//     }

//     // จัดโครงสร้าง response
//     const orders = results.map(row => ({
//       order_detail_id: row.order_detail_id,
//       order_id: row.order_id,
//       order_date: row.order_date,
//       order_status: row.order_status,
//       payment_status: row.payment_status,
//       tracking_number: row.tracking_number,
//       buyer_id: row.buyer_id,
//       buyer_name: row.buyer_name,
//       transport_company_name: row.transport_company_name,
//       transport_company_code: row.transport_company_code,
//       full_address: row.full_address,
//       phone: row.phone,
//       slip_path: row.slip_path,
//       payment_date: row.payment_date,
//       payment_amount: row.payment_amount,
//       // ข้อมูลปัญหา
//       issue: row.issue_id ? {
//         issue_id: row.issue_id,
//         user_id: row.issue_user_id,
//         order_id: row.issue_order_id,
//         issue_type: row.issue_type,
//         description: row.description,
//         evidence_path: row.evidence_path,
//         contacted: row.contacted,
//         created_at: row.issue_created_at,
//         resolution_options: row.resolution_options
//       } : null
//     }));
//     res.json({ success: true, data: orders });
//   });
// });


// // ผู้ขายแก้ไขปัญหาเสร็จสิ้น
// router.put("/resolve-issue/:orderId", (req, res) => {
//   const { orderId } = req.params;

//   const query = `
//     UPDATE orders
//     SET order_status = 'delivered', update_at = NOW()
//     WHERE order_id = ? AND order_status = 'issue_reported'
//   `;

//   db.query(query, [orderId], (err, result) => {
//     if (err) return res.status(500).json({ error: "Database error" });
//     res.json({ success: true });
//   });
// });



// // ดึงข้อมูลสลิปการชำระเงินสำหรับผู้ขาย
// router.get('/seller-payment/:orderId', (req, res) => {
//   const user = req.session.user;
//   const order_id = req.params.orderId;

//   if (!user) return res.status(401).json({ error: "ยังไม่ได้เข้าสู่ระบบ" });

//   // จำกัดสิทธิ์เฉพาะ role 3 หรือ 4
//   if (![3, 4].includes(user.role)) {
//     return res.status(403).json({ error: "คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้" });
//   }

//   // ดึงคำสั่งซื้อและสลิปเฉพาะของผู้ขาย
//   const sql = `
//     SELECT o.order_id, o.order_status, o.payment_status,
//            p.slip_path, p.payment_date, p.amount,
//            b.full_name AS buyer_name
//     FROM orders o
//     JOIN payment p ON o.order_id = p.order_id
//     JOIN users b ON o.user_id = b.user_id
//     WHERE o.order_id = ? AND o.seller_id = ?
//   `;

//   db.query(sql, [order_id, user.user_id], (err, result) => {
//     if (err) return res.status(500).json({ error: err });
//     if (!result || result.length === 0) {
//       return res.status(404).json({ error: "ไม่พบคำสั่งซื้อหรือคุณไม่ใช่ผู้ขายของคำสั่งซื้อนี้" });
//     }

//     return res.json({ success: true, data: result[0] });
//   });
// });



// module.exports = router;