const express = require('express');
const router = express.Router();
const db = require('../db');
const cron = require('node-cron');
const multer = require('multer');
const path = require('path');
const { SystemlogAction } = require('../logUserAction');
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
        'สมาคมศิษย์เก่าวิทยาลัยการคอมพิวเตอร์' AS seller_name,  -- กำหนด seller เป็นชื่อคงที่
        pr.product_name
    FROM orders o
    LEFT JOIN users u ON o.user_id = u.user_id
    LEFT JOIN profiles p ON u.user_id = p.user_id
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


// แอดมินอัปเดตสถานะคำสั่งซื้อ
router.post('/admin/orders-status/:orderId', (req, res) => {
  let { order_status, tracking_number, transport_company_id } = req.body;
  const { orderId } = req.params;
  const ipAddress = req.ip; // ดึง IP Address สำหรับ Log

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
    // บันทึก System Log
    SystemlogAction(
      userId, // ID ของผู้กระทำ (Admin)
      'Order', // moduleName
      'UPDATE',  // actionType
      `อัปเดตเลขพัสดุ`, // description
      ipAddress,
      orderId // relatedId
    );

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

// แสดงคำสั่งซื้อของผู้ใช้ตามไอดี
router.get('/orders-user/:userId', async (req, res) => {
  const userId = req.params.userId;

  try {
    // ดึงรายการคำสั่งซื้อทั้งหมดของผู้ใช้
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

    if (orders.length === 0) {
      return res.json([]);
    }

    // ดึงรายละเอียดสินค้าในแต่ละคำสั่งซื้อ
    const orderIds = orders.map(order => order.order_id);
    const [orderItems] = await db.promise().query(
      `SELECT 
          od.order_id,
          od.product_id,
          od.quantity,
          p.product_name,
          p.price,
          p.image,
          p.is_official
       FROM order_detail od
       JOIN products p ON od.product_id = p.product_id
       WHERE od.order_id IN (${orderIds.map(() => '?').join(',')})`,
      orderIds
    );

    // รวมสินค้ากับ order หลัก
    const ordersWithProducts = orders.map(order => ({
      ...order,
      products: orderItems
        .filter(item => item.order_id === order.order_id)
        .map(item => ({
          product_id: item.product_id,
          product_name: item.product_name,
          quantity: item.quantity,
          price: item.price,
          subtotal: item.subtotal,
          image: item.image,
          is_official: item.is_official
        }))
    }));

    res.json(ordersWithProducts);
  } catch (err) {
    console.error("Error fetching orders:", err);
    res.status(500).json({ error: "เกิดข้อผิดพลาด" });
  }
});


// -------------------------------------------------------------------------------------------

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

  db.query(sql, (err, orders) => {
    if (err) return res.status(500).json({ error: err });

    if (orders.length === 0) return res.json([]);

    const orderIds = orders.map(o => o.order_id);

    const productSql = `
      SELECT 
          od.order_id, 
          pr.product_name, 
          pr.image, 
          pr.price,
          od.quantity, 
          od.total
      FROM order_detail od
      JOIN products pr ON od.product_id = pr.product_id
      WHERE od.order_id IN (?)
    `;

    db.query(productSql, [orderIds], (err2, orderProducts) => {
      if (err2) return res.status(500).json({ error: err2 });

      // ดึงบัญชีสมาคมที่เป็นทางการ
      const officialAccountSql = `
        SELECT 
          bank_name,
          account_name,
          account_number,
          promptpay_number
        FROM payment_methods
        WHERE is_official = 1
        LIMIT 1
      `;

      db.query(officialAccountSql, (err3, accounts) => {
        if (err3) return res.status(500).json({ error: err3 });

        const account = accounts[0] || {
          bank_name: "-",
          account_name: "-",
          account_number: "-",
          promptpay_number: "-"
        };

        const orderMap = {};
        orders.forEach(o => {
          orderMap[o.order_id] = {
            ...o,
            products: [],
            // ส่งข้อมูลบัญชีสมาคมแบบแบนราบ
            bank_name: account.bank_name,
            account_name: account.account_name,
            account_number: account.account_number,
            promptpay_number: account.promptpay_number
          };
        });

        orderProducts.forEach(p => {
          if (orderMap[p.order_id]) {
            orderMap[p.order_id].products.push(p);
          }
        });

        res.json(Object.values(orderMap));
      });
    });
  });
});

// แอดมินตรวจสอบการชำระเงิน
router.post('/verify-payment', async (req, res) => {
  const { order_id, isApproved, reject_reason } = req.body;
  const admin_id = req.session.user?.id ? parseInt(req.session.user.id) : null;
  const ipAddress = req.ip;

  if (!order_id || !admin_id) {
    return res.status(400).json({ error: "ข้อมูลไม่ครบถ้วน หรือไม่ได้เข้าสู่ระบบในฐานะผู้ดูแล" });
  }

  const paymentStatus = isApproved ? 'paid' : 'rejected';
  const orderStatus = isApproved ? 'processing' : 'cancelled';

  const connection = await db.promise().getConnection();
  try {
    await connection.beginTransaction();

    // อัปเดตสถานะการชำระเงิน
    await connection.query(
      `UPDATE payment
             SET payment_status = ?, verified_by = ?, verified_at = NOW(), reject_reason = ?
             WHERE order_id = ?`,
      [paymentStatus, admin_id, reject_reason || null, order_id]
    );

    // อัปเดตสถานะคำสั่งซื้อ
    await connection.query(
      `UPDATE orders
             SET payment_status = ?, order_status = ?
             WHERE order_id = ?`,
      [paymentStatus, orderStatus, order_id]
    );

    // ดึง user_id (ผู้ซื้อ)
    const [orderRows] = await connection.query(
      `SELECT user_id FROM orders WHERE order_id = ?`,
      [order_id]
    );

    if (orderRows.length === 0) {
      throw new Error('ไม่พบคำสั่งซื้อ');
    }

    const { user_id: buyer_id } = orderRows[0];

    // --- บันทึก System Log ---
    const actionType = isApproved ? 'APPROVE' : 'REJECT';
    const logDescription = isApproved
      ? `Admin ${admin_id} approved payment for Order ID: ${order_id}.`
      : `Admin ${admin_id} rejected payment for Order ID: ${order_id}. Reason: ${reject_reason || 'No reason provided'}.`;

    SystemlogAction(admin_id, 'Order', actionType, logDescription, ipAddress, order_id);

    // --- แจ้งเตือนผู้ซื้อ ---
    const buyerMessage = isApproved
      ? `คำสั่งซื้อของคุณได้รับการยืนยันการชำระเงินเรียบร้อยแล้ว`
      : `คำสั่งซื้อของคุณถูกปฏิเสธการชำระเงิน: ${reject_reason}`;

    await connection.query(
      `INSERT INTO notifications (user_id, type, message, related_id, send_date, status)
             VALUES (?, 'payment', ?, ?, NOW(), 'ยังไม่อ่าน')`,
      [buyer_id, buyerMessage, order_id]
    );

    // ถ้าปฏิเสธ ไม่ต้องหัก slot
    if (!isApproved) {
      await connection.commit();
      return res.json({ success: true, message: 'ปฏิเสธการชำระเงินและแจ้งเตือนผู้ซื้อแล้ว' });
    }

    // --- อนุมัติ: หัก slot ---
    const [orderItems] = await connection.query(
      `SELECT od.product_id, od.quantity, p.product_name
             FROM order_detail od
             JOIN products p ON od.product_id = p.product_id
             WHERE od.order_id = ?`,
      [order_id]
    );

    for (const item of orderItems) {
      let remainingToSell = item.quantity;

      const [slots] = await connection.query(
        `SELECT * FROM product_slots
   WHERE product_id = ?
     AND status IN ('active', 'pending')
     AND (created_at <= NOW())
     AND (end_date IS NULL OR end_date >= NOW())
   ORDER BY created_at ASC`,
        [item.product_id]
      );

      for (let i = 0; i < slots.length && remainingToSell > 0; i++) {
        const slot = slots[i];
        const slotRemaining = slot.quantity - slot.sold - slot.reserved;
        const deduct = Math.min(slotRemaining + slot.reserved, remainingToSell);

        await connection.query(
          `UPDATE product_slots
             SET sold = sold + ?,
                 reserved = GREATEST(reserved - ?, 0),
                 status = CASE WHEN sold + ? >= quantity THEN 'ended' ELSE 'active' END
             WHERE slot_id = ?`,
          [deduct, deduct, deduct, slot.slot_id]
        );

        remainingToSell -= deduct;

        if (slotRemaining - deduct <= 0 && i + 1 < slots.length) {
          const nextSlot = slots[i + 1];
          if (nextSlot.status === 'pending') {
            await connection.query(
              `UPDATE product_slots SET status = 'active' WHERE slot_id = ?`,
              [nextSlot.slot_id]
            );
          }
        }
      }
    }


    await connection.commit();
    res.json({ success: true, message: 'ตรวจสอบและอนุมัติการชำระเงินเรียบร้อยแล้ว' });

  } catch (err) {
    await connection.rollback();
    console.error("Error during payment verification:", err);
    SystemlogAction(admin_id || 0, 'Order', 'ERROR', `Error verifying Order ID ${order_id}: ${err.message}`, ipAddress, order_id);
    res.status(500).json({ error: err.message || 'เกิดข้อผิดพลาด' });
  } finally {
    connection.release();
  }
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
          COALESCE(SUM(quantity - sold), 0) AS available_quantity 
        FROM product_slots
        WHERE product_id = ?
          AND status = 'active' 
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

  console.log("เริ่มอัปโหลดหลักฐานสำหรับ order:", orderId);
  console.log("รูปที่อัปโหลด:", proofImagePath);

  const updateQuery = `
    UPDATE orders
    SET order_status = 'delivered',
        delivered_at = NOW(),
        proof_image = ?
    WHERE order_id = ? AND order_status IN ('shipping', 'resend_processing')
  `;

  db.query(updateQuery, [proofImagePath, orderId], (err, result) => {
    if (err) {
      console.error("❌ Error updating order:", err);
      return res.status(500).json({ success: false, message: "อัปเดตสถานะไม่สำเร็จ" });
    }

    if (result.affectedRows === 0) {
      console.log("ไม่มีคำสั่งซื้อที่ตรงเงื่อนไข (status ไม่ใช่ shipping หรือ resend_processing)");
      return res.status(400).json({ success: false, message: "ไม่สามารถยืนยันคำสั่งซื้อนี้ได้" });
    }

    // หา user_id ของผู้ซื้อ (เพื่อแจ้งชื่อใน log ถ้าต้องการ)
    const buyerQuery = `SELECT user_id FROM orders WHERE order_id = ? LIMIT 1`;
    db.query(buyerQuery, [orderId], (err, buyerResult) => {
      if (err) {
        console.error("ไม่สามารถหาผู้ซื้อ:", err);
      } else if (buyerResult.length > 0) {
        const buyerId = buyerResult[0].user_id;

        //แจ้งเตือนแอดมิน 
        const notifyAdminQuery = `
          INSERT INTO notifications (user_id, type, message, related_id, send_date, status)
          VALUES ((SELECT user_id FROM users WHERE role_id = 1 LIMIT 1), 
                  'order', 
                  CONCAT('ผู้ซื้อ (ID:', ?, ') ได้ยืนยันการรับสินค้าแล้ว'), 
                  ?, 
                  NOW(), 
                  'ยังไม่อ่าน')
        `;
        db.query(notifyAdminQuery, [buyerId, orderId], (err) => {
          if (err) console.error("ไม่สามารถส่งการแจ้งเตือนให้แอดมิน:", err);
          else console.log("แจ้งเตือนถูกส่งให้แอดมินเรียบร้อย");
        });
      }
    });

    res.json({
      success: true,
      message: "ยืนยันได้รับสินค้าแล้ว และแจ้งแอดมินเรียบร้อย",
      proof_image: proofImagePath
    });
  });
});



// ==================== หรือถ้ายังต้องการใช้ PUT method (เพิ่มอีก route) ====================

// ผู้ใช้แจ้งปัญหา
router.post('/report-issue', upload.single('evidenceImage'), async (req, res) => {
  const { order_id, issue_type, description, contacted, resolution_options } = req.body;
  const user_id = req.session.user?.id ? parseInt(req.session.user.id) : null;
  const ipAddress = req.ip;
  const evidence_path = req.file ? `uploads/${req.file.filename}` : null; // ปรับให้มี 'uploads/'

  if (!user_id) return res.status(401).json({ error: 'คุณยังไม่ได้เข้าสู่ระบบ' });
  if (!order_id || !issue_type) return res.status(400).json({ error: 'ข้อมูลไม่ครบ' });

  let parsedResolutionOptions = null;
  try {
    parsedResolutionOptions = resolution_options ? JSON.parse(resolution_options) : null;
  } catch (e) {
    return res.status(400).json({ error: 'รูปแบบ resolution_options ไม่ถูกต้อง' });
  }

  const connection = await db.promise().getConnection();
  try {
    await connection.beginTransaction();

    // 1. Insert order issue
    const [insertResult] = await connection.query(
      `INSERT INTO order_issues 
             (order_id, issue_type, description, contacted, evidence_path, resolution_options, created_at)
             VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [
        order_id,
        issue_type,
        description || null,
        contacted,
        evidence_path,
        parsedResolutionOptions ? JSON.stringify(parsedResolutionOptions) : null
      ]
    );

    const issue_id = insertResult.insertId;

    // 2. อัปเดตสถานะ order เป็น issue_reported
    await connection.query(
      `UPDATE orders SET order_status = 'issue_reported' WHERE order_id = ?`,
      [order_id]
    );

    // 3. ดึงรายชื่อ admin (role_id = 1)
    const [admins] = await connection.query(
      `SELECT user_id FROM users WHERE role_id = 1`
    );

    // 4. แจ้งเตือนแอดมินทุกคน
    const message = `ผู้ใช้แจ้งปัญหา (${issue_type}) ในคำสั่งซื้อ #${order_id}`;
    const insertNotificationQuery = `
            INSERT INTO notifications (user_id, type, message, related_id, send_date, status)
            VALUES (?, 'issue', ?, ?, NOW(), 'ยังไม่อ่าน') 
        `;

    for (const admin of admins) {
      await connection.query(insertNotificationQuery, [admin.user_id, message, order_id]);
    }

    // Commit ข้อมูล
    await connection.commit();

    // --- Log ประวัติการดำเนินการด้วย SystemlogAction ---
    SystemlogAction(
      user_id, // ID ของผู้กระทำ (User)
      'OrderIssue', // moduleName
      'REPORT',   // actionType
      `ผู้ใช้แจ้งปัญหา: ${issue_type} ของรายการ: ${order_id}.`, // description
      ipAddress,
      issue_id // relatedId
    );
    // ----------------------------------------------------

    // เพิ่มข้อความเพิ่มเติมถ้าเป็นการคืนเงิน / คืนสินค้า
    let infoMessage = '';
    if (
      (parsedResolutionOptions && parsedResolutionOptions.includes('refund')) ||
      issue_type.toLowerCase().includes('คืน')
    ) {
      infoMessage =
        'คุณเลือกการคืนสินค้า/คืนเงิน กรุณาส่งสินค้ากลับมาก่อน แล้วแอดมินจะดำเนินการคืนเงินให้ภายหลัง';
    }

    // ส่ง response 
    res.json({
      success: true,
      message: 'แจ้งปัญหาสำเร็จ',
      infoMessage,
      issue_id,
      order_status: 'issue_reported',
      resolution_options: parsedResolutionOptions
    });

  } catch (err) {
    await connection.rollback();
    console.error('Error in /report-issue:', err);

    res.status(500).json({ error: err.message || 'เกิดข้อผิดพลาดในการแจ้งปัญหา' });
  } finally {
    connection.release();
  }
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
  const { issue_id } = req.body;
  const evidencePath = req.file ? req.file.filename : null;

  if (!issue_id) {
    return res.status(400).json({ error: "ต้องระบุ issue_id" });
  }

  db.getConnection((err, connection) => {
    if (err) {
      console.error("Database connection error:", err);
      return res.status(500).json({ error: "ไม่สามารถเชื่อมต่อฐานข้อมูลได้" });
    }

    connection.beginTransaction(err => {
      if (err) {
        connection.release();
        return res.status(500).json({ error: "ไม่สามารถเริ่ม transaction ได้" });
      }

      //ดึงข้อมูล issue 
      const issueQuery = `
        SELECT 
          oi.order_id,
          o.user_id,
          p.product_name
        FROM order_issues oi
        JOIN orders o ON oi.order_id = o.order_id
        JOIN order_detail od ON od.order_id = o.order_id
        JOIN products p ON p.product_id = od.product_id
        WHERE oi.issue_id = ?
      `;

      connection.query(issueQuery, [issue_id], (err, issueRows) => {
        if (err) {
          return connection.rollback(() => {
            connection.release();
            res.status(500).json({ error: "ดึงข้อมูลปัญหาสินค้าล้มเหลว" });
          });
        }

        if (issueRows.length === 0) {
          return connection.rollback(() => {
            connection.release();
            res.status(404).json({ error: "ไม่พบข้อมูล issue นี้" });
          });
        }

        const { order_id, user_id, product_name } = issueRows[0];

        const insertReturnQuery = `
          INSERT INTO order_returns (
            issue_id,
            evidence_path,
            status,
            created_at,
            updated_at
          )
          VALUES (?, ?, 'pending', NOW(), NOW())
        `;

        connection.query(insertReturnQuery, [issue_id, evidencePath], (err) => {
          if (err) {
            return connection.rollback(() => {
              connection.release();
              res.status(500).json({ error: "บันทึกข้อมูลคืนสินค้าล้มเหลว" });
            });
          }

          //อัปเดตสถานะ order
          const updateOrderQuery = `
            UPDATE orders
            SET order_status = 'return_pending', update_at = NOW()
            WHERE order_id = ?
          `;

          connection.query(updateOrderQuery, [order_id], (err) => {
            if (err) {
              return connection.rollback(() => {
                connection.release();
                res.status(500).json({ error: "อัปเดตสถานะออเดอร์ล้มเหลว" });
              });
            }

            //ดึงรายชื่อ admin
            connection.query(`SELECT user_id FROM users WHERE role_id = 1 AND is_active = 1`, (err, admins) => {
              if (err) {
                return connection.rollback(() => {
                  connection.release();
                  res.status(500).json({ error: "ดึงข้อมูลผู้ดูแลระบบล้มเหลว" });
                });
              }

              if (admins.length === 0) {
                return connection.rollback(() => {
                  connection.release();
                  res.status(404).json({ error: "ไม่พบผู้ดูแลระบบ" });
                });
              }

              //แจ้งเตือน
              const message = `สินค้า "${product_name}" กำลังอยู่ในกระบวนการคืนจากผู้ใช้ ID ${user_id}`;
              const notifyQuery = `
                INSERT INTO notifications (user_id, type, message, related_id, send_date, status)
                VALUES (?, 'return_product', ?, ?, NOW(), 'ยังไม่อ่าน')
              `;

              // ส่งแจ้งเตือนทุกแอดมิน
              admins.forEach(admin => {
                connection.query(notifyQuery, [admin.user_id, message, issue_id], err => {
                  if (err) console.warn("แจ้งเตือนแอดมินล้มเหลว:", err);
                });
              });

              connection.commit(err => {
                if (err) {
                  return connection.rollback(() => {
                    connection.release();
                    res.status(500).json({ error: "บันทึกธุรกรรมล้มเหลว" });
                  });
                }

                connection.release();
                res.json({
                  success: true,
                  message: "ส่งคำขอคืนสินค้าสำเร็จ และแจ้งเตือนผู้ดูแลระบบเรียบร้อย",
                  evidence: evidencePath || null
                });
              });
            });
          });
        });
      });
    });
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
                INSERT INTO notifications (user_id, type, message, related_id, send_date, status)
                VALUES (?, 'order_cancel', ?, ?, NOW(), 'ยังไม่อ่าน')
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



module.exports = router;