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
// router.get('/admin/orders-user', (req, res) => {
//   const query = `
//     SELECT o.*,
//         p.full_name AS buyer_name,
//         ps.full_name AS seller_name,
//         pr.product_name
//   FROM orders o
//   LEFT JOIN users u ON o.user_id = u.user_id
//   LEFT JOIN users s ON o.seller_id = s.user_id
//   LEFT JOIN payment pay ON o.payment_id = pay.payment_id
//   LEFT JOIN profiles p ON u.user_id = p.user_id
//   LEFT JOIN profiles ps ON s.user_id = ps.user_id
//   LEFT JOIN order_detail oi ON o.order_id = oi.order_id
//   LEFT JOIN products pr ON oi.product_id = pr.product_id
//   WHERE o.delete_at IS NULL 
//     AND (o.order_status IS NULL OR o.order_status != 'issue_reported')
//   ORDER BY o.order_date DESC;
//   `;

//   db.query(query, (err, results) => {
//     if (err) {
//       console.error("Error fetching orders:", err);
//       return res.status(500).json({ error: "Database error" });
//     }
//     res.json({ success: true, data: results });
//   });
// });

// แอดมินดึงคำสั่งซื้อของผู้ใช้ทั้งหมดเฉพาะสินค้าของสมาคม
router.get('/admin/orders-user', (req, res) => {
  const query = `
  SELECT 
      o.*,
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
  WHERE 
      o.delete_at IS NULL 
      AND (o.order_status IS NULL OR o.order_status != 'issue_reported')
      AND pr.is_official = 1
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

// แอดมินอัปเดตสถานะคำสั่งซื้อ
router.post('/admin/orders-status/:orderId', (req, res) => {
  let { order_status, tracking_number, transport_company_id } = req.body;
  const { orderId } = req.params;

  // ถ้ากรอกเลขพัสดุแต่ order_status ยังไม่ใช่ shipping ให้เปลี่ยนเป็น shipping อัตโนมัติ
  if (tracking_number && order_status !== 'shipping') {
    order_status = 'shipping';
  }

  // กำหนด transport_company_id default = 1 
  if (!transport_company_id && tracking_number) {
    transport_company_id = 1;
  }

  const updateQuery = `
    UPDATE orders 
    SET order_status = ?, 
        tracking_number = ?, 
        transport_company_id = ?,
        update_at = CURRENT_TIMESTAMP
    WHERE order_id = ?
  `;

  db.query(updateQuery, [order_status, tracking_number || null, transport_company_id || null, orderId], (err2) => {
    if (err2) {
      console.error("Error updating order status:", err2);
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


// แสดงรายละเอียดคำสั่งซื้อ
router.get('/admin/orders-detail/:orderId', (req, res) => {
  const { orderId } = req.params;

  const query = `
    SELECT 
      o.order_id,
      o.user_id,
      o.seller_id,
      o.payment_id,
      o.transport_company_id,
      o.user_addresses_id,
      o.payment_status,
      o.quantity,
      o.tracking_number,
      o.order_status,
      o.reason,
      o.total_amount,
      o.order_date,
      o.proof_image,
      o.delivered_at,
      o.update_at,
      p.full_name AS buyer_name,
      ps.full_name AS seller_name,
      pay.payment_status AS payment_status,
      pay.payment_date AS payment_date,

      -- join ที่อยู่จาก user_addresses
      ua.shippingAddress,
      ua.sub_district_name,
      ua.district_name,
      ua.province_name,
      ua.zip_code,
      ua.phone,
      CONCAT(
        ua.shippingAddress, ' ',
        ua.sub_district_name, ' ',
        ua.district_name, ' ',
        ua.province_name, ' ',
        ua.zip_code
      ) AS full_address

    FROM orders o
    LEFT JOIN users u ON o.user_id = u.user_id
    LEFT JOIN users s ON o.seller_id = s.user_id
    LEFT JOIN profiles p ON u.user_id = p.user_id
    LEFT JOIN profiles ps ON s.user_id = ps.user_id
    LEFT JOIN payment pay ON o.payment_id = pay.payment_id
    LEFT JOIN user_addresses ua ON o.user_addresses_id = ua.user_addresses_id
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
    // console.log("Order data fetched:", order); 

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


// ดึงสินค้าทั้งหมดของผู้ขาย พร้อมจำนวนคำสั่งซื้อ
router.get('/seller-products', (req, res) => {
  const sellerId = req.query.seller_id;

  if (!sellerId) {
    return res.status(400).json({ error: "กรุณาระบุ seller_id" });
  }

  const query = `
    SELECT 
      p.product_id,
      p.product_name,
      p.price,
      p.image,
      p.description,
      p.status,
      COUNT(DISTINCT o.order_id) AS total_orders,
      COALESCE(SUM(od.quantity), 0) AS total_sold,
      COALESCE(SUM(od.total), 0) AS total_revenue
    FROM products p
    LEFT JOIN order_detail od ON p.product_id = od.product_id
    LEFT JOIN orders o ON od.order_id = o.order_id AND o.delete_at IS NULL
    WHERE p.user_id = ? AND p.deleted_at IS NULL
    GROUP BY p.product_id, p.product_name, p.price, p.image, p.description, p.status
    ORDER BY p.created_at DESC
  `;

  db.query(query, [sellerId], (err, results) => {
    if (err) {
      console.error("Error fetching seller products:", err);
      return res.status(500).json({ success: false, error: "Database error" });
    }
    res.json({ success: true, data: results });
  });
});

// แสดงคำสั่งซื้อของผู้ใช้ตามไอดี
router.get('/orders-user/:userId', async (req, res) => {
  const userId = req.params.userId;

  try {
    // ดึงรายการคำสั่งซื้อทั้งหมดของผู้ใช้ พร้อม tracking_number
  const [orders] = await db.promise().query(
    `SELECT 
        o.order_id,
        o.order_date,
        o.order_status,
        o.tracking_number,
        o.total_amount,
        p.full_name,
        ua.*,
        tc.name AS transport_company_name,
        tc.code AS transport_company_code
    FROM orders o
    LEFT JOIN profiles p 
        ON o.user_id = p.user_id
    LEFT JOIN user_addresses ua 
        ON o.user_addresses_id = ua.user_addresses_id
    LEFT JOIN transport_company tc 
        ON o.transport_company_id = tc.transport_company_id
    WHERE o.user_id = ?
    ORDER BY o.order_date DESC`,
    [userId]
  );

    // ดึงสินค้าในแต่ละคำสั่งซื้อ
    const orderIds = orders.map(order => order.order_id);
    if (orderIds.length === 0) {
      return res.json([]);
    }

    const [orderItems] = await db.promise().query(
      `SELECT od.*, p.product_name, p.price, p.image, p.is_official, od.order_id 
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

// -------------------------------------------------------------------------------------------
// ผู้ขายดูสินค้าที่ตัวเองสร้าง
// router.get('/products-seller/:userId', (req, res) => {
//   const { userId } = req.params;

//   const query = `
//     SELECT product_id, product_name, description, image, price, stock, status, created_at, updated_at
//     FROM products
//     WHERE user_id = ? 
//   `;

//   db.query(query, [userId], (err, results) => {
//     if (err) {
//       console.error("Error fetching products for seller:", err);
//       return res.status(500).json({ error: "Database error" });
//     }
//     res.json({ success: true, data: results });
//   });
// });

// ดึงบริษัทขนส่งทั้งหมด
router.get('/shipping-companies', (req, res) => {
  const query = `SELECT transport_company_id , name, code FROM transport_company WHERE delete_at IS NULL`;
  db.query(query, (err, results) => {
    if (err) {
      console.error("Error fetching shipping companies:", err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json({ success: true, companies: results });
  });
});

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
// ----------------------------
// แสดงคำสั่งซื้อที่รอการชำระเงินของผู้ใช้
// router.get('/pending-payment', (req, res) => {
//   const sql = `
//         SELECT 
//             o.order_id,
//             o.user_id,
//             o.payment_status,
//             o.total_amount,
//             o.order_date,
//             p.full_name AS buyer_name,
//             pay.payment_id,
//             pay.slip_path
//         FROM orders o
//         JOIN profiles p ON o.user_id = p.user_id
//         LEFT JOIN payment pay ON o.payment_id = pay.payment_id
//         WHERE o.payment_status = 'pending'
//         ORDER BY o.create_at DESC
//     `;

//   db.query(sql, async (err, orders) => {
//     if (err) return res.status(500).json({ error: err });

//     const orderIds = orders.map(o => o.order_id);
//     if (orderIds.length === 0) return res.json([]);

//     const productSql = `
//       SELECT 
//           od.order_id, 
//           pr.product_name, 
//           pr.image, 
//           pr.price,
//           od.quantity, 
//           od.total,
//           seller.user_id AS seller_id,
//           seller.full_name AS seller_name,
//           pm.account_name AS seller_account_name,
//           pm.account_number,
//           pm.promptpay_number
//       FROM order_detail od
//       JOIN products pr ON od.product_id = pr.product_id
//       JOIN profiles seller ON pr.user_id = seller.user_id
//       LEFT JOIN payment_methods pm ON pr.payment_method_id = pm.payment_method_id
//       WHERE od.order_id IN (?)
//     `;

//     db.query(productSql, [orderIds], (err2, orderProducts) => {
//       if (err2) return res.status(500).json({ error: err2 });

//       const orderMap = {};
//       orders.forEach(o => {
//         orderMap[o.order_id] = { ...o, products: [] };
//       });

//       orderProducts.forEach(p => {
//         if (orderMap[p.order_id]) {
//           // เก็บข้อมูลผู้ขายจากสินค้าชิ้นแรก
//           if (orderMap[p.order_id].products.length === 0) {
//             orderMap[p.order_id].seller_name = p.seller_name;
//             orderMap[p.order_id].seller_account_name = p.seller_account_name;
//             orderMap[p.order_id].account_number = p.account_number;
//             orderMap[p.order_id].promptpay_number = p.promptpay_number;
//           }
//           orderMap[p.order_id].products.push(p);
//         }
//       });

//       res.json(Object.values(orderMap));
//     });
//   });
// });

// แสดงคำสั่งซื้อที่รอการชำระเงินของผู้ใช้ (เฉพาะสินค้าของสมาคม)
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
      WHERE od.order_id IN (?) AND pr.is_official = 1
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

      // กรองเฉพาะคำสั่งซื้อที่มีสินค้าของสมาคมเท่านั้น
      const officialOrders = Object.values(orderMap).filter(o => o.products.length > 0);

      res.json(officialOrders);
    });
  });
});


// แอดมินตรวจสอบการชำระเงิน
router.post('/verify-payment', (req, res) => {
  const { order_id, isApproved, reject_reason } = req.body;
  const admin_id = req.session.user?.id;

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
          COALESCE(SUM(quantity - sold), 0) AS available_quantity --คงเหลือที่ยังขายได้
        FROM product_slots
        WHERE product_id = ?
          AND status = 'active'  --เฉพาะสินค้าที่ยังขายได้
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


// อัปโหลดหลักฐานการรับสินค้า 
router.post('/:orderId/upload-proof', upload.single('proofImage'), (req, res) => {
  const orderId = req.params.orderId;
  const proofImagePath = req.file ? req.file.filename : null;

  // if (!proofImagePath) {
  //   return res.status(400).json({ 
  //     success: false, 
  //     message: "กรุณาอัปโหลดหลักฐานการรับสินค้า" 
  //   });
  // }

  console.log("📦 เริ่มอัปโหลดหลักฐานสำหรับ order:", orderId);
  console.log("📸 รูปที่อัปโหลด:", proofImagePath);

  const updateQuery = `
    UPDATE orders
    SET order_status = 'delivered',
        delivered_at = NOW(),
        proof_image = ?
    WHERE order_id = ? AND order_status IN ('shipping', 'resend_processing')
  `;

  db.query(updateQuery, [proofImagePath, orderId], (err, result) => {
    if (err) {
      console.error("Error updating order:", err);
      return res.status(500).json({ success: false, message: "อัปเดตสถานะไม่สำเร็จ" });
    }

    console.log("ผลลัพธ์จากการอัปเดต:", result);

    if (result.affectedRows === 0) {
      console.log("ไม่มีคำสั่งซื้อที่ตรงเงื่อนไข (status ไม่ใช่ shipping หรือ resend_processing)");
      return res.status(400).json({ 
        success: false, 
        message: "ไม่สามารถยืนยันคำสั่งซื้อนี้ได้" 
      });
    }

    // หา user_id ของผู้ขาย
    const sellerQuery = `
      SELECT p.user_id AS seller_id, o.user_id AS buyer_id
      FROM orders o
      JOIN order_detail od ON o.order_id = od.order_id
      JOIN products p ON od.product_id = p.product_id
      WHERE o.order_id = ?
      LIMIT 1
    `;
    
    db.query(sellerQuery, [orderId], (err, sellerResult) => {
      if (err) {
        console.error("ไม่สามารถหาผู้ขาย:", err);
      } else {
        console.log("ผลการค้นหาผู้ขาย:", sellerResult);
      }
      
      if (sellerResult.length > 0) {
        const sellerId = sellerResult[0].seller_id;

        // แจ้งผู้ขาย
        const notifySellerQuery = `
          INSERT INTO notifications (user_id, type, message, related_id, send_date, status)
          VALUES (?, 'order', 'ผู้ซื้อได้ยืนยันการรับสินค้าแล้ว', ?, NOW(), 'ยังไม่อ่าน')
        `;
        db.query(notifySellerQuery, [sellerId, orderId], (err) => {
          if (err) console.error("ไม่สามารถส่งการแจ้งเตือน:", err);
          else console.log("แจ้งเตือนถูกส่งให้ผู้ขาย:", sellerId);
        });
      }
    });

    res.json({ 
      success: true, 
      message: "ยืนยันได้รับสินค้าแล้ว",
      proof_image: proofImagePath
    });
  });
});


// ==================== หรือถ้ายังต้องการใช้ PUT method (เพิ่มอีก route) ====================

// router.put('/orders-confirm/:orderId', upload.single('proofImage'), (req, res) => {
//   const orderId = req.params.orderId;
//   const proofImagePath = req.file ? req.file.filename : null;

//   if (!proofImagePath) {
//     return res.status(400).json({ 
//       success: false, 
//       message: "กรุณาอัปโหลดหลักฐานการรับสินค้า" 
//     });
//   }

//   const updateQuery = `
//     UPDATE orders
//     SET order_status = 'delivered',
//         delivered_at = NOW(),
//         delivery_proof = ?
//     WHERE order_id = ? AND order_status IN ('shipping', 'resend_processing')
//   `;

//   db.query(updateQuery, [proofImagePath, orderId], (err, result) => {
//     if (err) return res.status(500).json({ success: false, error: "อัปเดตสถานะไม่สำเร็จ" });
//     if (result.affectedRows === 0) return res.status(400).json({ success: false, message: "ไม่สามารถยืนยันคำสั่งซื้อนี้ได้" });

//     const sellerQuery = `
//       SELECT p.user_id AS seller_id
//       FROM orders o
//       JOIN order_detail od ON o.order_id = od.order_id
//       JOIN products p ON od.product_id = p.product_id
//       WHERE o.order_id = ?
//       LIMIT 1
//     `;
    
//     db.query(sellerQuery, [orderId], (err, sellerResult) => {
//       if (err) return console.error("ไม่สามารถหาผู้ขาย:", err);
//       if (sellerResult.length > 0) {
//         const sellerId = sellerResult[0].seller_id;

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

              //  เพิ่มข้อความพิเศษสำหรับกรณีคืนสินค้า / คืนเงิน
              let infoMessage = '';
              if (
                (parsedResolutionOptions && parsedResolutionOptions.includes('refund')) ||
                issue_type.toLowerCase().includes('คืน')
              ) {
                infoMessage =
                  'คุณเลือกการคืนสินค้า/คืนเงิน กรุณาส่งสินค้ากลับมาก่อน แล้วแอดมินจะดำเนินการคืนเงินให้ภายหลัง';
              }

              res.json({
                success: true,
                message: 'แจ้งปัญหาสำเร็จ',
                infoMessage, // เพิ่มข้อความนี้ใน response
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

        db.query(
          `INSERT INTO order_returns (issue_id, evidence_path, status, created_at, updated_at) 
           VALUES (?, ?, 'pending', NOW(), NOW())`,
          [issue_id, evidencePath],
          (err, result) => {
            if (err) return db.rollback(() => res.status(500).json({ error: "Insert order_returns failed" }));

            // อัปเดต status ของ order
            db.query(
              `UPDATE orders SET order_status = 'return_pending', update_at = NOW() WHERE order_id = ?`,
              [order_id],
              (err) => {
                if (err) return db.rollback(() => res.status(500).json({ error: "Update order status failed" }));

                // แจ้งเตือนแอดมิน
                db.query(`SELECT user_id FROM users WHERE role_id = 1`, (err, admins) => {
                  if (err) return db.rollback(() => res.status(500).json({ error: "Query admin failed" }));
                  if (!admins.length) return db.rollback(() => res.status(404).json({ error: "No admin found" }));

                  const message = `สินค้า ${product_name} กำลังส่งคืน จากผู้ใช้ ${user_id} `;
                  const insertNotificationQuery = `
                    INSERT INTO notifications (user_id, type, message, related_id, send_date, status)
                    VALUES (?, 'return_product', ?, ?, NOW(), 'unread')
                  `;

                  admins.forEach(admin => {
                    db.query(insertNotificationQuery, [admin.user_id, message, issue_id], (err) => {
                      if (err) console.error("Error inserting notification for admin:", err);
                    });
                  });

                  db.commit((err) => {
                    if (err) return db.rollback(() => res.status(500).json({ error: "Commit failed" }));
                    res.json({ success: true, message: "ส่งสินค้าสำเร็จ และแจ้งเตือนแอดมินเรียบร้อย" });
                  });
                });
              }
            );
          }
        );
      }
    );
  });
});


// -----------------------ยกเลิกการสั่งซื้อ--------------------
router.put("/cancel/:orderId", (req, res) => {
  const { orderId } = req.params;
  const { reason, userId } = req.body; 

  if (!reason) {
    return res.status(400).json({ message: "กรุณาระบุเหตุผลในการยกเลิก" });
  }

  const cancelOrderQuery = `
    UPDATE orders 
    SET order_status = 'repeal_pending', reason = ?, update_at = NOW() 
    WHERE order_id = ?
  `;

  db.query(cancelOrderQuery, [reason, orderId], (err, result) => {
    if (err) return res.status(500).json({ message: "อัปเดตคำสั่งซื้อไม่สำเร็จ" });

    // ดึงข้อมูลผู้ใช้เพื่อแจ้งแอดมิน
    const getUserQuery = `
      SELECT p.full_name, p.address 
      FROM profiles p 
      JOIN users u ON u.user_id = p.user_id
      WHERE u.user_id = ?
    `;

    db.query(getUserQuery, [userId], (err2, users) => {
      if (err2 || users.length === 0) {
        console.error("ไม่พบข้อมูลผู้ใช้");
      } else {
        const user = users[0];

        const notifyQuery = `
          INSERT INTO notifications (user_id, message, type, created_at, is_read)
          VALUES (?, ?, 'order_cancel', NOW(), 0)
        `;
        const message = `ผู้ใช้ ${user.full_name} ได้ยกเลิกคำสั่งซื้อ #${orderId} : ${reason}`;
1
        db.query(notifyQuery, [1, message], (err3) => {
          if (err3) console.error("บันทึกแจ้งเตือนล้มเหลว:", err3);
        });
      }
    });

    return res.json({ message: "ยกเลิกคำสั่งซื้อสำเร็จ" });
  });
});

// ------------------ผู้ซื้อยืนยันการแก้ปัญหาแล้ว-----------------
router.post("/resolve-issue/:orderId", async (req, res) => {
  const { orderId } = req.params;

  try {
    const updateQuery = `
      UPDATE orders 
      SET order_status = 'resolved', update_at = NOW()
      WHERE order_id = ?
    `;
    await db.query(updateQuery, [orderId]);

    // อัปเดต issue status 
    const issueQuery = `
      UPDATE order_issues 
      SET admin_status = 'approved', resolution_type = 'approved', resolution_note = 'ปัญหาได้รับการแก้ไขแล้ว', updated_at = NOW()
      WHERE order_id = ?
    `;
    await db.query(issueQuery, [orderId]);

    res.json({ success: true, message: "แก้ไขปัญหาสำเร็จแล้ว" });
  } catch (error) {
    console.error("Resolve issue error:", error);
    res.status(500).json({ success: false, error: "เกิดข้อผิดพลาดในการอัปเดตสถานะ" });
  }
});



module.exports = router;