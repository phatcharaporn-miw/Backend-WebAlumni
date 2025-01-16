var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');

var app = express();

var bodyParser = require('body-parser');
var cors = require('cors');
var passport = require('passport');
var GoogleStrategy = require('passport-google-oauth20').Strategy;
var session = require('express-session');
require('dotenv').config();



// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');


// Middleware
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(cors({
  origin: 'http://localhost:3003', // URL ของ Frontend
  credentials: true, // อนุญาตการส่ง cookies
}));
// app.use(cors());
app.use('/img', express.static('img'));

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

// console.log('SESSION_SECRET:', process.env.SESSION_SECRET);


// ตั้งค่าช่องทางการเชื่อมต่อ OAuth 2.0
// passport.use(new GoogleStrategy({
//   clientID: process.env.GOOGLE_CLIENT_ID,
//   clientSecret: process.env.GOOGLE_CLIENT_SECRET,
//   callbackURL: "http://localhost:3001/auth/google/callback"
// }, function(token, tokenSecret, profile, done) {
//   if (!profile) {
//     return done(new Error('Profile not found'));
//   }
//   return done(null, profile);
// }));

app.use(passport.initialize());
app.use(passport.session());


passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');
var aboutRouter = require('./routes/about');
var registerRouter = require('./routes/register');
// var alumniRouter = require('./routes/alumni');

app.use('/api', indexRouter);
app.use('/users', usersRouter);
app.use('/add', registerRouter);
app.use('/show', aboutRouter);
// app.use('/user', alumniRouter);

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

