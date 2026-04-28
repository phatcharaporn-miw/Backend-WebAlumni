# College of Computing Alumni Web Application

เว็บแอปพลิเคชันสมาคมศิษย์เก่าวิทยาลัยการคอมพิวเตอร์ ออกแบบเพื่อส่งเสริมการมีส่วนร่วม รวมไปถึงการสนับสนุนโครงการและกิจกรรมต่าง ๆ การสื่อสารภายในองค์กร และการจัดการกิจกรรมแบบครบวงจร รวมทั้งเพื่อพัฒนาระบบการรับบริจาคที่ชัดเจน ให้ศิษย์เก่าได้รับการแจ้งเตือน และเชิญชวนในการบริจาคอย่างทั่วถึง

---

## 🚀 Key Features

### User & Role Management
- ระบบสมัครสมาชิกและยืนยันตัวตน
- Role-based access control (Admin / President / Alumni / Student)
- จัดการข้อมูลโปรไฟล์และประวัติการศึกษาแบบหลายระดับ
  
---

### Community & Engagement
- Webboard สำหรับการโพสต์ คอมเมนต์ และการกดถูกใจ
- ระบบหมวดหมู่โพสต์
- ระบบติดตามโพสต์ที่สนใจ (Favorites)
  
---

### Notification
- ระบบแจ้งเตือน
- แจ้งเตือนกิจกรรม Like / Comment / Interaction
  
---

### Event Management
- ระบบจัดการกิจกรรมโดย Admin
- QR Code สำหรับการเข้าร่วมกิจกรรม
- ตรวจสอบสิทธิ์ตามรุ่นและสาขา
  
---

### Donation System
- ระบบรับบริจาคจากศิษย์เก่าผ่าน QR Code
- ติดตามยอดบริจาครวม
- แสดงประวัติการบริจาคของผู้ใช้งาน

---

### Merchandise & E-Commerce System
- ระบบขายสินค้าที่ระลึกของสมาคม
- ตะกร้าสินค้า (Cart) และการสั่งซื้อ
- ระบบ Checkout พร้อม PromptPay QR Code
- ระบบติดตามสถานะคำสั่งซื้อ
  
---

### Authentication
- OTP-based password reset
- Secure session / authentication flow

---

## 🛠️ Tech Stack

- **Frontend:** React.js, Bootstrap 5
- **Backend:** Node.js (Express.js)
- **Database:** MySQL (phpMyAdmin)
- **Payment:** PromptPay QR Integration
- **Auth:** Session / OTP Authentication

---

## Architecture

Frontend (React)
   ↓
REST API (Node.js / Express)
   ↓
MySQL Database

---

## 📌 Highlights

- ออกแบบและพัฒนาระบบ Full-stack ตั้งแต่เริ่มต้น
- พัฒนาระบบแจ้งเตือนโดยใช้การดึงข้อมูลผ่าน API แบบ polling เพื่ออัปเดตกิจกรรมของผู้ใช้งาน
- พัฒนาระบบ Webboard สำหรับการโพสต์ คอมเมนต์ และการมีส่วนร่วมของผู้ใช้งาน
- ผสานระบบบริจาคและระบบอีคอมเมิร์ซไว้ภายในแพลตฟอร์มเดียว
- ออกแบบระบบควบคุมสิทธิ์การเข้าถึงแบบ Role-based สำหรับผู้ใช้งานหลายประเภท
- พัฒนาระบบชำระเงินด้วย QR Code และติดตามสถานะคำสั่งซื้อ

