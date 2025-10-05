const express = require('express');
const router = express.Router();
const db = require('../db');
const cron = require('node-cron');
const multer = require('multer');
const path = require('path');
const { logPayment, logOrder } = require('../logUserAction');
const { error } = require('console');

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

// แอดมินดึงคำสั่งซื้อของผู้ใช้ทั้งหมด
router.get('/admin/orders-user', (req, res) => {
  const query = `
    SELECT o.*,
        p.full_name AS buyer_name,
        ps.full_name AS seller_name,
        pr.product_name
  FROM orders o
  LEFT JOIN users u ON o.user_id = u.user_id
  LEFT JOIN users s ON o.seller_id = s.user_id
  LEFT JOIN payment pay ON o.payment_id = pay.payment_id
  LEFT JOIN profiles p ON u.user_id = p.user_id
  LEFT JOIN profiles ps ON s.user_id = ps.user_id
  LEFT JOIN order_detail oi ON o.order_id = oi.order_id
  LEFT JOIN products pr ON oi.product_id = pr.product_id
  WHERE o.delete_at IS NULL 
    AND (o.order_status IS NULL OR o.order_status != 'issue_reported')
  ORDER BY o.order_date DESC;
  `;

  db.query(query, (err, results) => {
    if (err) {
      console.error("Error fetching orders:", err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json({ success: true, data: results });
  });
});


// แสดงรายละเอียดคำสั่งซื้อของผู้ใช้
router.get('/admin/orders-detail/:orderId', (req, res) => {

  const orderId = req.params.orderId;
  const query = `
    SELECT o.*, p.full_name AS buyer_name, p.full_name AS seller_name, pay.payment_status, pay.payment_date
    FROM orders o
    LEFT JOIN users u ON o.user_id = u.user_id
    LEFT JOIN users s ON o.seller_id = s.user_id
    LEFT JOIN payment pay ON o.payment_id = pay.payment_id
    LEFT JOIN profiles p ON u.user_id = p.user_id
    WHERE o.order_id = ? AND o.delete_at IS NULL
  `;
  db.query(query, [orderId], (err, results) => {
    if (err) {
      console.error("Error fetching order details:", err);
      return res.status(500).json({ error: "Database error" });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: "ไม่พบคำสั่งซื้อนี้" });
    }

    const order = results[0];

    // ดึงรายละเอียดสินค้าในคำสั่งซื้อ
    const itemsQuery = `
      SELECT od.*, p.product_name, p.price, p.image
      FROM order_detail od
      JOIN products p ON od.product_id = p.product_id
      WHERE od.order_id = ?
    `;
    db.query(itemsQuery, [orderId], (err2, items) => {
      if (err2) {
        console.error("Error fetching order items:", err2);
        return res.status(500).json({ error: "Database error" });
      }

      order.items = items;
      res.json({ success: true, data: order });
    });
  }
  );
});

// แอดมิน/คนขายอัปเดตสถานะคำสั่งซื้อ
router.post('/admin/orders-status/:orderId', (req, res) => {
  const { tracking_number } = req.body;
  const { orderId } = req.params;

  // ดึงสถานะเดิมมาก่อน
  const selectQuery = `SELECT order_status FROM orders WHERE order_id = ?`;
  db.query(selectQuery, [orderId], (err, rows) => {
    if (err || !rows.length) {
      console.error("Error fetching order status:", err);
      return res.status(500).json({ error: "ไม่พบคำสั่งซื้อ" });
    }

    let order_status = rows[0].order_status;

    // ถ้ากรอกเลขพัสดุแต่ order_status ยังไม่ใช่ shipping ให้เปลี่ยนเป็น shipping อัตโนมัติ
    if (tracking_number && order_status !== 'shipping') {
      order_status = 'shipping';
    }

    const updateQuery = `
      UPDATE orders 
      SET order_status = ?, 
          tracking_number = ?, 
          update_at = CURRENT_TIMESTAMP
      WHERE order_id = ?
    `;

    db.query(updateQuery, [order_status, tracking_number || null, orderId], (err) => {
      if (err) {
        console.error("Error updating order status:", err);
        return res.status(500).json({ error: "ไม่สามารถอัปเดตสถานะได้" });
      }

      // ดึง order ใหม่หลัง update
      const selectUpdatedOrder = `SELECT * FROM orders WHERE order_id = ?`;
      db.query(selectUpdatedOrder, [orderId], (err4, updatedRows) => {
        if (err4 || !updatedRows.length) {
          console.error("Error fetching updated order:", err4);
          return res.status(500).json({ error: "ไม่สามารถดึงคำสั่งซื้อหลังอัปเดตได้" });
        }

        const updatedOrder = updatedRows[0];

        // สร้างการแจ้งเตือนเหมือนเดิม
        const buyerId = updatedOrder.user_id;
        let message;
        switch (updatedOrder.order_status) {
          case 'shipping':
            message = `คำสั่งซื้อของคุณกำลังจัดส่ง${tracking_number ? ` หมายเลขพัสดุ: ${tracking_number}` : ''}`;
            break;
          case 'delivered':
            message = `คำสั่งซื้อของคุณจัดส่งสำเร็จแล้ว`;
            break;
          case 'cancelled':
            message = `คำสั่งซื้อของคุณถูกยกเลิก`;
            break;
          default:
            message = `คำสั่งซื้อของคุณมีการอัปเดตสถานะ: ${updatedOrder.order_status}`;
        }

        const notifyQuery = `
          INSERT INTO notifications (user_id, type, message, related_id, send_date, status)
          VALUES (?, 'order', ?, ?, NOW(), 'ยังไม่อ่าน')
          ON DUPLICATE KEY UPDATE 
              message = VALUES(message),
              send_date = NOW(),
              status = 'ยังไม่อ่าน';
        `;

        db.query(notifyQuery, [buyerId, message, orderId], (err5) => {
          if (err5) {
            console.error("Error inserting notification:", err5);
          }

          // ส่ง order object กลับ React
          return res.json({ success: true, message: "อัปเดตสถานะเรียบร้อย", updatedOrder });
        });
      });
    });
  });
});


// ผู้ขายดูคำสั่งซื้อของตัวเอง
router.get('/orders-seller', (req, res) => {
  const sellerId = req.query.seller_id;

  if (!sellerId) {
    return res.status(400).json({ error: "กรุณาระบุ seller_id" });
  }

  const query = `
    SELECT 
      o.order_id,
      o.order_date,
      o.order_status,
      o.tracking_number,
      pay.payment_status,
      pay.payment_date,
      p.full_name AS buyer_name
    FROM orders o
    JOIN users u ON o.user_id = u.user_id
    JOIN payment pay ON o.payment_id = pay.payment_id
    JOIN profiles p ON u.user_id = p.user_id
    WHERE o.seller_id = ? AND o.delete_at IS NULL
    ORDER BY o.order_date DESC
  `;

  db.query(query, [sellerId], (err, results) => {
    if (err) {
      console.error("Error fetching seller orders:", err);
      return res.status(500).json({ error: "Database error" });
    }

    res.json({ success: true, data: results });
  });
});


// ผู้ขายอัปเดตสถานะคำสั่งซื้อ
router.put('/seller/orders-status/:orderId', (req, res) => {
  const { order_status, tracking_number, seller_id } = req.body;
  const { orderId } = req.params;

  // ตรวจสอบว่า order นี้เป็นของ seller นี้จริง
  const checkQuery = `SELECT * FROM orders WHERE order_id = ? AND seller_id = ?`;
  db.query(checkQuery, [orderId, seller_id], (err, rows) => {
    if (err) return res.status(500).json({ error: "Database error" });
    if (!rows || rows.length === 0) {
      return res.status(403).json({ error: "คุณไม่มีสิทธิ์อัปเดตคำสั่งซื้อนี้" });
    }

    const updateQuery = `
      UPDATE orders SET order_status = ?, tracking_number = ?, update_at = CURRENT_TIMESTAMP
      WHERE order_id = ? AND seller_id = ?
    `;

    db.query(updateQuery, [order_status, tracking_number, orderId, seller_id], (err2, result) => {
      if (err2) {
        console.error("Error updating order status:", err2);
        return res.status(500).json({ error: "ไม่สามารถอัปเดตสถานะได้" });
      }

      // แจ้งเตือนผู้ซื้อเหมือนเดิม...
      const userQuery = `SELECT user_id FROM orders WHERE order_id = ?`;
      db.query(userQuery, [orderId], (err3, rows2) => {
        if (!err3 && rows2 && rows2.length > 0) {
          const buyerId = rows2[0].user_id;
          const message = tracking_number
            ? `คำสั่งซื้อของคุณมีการอัปเดตเลขพัสดุ: ${tracking_number}`
            : `คำสั่งซื้อของคุณมีการอัปเดตสถานะ: ${order_status}`;
          const notifyQuery = `
            INSERT INTO notifications (user_id, type, message, related_id, send_date, status)
            VALUES (?, 'order', ?, ?, NOW(), 'ยังไม่อ่าน')
            ON DUPLICATE KEY UPDATE 
            message = VALUES(message),
            send_date = NOW(),
            status = 'ยังไม่อ่าน';
          `;
          db.query(notifyQuery, [buyerId, message, orderId]);
        }
      });
      return res.json({ success: true, message: "อัปเดตสถานะและส่งการแจ้งเตือนเรียบร้อย" });
    });
  });
});

// แสดงคำสั่งซื้อของผู้ใช้ตามไอดี
router.get('/orders-user/:userId', async (req, res) => {
  const userId = req.params.userId;

  try {
    // ดึงรายการคำสั่งซื้อทั้งหมดของผู้ใช้ พร้อม tracking_number
    const [orders] = await db.promise().query(
      `SELECT * FROM orders WHERE user_id = ? ORDER BY order_date DESC`,
      [userId]
    );

    // ดึงสินค้าในแต่ละคำสั่งซื้อ
    const orderIds = orders.map(order => order.order_id);
    if (orderIds.length === 0) {
      return res.json([]);
    }

    const [orderItems] = await db.promise().query(
      `SELECT od.*, p.product_name, p.price, p.image, od.order_id 
            FROM order_detail od 
            JOIN products p ON od.product_id = p.product_id 
            WHERE od.order_id IN (${orderIds.map(() => '?').join(',')})`,
      orderIds
    );

    // รวมสินค้าเข้าไปในแต่ละ order และแสดง tracking_number ด้วย
    const ordersWithProducts = orders.map(order => {
      return {
        ...order,
        tracking_number: order.tracking_number, // เพิ่ม tracking_number 
        products: orderItems.filter(item => item.order_id === order.order_id)
      };
    });

    res.json(ordersWithProducts);
  } catch (err) {
    console.error("Error fetching orders:", err);
    res.status(500).json({ error: "เกิดข้อผิดพลาด" });
  }
});

// ยืนยันการได้รับสินค้า
// router.put('/orders-confirm/:orderId', (req, res) => {
//   const orderId = req.params.orderId;

//   const updateQuery = `
//     UPDATE orders
//     SET order_status = 'delivered',
//         delivered_at = NOW()
//     WHERE order_id = ? AND order_status = 'shipping'
//   `;

//   db.query(updateQuery, [orderId], (err, result) => {
//     if (err) return res.status(500).json({ error: "อัปเดตสถานะไม่สำเร็จ" });
//     if (result.affectedRows === 0) return res.status(400).json({ message: "ไม่สามารถยืนยันคำสั่งซื้อนี้ได้" });

//     // หา user_id ของผู้ขาย
//     const sellerQuery = `
//       SELECT p.user_id AS seller_id
//       FROM orders o
//       JOIN products p ON o.product_id = p.product_id
//       WHERE o.order_id = ?
//     `;
//     db.query(sellerQuery, [orderId], (err, sellerResult) => {
//       if (err) return console.error("ไม่สามารถหาผู้ขาย:", err);
//       if (sellerResult.length > 0) {
//         const sellerId = sellerResult[0].seller_id;

//         // แจ้งผู้ขาย
//         const notifySellerQuery = `
//           INSERT INTO notifications (user_id, type, message, related_id, send_date, status)
//           VALUES (?, 'order', 'ผู้ซื้อได้ยืนยันการรับสินค้าแล้ว', ?, NOW(), 'ยังไม่อ่าน')
//         `;
//         db.query(notifySellerQuery, [sellerId, orderId]);
//       }
//     });

//     res.json({ success: true, message: "ยืนยันได้รับสินค้าแล้ว" });
//   });
// });


// อัตโนมัติยืนยันการได้รับสินค้า
// ทุก 5 วันถ้าอยู่ในสถานะ 'shipping' และมีการจัดส่ง
const autoConfirmDelivered = () => {
  const query = `
    UPDATE orders
    SET order_status = 'delivered',
        delivered_at = NOW()
    WHERE order_status = 'shipping'
    AND shipped_at IS NOT NULL
    AND shipped_at < NOW() - INTERVAL 5 DAY
  `;

  db.query(query, (err, result) => {
    if (err) {
      console.error(" Auto-confirm error:", err);
    } else {
      console.log(`Auto-confirmed ${result.affectedRows} orders`);
    }
  });

  const notifyQuery = `
  INSERT INTO notifications (user_id, type, message, related_id, send_date)
  VALUES (?, 'order', 'คำสั่งซื้อของคุณได้รับการยืนยันแล้ว', ?, NOW())
  ON DUPLICATE KEY UPDATE 
            message = VALUES(message),
            send_date = NOW(),
            status = 'ยังไม่อ่าน';
`;
  db.query(notifyQuery, [userId, orderId]);

};

cron.schedule('0 0 * * *', autoConfirmDelivered); // ทุกวันตอนเที่ยงคืน

// แสดงคำสั่งซื้อที่รอการชำระเงินของผู้ใช้
router.get('/pending-payment', (req, res) => {
  const sql = `
        SELECT 
            o.order_id,
            o.user_id,
            o.payment_status,
            o.total_amount,
            o.order_date,
            p.full_name AS buyer_name,
            pay.payment_id,
            pay.slip_path
        FROM orders o
        JOIN profiles p ON o.user_id = p.user_id
        LEFT JOIN payment pay ON o.payment_id = pay.payment_id
        WHERE o.payment_status = 'pending'
        ORDER BY o.create_at DESC
    `;

  db.query(sql, async (err, orders) => {
    if (err) return res.status(500).json({ error: err });

    const orderIds = orders.map(o => o.order_id);
    if (orderIds.length === 0) return res.json([]);

    const productSql = `
      SELECT 
          od.order_id, 
          pr.product_name, 
          pr.image, 
          pr.price,
          od.quantity, 
          od.total,
          seller.user_id AS seller_id,
          seller.full_name AS seller_name,
          pm.account_name AS seller_account_name,
          pm.account_number,
          pm.promptpay_number
      FROM order_detail od
      JOIN products pr ON od.product_id = pr.product_id
      JOIN profiles seller ON pr.user_id = seller.user_id
      LEFT JOIN payment_methods pm ON pr.payment_method_id = pm.payment_method_id
      WHERE od.order_id IN (?)
    `;

    db.query(productSql, [orderIds], (err2, orderProducts) => {
      if (err2) return res.status(500).json({ error: err2 });

      const orderMap = {};
      orders.forEach(o => {
        orderMap[o.order_id] = { ...o, products: [] };
      });

      orderProducts.forEach(p => {
        if (orderMap[p.order_id]) {
          // เก็บข้อมูลผู้ขายจากสินค้าชิ้นแรก
          if (orderMap[p.order_id].products.length === 0) {
            orderMap[p.order_id].seller_name = p.seller_name;
            orderMap[p.order_id].seller_account_name = p.seller_account_name;
            orderMap[p.order_id].account_number = p.account_number;
            orderMap[p.order_id].promptpay_number = p.promptpay_number;
          }
          orderMap[p.order_id].products.push(p);
        }
      });

      res.json(Object.values(orderMap));
    });
  });
});


// // ขายสินค้า (หักจาก slot ล่าสุดที่ active และอยู่ในช่วงวันที่)
// router.post('/sell', (req, res) => {
//     const { productId, quantity } = req.body;

//     if (!productId || !quantity) {
//         return res.status(400).json({ error: 'Product ID and quantity are required' });
//     }

//     const findSlot = `
//         SELECT * FROM product_slots 
//         WHERE product_id = ? AND status = 'active' 
//         AND (start_date <= NOW() AND (end_date IS NULL OR end_date >= NOW()))
//         ORDER BY start_date ASC LIMIT 1
//     `;
//     db.query(findSlot, [productId], (err, result) => {
//         if (err) return res.status(500).json({ error: 'Database error (find slot)' });
//         if (result.length === 0) return res.status(400).json({ error: 'No active slot available within date range' });

//         const slot = result[0];
//         if (slot.quantity - slot.sold < quantity) {
//             return res.status(400).json({ error: 'Not enough stock in this slot' });
//         }

//         // อัปเดต sold
//         const updateSlot = `
//             UPDATE product_slots 
//             SET sold = sold + ?,
//                 status = CASE WHEN sold + ? >= quantity THEN 'inactive' ELSE 'active' END
//             WHERE slot_id = ?
//         `;
//         db.query(updateSlot, [quantity, quantity, slot.slot_id], (err) => {
//             if (err) return res.status(500).json({ error: 'Database error updating slot' });

//             // แจ้งเตือนถ้าใกล้หมด
//             const remaining = slot.quantity - (slot.sold + quantity);
//             if (remaining <= 5) {
//                 const insertNotification = `
//                     INSERT INTO notifications (product_id, message, created_at)
//                     VALUES (?, ?, NOW())
//                 `;
//                 db.query(insertNotification, [productId, `Stock for product ${productId} is low: ${remaining} remaining`], (err) => {
//                     if (err) console.error('Failed to insert notification:', err);
//                 });
//             }

//             return res.status(200).json({ message: 'Product sold successfully', remaining });
//         });
//     });
// });

// แอดมินตรวจสอบการชำระเงิน
router.post('/verify-payment', (req, res) => {
  const { order_id, isApproved, reject_reason } = req.body;
  const admin_id = req.session.user?.id;

  //   console.log("admin_id:", admin_id);
  //   console.log("📦 req.body:", req.body);
  // console.log("💾 req.session:", req.session);


  if (!order_id || !admin_id) return res.status(400).json({ error: "ข้อมูลไม่ครบ" });

  const paymentStatus = isApproved ? 'paid' : 'rejected';
  const orderStatus = isApproved ? 'processing' : 'cancelled';

  db.beginTransaction(err => {   //ทำให้หลาย query เป็น atomic
    if (err) return res.status(500).json({ error: err });

    // 1. อัปเดต payment
    const updatePaymentSql = `
            UPDATE payment
            SET payment_status = ?, verified_by = ?, verified_at = NOW(), reject_reason = ?
            WHERE order_id = ?
        `;
    db.query(updatePaymentSql, [paymentStatus, admin_id, reject_reason || null, order_id], (err) => {
      if (err) return db.rollback(() => res.status(500).json({ error: err }));

      // 2. อัปเดต orders
      const updateOrderSql = `
                UPDATE orders
                SET payment_status = ?, order_status = ?
                WHERE order_id = ?
            `;
      db.query(updateOrderSql, [paymentStatus, orderStatus, order_id], (err2) => {
        if (err2) return db.rollback(() => res.status(500).json({ error: err2 }));

        // 3. ดึง user_id, seller_id และ payment_id
        const getOrderUserSql = `
                    SELECT o.user_id, o.seller_id, p.payment_id
                    FROM orders o
                    JOIN payment p ON o.order_id = p.order_id
                    WHERE o.order_id = ?
                `;
        db.query(getOrderUserSql, [order_id], (err3, result3) => {
          if (err3 || result3.length === 0) return db.rollback(() => res.status(500).json({ error: err3 || 'ไม่พบคำสั่งซื้อ' }));

          const buyer_id = result3[0].user_id;
          const seller_id = result3[0].seller_id;
          const payment_id = result3[0].payment_id;

          // log การตรวจสอบชำระเงิน
          logOrder(admin_id, order_id, isApproved ? "แอดมินยืนยันการชำระเงิน" : "แอดมินปฏิเสธการชำระเงิน", reject_reason || null);

          // ข้อความแจ้งเตือน
          const buyerMessage = isApproved
            ? `คำสั่งซื้อของคุณชำระเงินเรียบร้อยแล้ว`
            : `คำสั่งซื้อของคุณถูกปฏิเสธการชำระเงิน: ${reject_reason}`;
          const sellerMessage = isApproved
            ? `ผู้ซื้อได้ชำระเงินเรียบร้อยแล้ว กรุณากรอกเลขพัสดุ`
            : null;

          // 4. แจ้งผู้ซื้อ
          const insertBuyerNotification = `
                        INSERT INTO notifications (user_id, type, message, related_id, send_date)
                        VALUES (?, 'payment', ?, ?, NOW())
                        ON DUPLICATE KEY UPDATE 
                            message = VALUES(message),
                            send_date = NOW(),
                            status = 'ยังไม่อ่าน';
                    `;
          db.query(insertBuyerNotification, [buyer_id, buyerMessage, order_id], (err4) => {
            if (err4) return db.rollback(() => res.status(500).json({ error: err4 }));

            if (!isApproved) {
              return db.commit(errCommit => {
                if (errCommit) return db.rollback(() => res.status(500).json({ error: errCommit }));
                return res.json({ success: true, message: 'ปฏิเสธการชำระเงินและแจ้งเตือนผู้ซื้อแล้ว' });
              });
            }

            // 5. ดึง order detail
            const getOrderDetailSql = `
                            SELECT od.product_id, od.quantity, p.product_name
                            FROM order_detail od
                            JOIN products p ON od.product_id = p.product_id
                            WHERE od.order_id = ?
                        `;
            db.query(getOrderDetailSql, [order_id], (errDetail, orderItems) => {
              if (errDetail) return db.rollback(() => res.status(500).json({ error: errDetail }));

              // 6. หัก slot สำหรับแต่ละ product
              (function processItem(index) {  //recursive function ใช้ loop แบบ async ภายในจะ loop slot ของสินค้าแต่ละชิ้น
                if (index >= orderItems.length) {
                  // แจ้งผู้ขาย
                  if (sellerMessage) {
                    const insertSellerNotification = `
                                            INSERT INTO notifications (user_id, type, message, related_id, send_date)
                                            VALUES (?, 'tracking', ?, ?, NOW())
                                            ON DUPLICATE KEY UPDATE 
                                                message = VALUES(message),
                                                send_date = NOW(),
                                                status = 'ยังไม่อ่าน';
                                        `;
                    db.query(insertSellerNotification, [seller_id, sellerMessage, order_id]);
                  }
                  return db.commit(errCommit => {
                    if (errCommit) return db.rollback(() => res.status(500).json({ error: errCommit }));
                    return res.json({ success: true, message: 'ตรวจสอบ ยืนยันการชำระเงิน และหัก slot เรียบร้อยแล้ว' });
                  });
                }

                const item = orderItems[index];
                let remainingToSell = item.quantity;

                const findSlotsSql = `
                                    SELECT * FROM product_slots
                                    WHERE product_id = ? AND status IN ('active', 'pending')
                                    AND (start_date <= NOW() AND (end_date IS NULL OR end_date >= NOW()))
                                    ORDER BY start_date ASC
                                `;
                db.query(findSlotsSql, [item.product_id], (errSlot, slots) => {
                  if (errSlot || slots.length === 0) {
                    console.warn(`สินค้า ${item.product_name} ไม่มีสล็อตเหลือ`);
                    return processItem(index + 1);
                  }

                  (function processSlot(i) {
                    if (i >= slots.length || remainingToSell <= 0) return processItem(index + 1);

                    // slotRemaining = สินค้าที่ขายได้จริงในล็อตนี้
                    // deduct = จำนวนที่จะหักในล็อตนี้ (ไม่เกินที่มีในล็อต)
                    // remainingToSell = จำนวนสินค้าที่ต้องขายต่อหลังหักล็อตปัจจุบัน
                    const slot = slots[i];
                    const slotRemaining = slot.quantity - slot.sold - slot.reserved;
                    const deduct = Math.min(slotRemaining, remainingToSell);

                    const updateSlotSql = `
                                            UPDATE product_slots
                                            SET sold = sold + ?,
                                                status = CASE WHEN sold + ? >= quantity THEN 'ended' ELSE 'active' END
                                            WHERE slot_id = ?
                                        `;
                    db.query(updateSlotSql, [deduct, deduct, slot.slot_id], (errUpdate) => {
                      if (errUpdate) console.error(errUpdate);

                      remainingToSell -= deduct;

                      // เปิด slot ถัดไปถ้าหมด
                      if (slotRemaining - deduct <= 0 && i + 1 < slots.length) {
                        const nextSlot = slots[i + 1]; //ดึงล็อตถัดไป
                        if (nextSlot.status === 'pending') {
                          db.query(`UPDATE product_slots SET status = 'active' WHERE slot_id = ?`, [nextSlot.slot_id]);
                        }
                      }

                      processSlot(i + 1);
                    });
                  })(0);
                });
              })(0);
            });
          });
        });
      });
    });
  });
});


// ซื้ออีกครั้ง
// ดึงสินค้าทั้งหมดจาก order
router.get('/order-buyAgain/:orderId', (req, res) => {
  const { orderId } = req.params;

  // ดึงสินค้าจากออเดอร์เก่า
  const query = `
    SELECT 
      od.product_id, 
      od.quantity, 
      p.product_name, 
      p.price
    FROM order_detail od
    JOIN products p ON od.product_id = p.product_id
    WHERE od.order_id = ? 
      AND p.deleted_at IS NULL
  `;

  db.query(query, [orderId], (err, results) => {
    if (err) {
      console.error('Error fetching order items:', err);
      return res.status(500).json({ error: 'Error fetching order items' });
    }

    if (results.length === 0) {
      return res.status(404).json({ message: 'ไม่พบสินค้าที่เกี่ยวข้องกับคำสั่งซื้อ' });
    }

    let pending = results.length;
    const availableItems = [];
    const unavailableItems = [];

    results.forEach(item => {
      const slotQuery = `
        SELECT 
          COALESCE(SUM(quantity - sold), 0) AS available_quantity //คงเหลือที่ยังขายได้
        FROM product_slots
        WHERE product_id = ?
          AND status = 'active'  //เฉพาะสินค้าที่ยังขายได้
          AND (end_date IS NULL OR end_date >= NOW())
      `;

      db.query(slotQuery, [item.product_id], (slotErr, slotResult) => {
        if (slotErr) {
          console.error('Error checking slots:', slotErr);
          return res.status(500).json({ error: 'Error checking slots' });
        }

        const availableQty = slotResult[0].available_quantity;

        if (availableQty >= item.quantity) {
          availableItems.push({ ...item, availableQty });
        } else {
          unavailableItems.push({
            ...item,
            availableQty,
            shortage: item.quantity - availableQty
          });
        }

        pending--;
        if (pending === 0) {
          return res.json({
            availableItems,
            unavailableItems,
            message: unavailableItems.length > 0
              ? 'บางสินค้าไม่มี slot เพียงพอ'
              : 'พร้อมเพิ่มสินค้าทั้งหมดในตะกร้า'
          });
        }
      });
    });
  });
});


// อัปโหลดสลิปใหม่
router.post('/:orderId/reupload-slip', upload.single('paymentSlip'), async (req, res) => {
  const { orderId } = req.params;
  // console.log("Params:", req.params);
  const userId = req.session.user?.id;

  if (!req.file) {
    return res.status(400).json({ error: 'กรุณาอัปโหลดไฟล์สลิป' });
  }

  const slipPath = req.file.filename;
  const conn = db.promise();

  try {
    await conn.query('START TRANSACTION');

    console.log("Reupload slip for order:", orderId);

    // อัปเดตตาราง payment
    await conn.query(
      `UPDATE payment 
       SET slip_path = ?, payment_status = 'pending', payment_date = NOW()
       WHERE order_id = ?`,
      [slipPath, orderId]
    );

    // อัปเดตตาราง orders
    await conn.query(
      `UPDATE orders 
       SET order_status = 'pending_verification', 
           payment_status = 'pending' 
       WHERE order_id = ?`,
      [orderId]
    );

    // เพิ่มการแจ้งเตือนให้แอดมิน
    await conn.query(
      `INSERT INTO notifications (user_id, type, message, related_id, send_date, status) 
      VALUES (?, 'payment', ?, ?, NOW(), 'ยังไม่อ่าน')
      ON DUPLICATE KEY UPDATE 
        message = VALUES(message),
        send_date = NOW(),
        status = 'ยังไม่อ่าน';`,
      [userId, `ผู้ใช้ได้อัปโหลดสลิปใหม่สำหรับคำสั่งซื้อ #${orderId}`, orderId]
    );

    await conn.query('COMMIT');

    res.json({
      message: 'อัปโหลดสลิปสำเร็จและเปลี่ยนสถานะเป็นกำลังตรวจสอบ',
      order_status: 'pending_verification',
      payment_status: 'pending',
      paymentSlipUrl: `/uploads/${slipPath}`
    });

  } catch (error) {
    await conn.query('ROLLBACK');
    console.error(error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการอัปโหลด' });
  }
});


// อัปโหลดหลักฐานการได้รับสินค้า
router.post('/:orderId/upload-proof', upload.single('proofImage'), (req, res) => {
  const { orderId } = req.params;
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'กรุณาอัปโหลดไฟล์หลักฐาน' });
  }

  const proofImage = req.file.filename;

  const updateQuery = `
    UPDATE orders 
    SET proof_image = ?, order_status = 'delivered',
        delivered_at = NOW()
    WHERE order_id = ? AND order_status = 'shipping'
  `;

  db.query(updateQuery, [proofImage, orderId], (err) => {
    if (err) {
      console.error('Error updating proof image:', err);
      return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการบันทึกหลักฐาน' });
    }

    // หา user_id ของผู้ขาย
    const sellerQuery = `
      SELECT p.user_id AS seller_id
      FROM orders o
      JOIN products p ON o.product_id = p.product_id
      WHERE o.order_id = ?
    `;
    db.query(sellerQuery, [orderId], (err, sellerResult) => {
      if (err) return console.error("ไม่สามารถหาผู้ขาย:", err);
      if (sellerResult.length > 0) {
        const sellerId = sellerResult[0].seller_id;

        // แจ้งผู้ขาย
        const notifySellerQuery = `
          INSERT INTO notifications (user_id, type, message, related_id, send_date, status)
          VALUES (?, 'order', 'ผู้ซื้อได้ยืนยันการรับสินค้าแล้ว', ?, NOW(), 'ยังไม่อ่าน')
          ON DUPLICATE KEY UPDATE 
            message = VALUES(message),
            send_date = NOW(),
            status = 'ยังไม่อ่าน';
          `;
        db.query(notifySellerQuery, [sellerId, orderId]);
      }
    });

    return res.json({ success: true, message: 'อัปโหลดหลักฐานสำเร็จ และได้แจ้งผู้ขายแล้ว' });
  });
});

//-----------------การจัดการปัญหาสินค้าชำรุด/ไม่ได้รับสินค้า--------------------------------
// ผู้ใช้แจ้งปัญหา
router.post('/report-issue', upload.single('evidenceImage'), (req, res) => {
  const { order_id, issue_type, description, contaced, resolution_options } = req.body;
  const user_id = req.session.user?.id;
  const evidence_path = req.file ? req.file.filename : null;

  if (!user_id) {
    return res.status(401).json({ error: 'คุณยังไม่ได้เข้าสู่ระบบ' });
  }

  if (!order_id || !issue_type) {
    return res.status(400).json({ error: 'ข้อมูลไม่ครบ' });
  }

  // parse resolution_options จาก JSON string (ถ้ามี)
  let parsedResolutionOptions = null;
  try {
    parsedResolutionOptions = resolution_options ? JSON.parse(resolution_options) : null;
  } catch (e) {
    return res.status(400).json({ error: 'รูปแบบ resolution_options ไม่ถูกต้อง' });
  }

  db.beginTransaction(err => {
    if (err) {
      console.error('Transaction error:', err);
      return res.status(500).json({ error: 'ไม่สามารถเริ่ม Transaction ได้' });
    }

    // เพิ่มข้อมูลลงตาราง order_issues
    const insertReportQuery = `
      INSERT INTO order_issues 
      (order_id, user_id, issue_type, description, contacted, evidence_path, resolution_options, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
    `;

    db.query(
      insertReportQuery,
      [
        order_id,
        user_id,
        issue_type,
        description || null,
        contaced,
        evidence_path,
        parsedResolutionOptions ? JSON.stringify(parsedResolutionOptions) : null
      ],
      (err, result) => {
        if (err) {
          return db.rollback(() => {
            console.error('Error reporting issue:', err);
            res.status(500).json({ error: 'เกิดข้อผิดพลาดในการแจ้งปัญหา' });
          });
        }

        const issue_id = result.insertId;

        // อัปเดตสถานะ order
        const updateOrderQuery = `
          UPDATE orders 
          SET order_status = 'issue_reported'
          WHERE order_id = ?
        `;
        db.query(updateOrderQuery, [order_id], (err) => {
          if (err) {
            return db.rollback(() => {
              console.error('Error updating order status:', err);
              res.status(500).json({ error: 'อัปเดตสถานะคำสั่งซื้อไม่สำเร็จ' });
            });
          }

          // ส่งแจ้งเตือน admin
          const getAdminQuery = `SELECT user_id FROM users WHERE role_id = 1`;
          db.query(getAdminQuery, (err, admins) => {
            if (err) return db.rollback(() => res.status(500).json({ error: 'ไม่สามารถดึงผู้ดูแลระบบได้' }));

            if (!admins.length) return db.rollback(() => res.status(500).json({ error: 'ไม่พบแอดมิน' }));

            const message = `ผู้ใช้แจ้งปัญหา (${issue_type}) ในคำสั่งซื้อ #${order_id}`;

            const insertNotificationQuery = `
              INSERT INTO notifications (user_id, type, message, related_id, send_date, status)
              VALUES (?, 'issue', ?, ?, NOW(), 'ยังไม่อ่าน')
            `;

            admins.forEach(admin => {
              db.query(insertNotificationQuery, [admin.user_id, message, order_id], (err) => {
                if (err) console.error('Error inserting notification for admin:', err);
              });
            });

            db.commit(err => {
              if (err) return db.rollback(() => res.status(500).json({ error: 'ไม่สามารถบันทึกข้อมูลได้' }));

              logOrder(user_id, order_id, `แจ้งปัญหา: ${issue_type}`, description || null);

              res.json({
                success: true,
                message: 'แจ้งปัญหาสำเร็จ',
                issue_id,
                order_status: 'issue_reported',
                resolution_options: parsedResolutionOptions
              });
            });
          });
        });
      }
    );
  });
});


// ดึง issue_id
router.get("/issues/:orderId", (req, res) => {
  const { orderId } = req.params;
  db.query(
    "SELECT issue_id FROM order_issues WHERE order_id = ? ORDER BY created_at DESC LIMIT 1",
    [orderId],
    (err, results) => {
      if (err) return res.status(500).json({ error: "Database error" });
      if (results.length === 0) return res.json({ issue_id: null });
      res.json({ issue_id: results[0].issue_id });
    }
  );
});


// ผู้ใช้คืนสินค้า
router.post("/return", upload.single("evidenceImage"), (req, res) => {
  const { issue_id, reason } = req.body; 
  const evidencePath = req.file ? req.file.filename : null;

  if (!issue_id) {
    return res.status(400).json({ error: "Issue ID is required" });
  }

  db.beginTransaction(err => {
    if (err) return res.status(500).json({ error: "Transaction error" });

    // ดึง order_id, user_id, product_name จาก issue + order
    db.query(
      `SELECT oi.order_id, oi.user_id, p.product_name
       FROM order_issues oi
       JOIN orders o ON oi.order_id = o.order_id
       JOIN order_detail od ON o.order_id = od.order_id
       JOIN products p ON od.product_id = p.product_id
       WHERE oi.issue_id = ?`,
      [issue_id],
      (err, issueRows) => {
        if (err) return db.rollback(() => res.status(500).json({ error: "Query error" }));
        if (issueRows.length === 0) return db.rollback(() => res.status(404).json({ error: "Issue not found" }));

        const { order_id, user_id, product_name } = issueRows[0];

        // 1. บันทึก return ใน order_returns
        db.query(
          `INSERT INTO order_returns (issue_id, evidence_path, status, created_at, updated_at) 
           VALUES (?, ?, 'returned', NOW(), NOW())`,
          [issue_id, evidencePath],
          (err, result) => {
            if (err) return db.rollback(() => res.status(500).json({ error: "Insert order_returns failed" }));

            // 2. อัปเดต status ของ order
            db.query(
              `UPDATE orders SET order_status = 'returned', updated_at = NOW() WHERE order_id = ?`,
              [order_id],
              (err) => {
                if (err) return db.rollback(() => res.status(500).json({ error: "Update order status failed" }));

                // 3. แจ้งเตือนแอดมิน
                db.query(
                  `INSERT INTO notifications 
                   (user_id, type, message, related_id, send_date, status) 
                   VALUES (?, 'return_product', ?, ?, NOW(), 'unread')`,
                  [
                    user_id,
                    `ผู้ใช้ ${user_id} ส่งคืนสินค้า ${product_name} ปัญหา: ${reason || "ผู้ใช้คืนสินค้า"}`,
                    issue_id
                  ],
                  (err) => {
                    if (err) return db.rollback(() => res.status(500).json({ error: "Insert notification failed" }));

                    db.commit((err) => {
                      if (err) return db.rollback(() => res.status(500).json({ error: "Commit failed" }));
                      res.json({ success: true, message: "ส่งสินค้าสำเร็จ และอัปเดตสถานะเรียบร้อย" });
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
});




module.exports = router;