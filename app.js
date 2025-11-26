var createError = require('http-errors');
var express = require('express');
const http = require("http");
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
const db = require('./db');
var QRcode = require('qrcode');
var generatePayload = require('promptpay-qr');
var bodyParser = require('body-parser');
const cors = require('cors');
var passport = require('passport');
const session = require('express-session');
// const schedule = require('./routes/schedule');

require('./routes/schedule');
require('dotenv').config();

const app = express(); 

// View engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Middleware
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use(cors({
    origin: [
        'http://localhost:3002',
        'http://10.198.200.71',
        'https://collegeofcomputing-alumni.netlify.app' // เปลี่ยนเป็น URL ของ frontend
      ], 
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true, 
}));

app.set('trust proxy', 1);


app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'secret_key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,      // local => false; production + HTTPS => true
    httpOnly: true,
    sameSite: 'lax',   // เพื่อให้ cookie ข้ามพอร์ต/โดเมน (dev)
    maxAge: 1000 * 60 * 60,
  }
}));


app.use('/img', express.static(path.join(__dirname, 'img')));
app.use('/images', express.static(path.join(__dirname, 'img')));
app.use('/api/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// app.use(passport.initialize());
// app.use(passport.session());

// passport.serializeUser((user, done) => done(null, user));
// passport.deserializeUser((obj, done) => done(null, obj));

// route
var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');
var registerRouter = require('./routes/register');
var webboardRouter = require('./routes/webboard');
var DonateRoute = require('./routes/donate');
var SouvenirRoute = require('./routes/souvenir');
var NewsRoute =  require('./routes/news');
var notificationRoute =  require('./routes/notification');
var categoryRoute =  require('./routes/category');
var searchRoute =  require('./routes/search');
var AdminAllRoute= require('./routes/admin');
var alumniRoute= require('./routes/alumni');
var activityRoute = require('./routes/activity'); 
var ordersRoute = require('./routes/orders');
// var sellerRouter = require('./routes/seller');
// var LoginRouter = require('./routes/login');

app.use('/api', indexRouter);
app.use('/users', usersRouter);
app.use('/add', registerRouter);
app.use('/donate', DonateRoute);
// app.use('/admin', AdminRoute);
app.use('/souvenir',SouvenirRoute);
app.use('/web', webboardRouter);
app.use('/notice', notificationRoute);
app.use('/category', categoryRoute);
app.use('/search', searchRoute);
app.use('/alumni', alumniRoute);
app.use('/activity', activityRoute); 
app.use('/news', NewsRoute);
app.use('/orders', ordersRoute);

//for admin
app.use('/admin', AdminAllRoute);

// 404 error handler
app.use(function (req, res, next) {
  next(createError(404));
});

// Error handler
app.use(function (err, req, res, next) {
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  res.status(err.status || 500);
  res.render('error');
});

app.listen(3001, () => {
  console.log(`Server running on port 3001`);
});


module.exports = app;