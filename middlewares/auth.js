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


module.exports = { LoggedIn,checkActiveUser };