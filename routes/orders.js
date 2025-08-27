const express = require('express');
const router = express.Router();
const db = require('../db');
const cron = require('node-cron');
const multer = require('multer');
const path = require('path');
const { logPayment, logOrder } = require('../logUserAction');

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
    SELECT o.* , p.full_name As buyer_name, ps.full_name AS seller_name FROM orders o
LEFT JOIN users u ON o.user_id = u.user_id
LEFT JOIN users s ON o.seller_id = s.user_id
LEFT JOIN payment pay ON o.payment_id = pay.payment_id
LEFT JOIN profiles p ON u.user_id = p.user_id
LEFT JOIN profiles ps ON s.user_id = ps.user_id
WHERE o.delete_at IS NULL
ORDER BY o.order_date DESC
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
router.post('/orders-status/:orderId', (req, res) => {
  let { order_status, tracking_number } = req.body;
  const { orderId } = req.params;

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

    const userId = req.user?.user_id || 0;
    logOrder(userId, orderId, `อัปเดตสถานะ`);

    // ดึง user_id ของผู้ซื้อเพื่อแจ้งเตือน
    const userQuery = `SELECT user_id FROM orders WHERE order_id = ?`;
    db.query(userQuery, [orderId], (err2, rows) => {
      if (err2 || !rows.length) {
        console.error("Error fetching user_id for notification:", err2);
        return res.json({ success: true, message: "อัปเดตสถานะแล้ว แต่ไม่สามารถแจ้งเตือนผู้ซื้อได้" });
      }

      const buyerId = rows[0].user_id;

      // สร้างข้อความแจ้งเตือนให้เหมาะกับสถานะ
      let message;
      switch (order_status) {
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
          message = `คำสั่งซื้อของคุณมีการอัปเดตสถานะ: ${order_status}`;
      }

      const notifyQuery = `
        INSERT INTO notifications (user_id, type, message, related_id, send_date, status)
        VALUES (?, 'order', ?, ?, NOW(), 'ยังไม่อ่าน')
        ON DUPLICATE KEY UPDATE 
            message = VALUES(message),
            send_date = NOW(),
            status = 'ยังไม่อ่าน';
      `;

      db.query(notifyQuery, [buyerId, message, orderId], (err3) => {
        if (err3) {
          console.error("Error inserting notification:", err3);
          return res.json({ success: true, message: "อัปเดตคำสั่งซื้อแล้ว แต่ไม่สามารถแจ้งเตือนได้" });
        }

        return res.json({ success: true, message: "อัปเดตสถานะและส่งการแจ้งเตือนเรียบร้อย" });
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


// แอดมินตรวจสอบการชำระเงิน
router.post('/verify-payment', (req, res) => {
  const { order_id, isApproved, admin_id, reject_reason } = req.body;

  const paymentStatus = isApproved ? 'paid' : 'rejected';
  const orderStatus = isApproved ? 'processing' : 'cancelled'; // ถ้าอนุมัติ = กำลังดำเนินการ, ถ้าไม่ = ยกเลิก

  // อัปเดตตาราง payment
  const updatePaymentSql = `
    UPDATE payment
    SET payment_status = ?, 
        verified_by = ?, 
        verified_at = NOW(),
        reject_reason = ?
    WHERE order_id = ?
  `;

  db.query(updatePaymentSql, [paymentStatus, admin_id, reject_reason || null, order_id], (err) => {
    if (err) return res.status(500).json({ error: err });

    // อัปเดตตาราง orders (ทั้ง payment_status และ order_status)
    const updateOrderSql = `
      UPDATE orders
      SET payment_status = ?, 
          order_status = ?
      WHERE order_id = ?
    `;

    db.query(updateOrderSql, [paymentStatus, orderStatus, order_id], (err2) => {
      if (err2) return res.status(500).json({ error: err2 });

      // ดึง user_id และ seller_id และ payment_id
      const getOrderUserSql = `
        SELECT o.user_id, o.seller_id, p.payment_id
        FROM orders o
        JOIN payment p ON o.order_id = p.order_id
        WHERE o.order_id = ?
      `;

      db.query(getOrderUserSql, [order_id], (err3, result3) => {
        if (err3 || result3.length === 0) return res.status(500).json({ error: err3 || 'ไม่พบคำสั่งซื้อ' });

        const buyer_id = result3[0].user_id;
        const seller_id = result3[0].seller_id;
        const payment_id = result3[0].payment_id;

        //บันทึก log การตรวจสอบชำระเงิน
        logPayment(admin_id, payment_id, isApproved ? "แอดมินยืนยันการชำระเงิน" : "แอดมินปฏิเสธการชำระเงิน", isApproved);

        logOrder(admin_id, order_id, isApproved ? "แอดมินยืนยันการชำระเงิน" : "แอดมินปฏิเสธการชำระเงิน", reject_reason || null);

        // ข้อความแจ้งเตือน
        const buyerMessage = isApproved
          ? `คำสั่งซื้อของคุณชำระเงินเรียบร้อยแล้ว`
          : `คำสั่งซื้อของคุณถูกปฏิเสธการชำระเงิน: ${reject_reason}`;

        const sellerMessage = isApproved
          ? `ผู้ซื้อได้ชำระเงินเรียบร้อยแล้ว กรุณากรอกเลขพัสดุ`
          : null;

        // แจ้งผู้ซื้อ
        const insertBuyerNotification = `
          INSERT INTO notifications (user_id, type, message, related_id, send_date)
          VALUES (?, 'payment', ?, ?, NOW())
          ON DUPLICATE KEY UPDATE 
            message = VALUES(message),
            send_date = NOW(),
            status = 'ยังไม่อ่าน';
        `;

        db.query(insertBuyerNotification, [buyer_id, buyerMessage, order_id], (err4) => {
          if (err4) return res.status(500).json({ error: err4 });

          // แจ้งผู้ขาย (ถ้าอนุมัติเท่านั้น)
          if (isApproved) {
            const insertSellerNotification = `
              INSERT INTO notifications (user_id, type, message, related_id, send_date)
              VALUES (?, 'tracking', ?, ?, NOW())
              ON DUPLICATE KEY UPDATE 
            message = VALUES(message),
            send_date = NOW(),
            status = 'ยังไม่อ่าน';
            `;
            db.query(insertSellerNotification, [seller_id, sellerMessage, order_id], (err5) => {
              if (err5) return res.status(500).json({ error: err5 });

              return res.json({ success: true, message: 'ตรวจสอบและอัปเดตสถานะคำสั่งซื้อเรียบร้อยแล้ว' });
            });
          } else {
            return res.json({ success: true, message: 'ปฏิเสธการชำระเงินและแจ้งเตือนผู้ซื้อแล้ว' });
          }
        });
      });
    });
  });
});


// ซื้ออีกครั้ง
// ดึงสินค้าทั้งหมดจาก order
router.get('/order-buyAgain/:orderId', (req, res) => {
  const orderId = req.params.orderId;

  const query = `
        SELECT od.product_id, od.quantity, p.product_name, p.price, p.stock
        FROM order_detail od
        JOIN products p ON od.product_id = p.product_id
        WHERE od.order_id = ? AND p.deleted_at IS NULL
    `;

  db.query(query, [orderId], (err, results) => {
    if (err) {
      console.error('Error fetching order items:', err);
      return res.status(500).json({ error: 'Error fetching order items' });
    }

    // ตรวจสอบสต๊อกและกรองสินค้าที่ไม่มีในสต๊อก
    const availableItems = results.filter(item =>
      item.stock >= item.quantity
    );

    const unavailableItems = results.filter(item =>
      item.stock < item.quantity
    );

    res.json({
      availableItems,
      unavailableItems,
      message: unavailableItems.length > 0
        ? 'บางสินค้าไม่มีในสต๊อกเพียงพอ'
        : 'พร้อมเพิ่มสินค้าทั้งหมดในตะกร้า'
    });
  });
});

// อัปโหลดสลิปใหม่
router.post('/:orderId/reupload-slip', upload.single('paymentSlip'), async (req, res) => {
  const { orderId } = req.params;
  if (!req.file) {
    return res.status(400).json({ error: 'กรุณาอัปโหลดไฟล์สลิป' });
  }

  const conn = db.promise();

  try {
    const slipPath = req.file.filename;

    // เริ่ม transaction
    await conn.query('START TRANSACTION');

    // อัปเดตตาราง payment
    await conn.query(
      `UPDATE payment 
       SET slip_path = ?, payment_status = 'pending', payment_date = NOW() 
       WHERE order_id = ?`,
      [slipPath, orderId]
    );

    // อัปเดตตาราง orders ให้สถานะสอดคล้องกัน
    await conn.query(
      `UPDATE orders 
       SET order_status = 'pending_verification', payment_status = 'pending' 
       WHERE order_id = ?`,
      [orderId]
    );

    // บันทึก log การอัปโหลดสลิป
    logPayment(userId, orderId, 'reupload_slip', false);

    // คอมมิตการเปลี่ยนแปลง
    await conn.query('COMMIT');

    res.json({ message: 'อัปโหลดสลิปสำเร็จ' });
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




module.exports = router;