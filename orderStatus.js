// constants/orderStatus.js
const ORDER_STATUS = {
  PENDING_VERIFICATION: "pending_verification",   // รอตรวจสอบการชำระเงิน
  PROCESSING: "processing",                       // กำลังดำเนินการ
  SHIPPING: "shipping",                           // กำลังจัดส่ง
  DELIVERED: "delivered",                         // จัดส่งสำเร็จ
  ISSUE_REPORTED: "issue_reported",               // มีปัญหาการจัดส่ง
  REFUND_APPROVED: "refund_approved",             // คืนเงินอนุมัติ
  RESEND_PROCESSING: "resend_processing",         // ส่งสินค้าใหม่กำลังดำเนินการ
  ISSUE_REJECTED: "issue_rejected",               // ปัญหาไม่ได้รับการแก้ไข
  RETURN_PENDING: "return_pending",               // ผู้ใช้ส่งสินค้าคืน
  RETURN_APPROVED: "return_approved",             // อนุมัติการคืน
  RETURN_REJECTED: "return_rejected",             // การคืนไม่ผ่าน
  CANCELLED: "cancelled",                         // ยกเลิก
};

module.exports = ORDER_STATUS;
