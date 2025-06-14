
const LoggedIn = (req, res, next) => {
  // console.log(" Session in LoggedIn middleware:", req.session);
  if (!req.session || !req.session.user) {
    console.log("Session user not found:", req.session);
    return res.status(401).json({ success: false, message: "กรุณาเข้าสู่ระบบ" });
  }
  console.log("User logged in:", req.session.user);
  next();
};

//เช็คว่าเป็นผู้ใช้ที่ใช้งานอยู่หรือไม่
function checkActiveUser(req, res, next) {
  if (!req.session.user || req.session.user.is_active === 0) {
    return res.status(403).json({ message: "บัญชีของคุณถูกระงับการใช้งาน" });
  }
  next();
}


function checkRole (req, res, next) {
    const {id} = req.params; // ID ที่รับมาจาก URL
    console.log("ID from URL:", id);
    if (!req.session.user) {
        return res.status(401).json({ success: false, message: 'กรุณาเข้าสู่ระบบ' });
    }
    console.log("ID from session:", req.session.user.id);

     // ตรวจสอบว่า ID ที่ร้องขอตรงกับ ID ของผู้ใช้ใน Session หรือไม่
  if (parseInt(id, 10) !== req.session.user.id) {
    return res.status(403).json({ success: false, message: 'ไม่อนุญาต' });
  }

  next();
}



module.exports = { LoggedIn,checkRole,checkActiveUser };