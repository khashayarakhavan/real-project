const crypto = require('crypto');
const passport = require('passport');
const { promisify } = require('util');
const jwt = require('jsonwebtoken');
const User = require('./../models/userModel');
const catchAsync = require('./../utils/catchAsync');
const AppError = require('./../utils/appError');
const Email = require('./../utils/email');

const { log } = console;

const signToken = id => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN
  });
};

const createSendToken = (user, statusCode, req, res, next) => {
  const token = signToken(user._id);
  const cookieOptions = {
    // here we create the JWT cookie.
    expires: new Date(
      Date.now() + process.env.JWT_COOKIE_EXPIRES_IN * 1000 // expires after 24Hours from now.
    ),
    httpOnly: true, // Important Security: prevents any alternation and change/destroy/delete of cookie in the browser from hackers.
    secure: req.secure || req.headers['x-forwarded-proto'] === 'https'
  };

  /* Note on the following line:
  if our request comes from secure protocol or it is forwarded from Heroku internal proxy
  then add cookie secure option to the options object so that cookies can only be sent through a secure protocol.
  */
  // if (req.secure || req.headers['x-forwarded-proto'] === 'https') cookieOptions.secure = true;

  res.cookie('jwt', token, cookieOptions); // sending cookie with token and its options to the browser.

  // Remove password from output
  // user.password = undefined;

  // res.status(statusCode).json({
  //   status: 'success',
  //   token,
  //   data: {
  //     user
  //   }
  // });
};

exports.signup = catchAsync(async (req, res, next) => {
  console.log('Here is the Sign Up function', req.body.name.split(' ')[0]);

  const newUser = await User.create({
    name: req.body.name,
    email: req.body.email,
    password: req.body.password,
    passwordConfirm: req.body.passwordConfirm
  });

  const url = `${req.protocol}://${req.get('host')}/me`;
  log(url);
  await new Email(newUser, url).sendWelcome();

  createSendToken(newUser, 201, req, res);
});

exports.signupGoogle = catchAsync(async (req, res, next) => {
  log('The User is: ', req.user);
  const userToCookie = req.user;
  try {
    createSendToken(userToCookie, 201, req, res);
    res.redirect('/me');
    // existingUser = await User.findOne({ email: req.user._json.email });
    // log('hey bro, welcome back! We are in existing User authController.js');
    // log('Existing User is: ', r);

    // if (existingUser) {
    // we have record.
    // log('The existing USER has been previously added to the req using passport', req.user);
    // }
    // log('Welcome to Sign Up Google/try/else in authController.js :D ');
    // log('The PROFILE inside request is: ', req.profile);
    // const newUser = await User.create({
    //   name: req.user._json.name,
    //   email: req.user._json.email,
    //   photoWeb: req.user._json.picture,
    //   googleID: req.user._json.sub
    // });
    // const url = `${req.protocol}://${req.get('host')}/me`;
    // console.log(url);
    // await new Email(newUser, url).sendWelcome()
  } catch (err) {
    log('Error from SignUp Google in authController.js', err);
    res.redirect('/login');
  }
});

exports.login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  // 1) Check if email and password exist
  if (!email || !password) {
    return next(new AppError('Please provide email and password!', 400));
  }
  // 2) Check if user exists && password is correct
  const user = await User.findOne({ email }).select('+password');

  if (!user || !(await user.correctPassword(password, user.password))) {
    return next(new AppError('Incorrect email or password', 401));
  }

  // 3) If everything ok, send token to client
  createSendToken(user, 200, req, res);
});

exports.logout = (req, res) => {
  log('The Session is : ', req.session);
  req.logout();
  // req.session.destroy(err => {
  //   res.clearCookie('jwt');
  //   // Don't redirect, just print text
  //   res.send('Logged out');
  // });
  
  // log('The list of all cookies', document.cookie);
  // req.logout();

  // req.session.destroy(function(err) {
  //   if (!err) {
  //     res
  //       .status(200)
  //       .clearCookie('jwt', { path: '/' })
  //       .json({ status: 'success' });
  //   } else {
  //     // handle error case...
  //   }
  // });

  // creating a new JWT cookie to overwrite the current user's cookie, thus logging him out with empty token.
  res.cookie('jwt', 'loggedout', {
    // Use exactly same name to overwrite, but without token.
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true
  });
  
  res.status(200).json({ status: 'success' }); // successfull log-out process with success message.
};

// Protecting routes using JWT.
exports.protect = catchAsync(async (req, res, next) => {
  // 1) Getting token and check of it's there
  let token;
  if (
    //check logged-in API request using header
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies.jwt) {
    //check  // if there is a Token then check the next stepslogged-in Client request using cookies
    token = req.cookies.jwt;
  }

  if (!token) {
    return next(
      new AppError('You are not logged in! Please log in to get access.', 401)
    );
  }

  // 2) Verification token
  const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);

  // 3) Check if user still exists
  const currentUser = await User.findById(decoded.id);
  if (!currentUser) {
    return next(
      new AppError(
        'The user belonging to this token does no longer exist.',
        401
      )
    );
  }

  // 4) Check if user changed password after the token was issued
  if (currentUser.changedPasswordAfter(decoded.iat)) {
    return next(
      new AppError('User recently changed password! Please log in again.', 401)
    );
  }

  // GRANT ACCESS TO PROTECTED ROUTE
  req.user = currentUser;
  res.locals.user = currentUser;
  next();
});

// Only for rendered pages, no errors!
exports.isLoggedIn = async (req, res, next) => {
  if (req.cookies.jwt) {
    // if there is a Token then check the next steps
    try {
      // 1) verify token
      const decoded = await promisify(jwt.verify)(
        // Important Security: check if token is authentic and not modified or injected
        req.cookies.jwt,
        process.env.JWT_SECRET
      );

      // 2) Check if user still exists
      const currentUser = await User.findById(decoded.id); // find user by its decoded id from its cookie data.
      if (!currentUser) {
        return next(); // go next if user does not exist.
      }

      // 3) Check if user changed password after the token was issued
      if (currentUser.changedPasswordAfter(decoded.iat)) {
        return next(); // go next if password is not the same.
      }

      // If everything is alright, so, THERE IS A LOGGED IN Authenticated USER
      res.locals.user = currentUser; // add 'user' variable in res.locals where any next middleware or PUG template will have access to it.
      return next();
    } catch (err) {
      // if there is any error.
      return next(); // go next
    }
  }
  next(); // if JWT cookie does not exist in the user's request , go next.
};

exports.restrictTo = (...roles) => {
  return (req, res, next) => {
    // roles ['admin', 'lead-guide']. role='user'
    if (!roles.includes(req.user.role)) {
      return next(
        new AppError('You do not have permission to perform this action', 403)
      );
    }

    next();
  };
};

exports.forgotPassword = catchAsync(async (req, res, next) => {
  // 1) Get user based on POSTed email
  const user = await User.findOne({ email: req.body.email });
  if (!user) {
    return next(new AppError('There is no user with email address.', 404));
  }

  // 2) Generate the random reset token
  const resetToken = user.createPasswordResetToken();
  await user.save({ validateBeforeSave: false });

  // 3) Send it to user's email
  try {
    const resetURL = `${req.protocol}://${req.get(
      'host'
    )}/api/v1/users/resetPassword/${resetToken}`;
    await new Email(user, resetURL).sendPasswordReset();

    res.status(200).json({
      status: 'success',
      message: 'Token sent to email!'
    });
  } catch (err) {
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save({ validateBeforeSave: false });

    return next(
      new AppError('There was an error sending the email. Try again later!'),
      500
    );
  }
});

exports.resetPassword = catchAsync(async (req, res, next) => {
  // 1) Get user based on the token
  const hashedToken = crypto
    .createHash('sha256')
    .update(req.params.token)
    .digest('hex');

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() }
  });

  // 2) If token has not expired, and there is user, set the new password
  if (!user) {
    return next(new AppError('Token is invalid or has expired', 400));
  }
  user.password = req.body.password;
  user.passwordConfirm = req.body.passwordConfirm;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save();

  // 3) Update changedPasswordAt property for the user
  // 4) Log the user in, send JWT
  createSendToken(user, 200, req, res);
});

exports.updatePassword = catchAsync(async (req, res, next) => {
  // 1) Get user from collection
  const user = await User.findById(req.user.id).select('+password');

  // 2) Check if POSTed current password is correct
  if (!(await user.correctPassword(req.body.passwordCurrent, user.password))) {
    return next(new AppError('Your current password is wrong.', 401));
  }

  // 3) If so, update password
  user.password = req.body.password;
  user.passwordConfirm = req.body.passwordConfirm;
  await user.save();
  // User.findByIdAndUpdate will NOT work as intended!

  // 4) Log user in, send JWT
  createSendToken(user, 200, req, res);
});

// exports.oauthGoogle = catchAsync(async (req, res, next) => {
//   log('This is request: ', req);
//   try {
//     passport.authenticate('google', {
//       scope: ['profile', 'email']
//     });
//   } catch (err) {
//     log('Hello from after passport :D');
//     log(err);
//   }
// });

// exports.oauthGoogleCallback = catchAsync(async (req, res, next) => {
//   log('This is callBack req: ', req);
//   try {
//     passport.authenticate('google');
//   } catch (err) {
//     log('Hello from callback after passport :D');
//     log(err);
//   }
// });
