var createError = require('http-errors');
var express = require('express');
const http = require("http");
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var QRcode = require('qrcode');
var generatePayload = require('promptpay-qr');
var bodyParser = require('body-parser');
var cors = require('cors');
var passport = require('passport');
var session = require('express-session');

// const { Server } = require("socket.io");
// const initializeSocket = require("./webSocket"); // นำเข้า WebSocket

require('dotenv').config();

const app = express(); 
// const server = http.createServer(app); //ใช้ HTTP Server
// // const io = initializeSocket(server); //เรียกใช้ WebSocket
// const io = new Server(server, {
//   cors: {
//     origin: "http://localhost:3002", // React frontend
//     methods: ["GET", "POST"],
//   },
// });

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
// app.set("io", io); // บันทึก io instance ใน app

// Middleware
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(cors({
  origin:"http://localhost:3002", // URL ของ Frontend
  credentials: true, // อนุญาตการส่ง cookies
}));

// // เก็บข้อมูล user ที่ออนไลน์
// const onlineUsers = new Map();

// io.on("connection", (socket) => {
//   console.log(`User Connected: ${socket.id}`);

//   // รับ userId และจับคู่กับ socket.id
//   socket.on("registerUser", (userId) => {
//     socket.userId = userId; // ผูก userId กับ socket
//     onlineUsers.set(userId, socket.id);
//     ;
//     console.log(`User ${userId} registered with socket ID: ${socket.id}`);
//   });

//   socket.on("disconnect", (reason) => {
//     console.log(`User Disconnected: ${socket.id} (Reason: ${reason})`);
//     onlineUsers.forEach((value, key) => {
//       if (value === socket.id) {
//         onlineUsers.delete(key);
//       }
//     });
//   });
// });

app.use('/img', express.static('img'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: { 
    secure: false,
    httpOnly: true,
    // หากใช้ HTTPS ให้เปลี่ยนเป็น true
  }
}));


app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

// route
var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');
var aboutRouter = require('./routes/about');
var registerRouter = require('./routes/register');
var webboardRouter = require('./routes/webboard');
var DonateRoute = require('./routes/donate');
var SouvenirRoute = require('./routes/souvenir');
var AdminRoute =  require('./routes/admin-create');
var notificationRoute =  require('./routes/notification');
var categoryRoute =  require('./routes/category');
var searchRoute =  require('./routes/search');
var AdminAllRoute= require('./routes/admin');
var alumniRoute= require('./routes/alumni');

app.use('/api', indexRouter);
app.use('/users', usersRouter);
app.use('/add', registerRouter);
app.use('/show', aboutRouter);
app.use('/donate', DonateRoute);
app.use('/souvenir',SouvenirRoute );
app.use('/web', webboardRouter);
app.use('/notice', notificationRoute);
app.use('/category', categoryRoute);
app.use('/search', searchRoute);
app.use('/alumni', alumniRoute);

//for admin
app.use('/news', AdminRoute);
app.use('/activity', AdminRoute);
app.use('/admin', AdminAllRoute);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

app.listen(3001, () => {
  console.log(`Server running on port 3001`);
});


module.exports = app;

