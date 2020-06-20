const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const keys = require('../config/keys');

const { log } = console;

const User = require('../models/userModel');

passport.serializeUser(function(user, done) {
  done(null, user.id);
});

passport.deserializeUser((id, done) => {
  User.findById(id).then(user => {
    done(null, user);
  });
});

passport.use(
  new GoogleStrategy(
    {
      clientID: keys.googleClientID,
      clientSecret: keys.googleClientSecret,
      callbackURL: '/auth/google/callback',
      proxy: true
    },
    async (accessToken, refreshToken, profile, done) => {
      existingUser = await User.findOne({ email: profile._json.email });

      if (existingUser) {
        // we have record.
        log('hey bro, welcome back!');
        done(null, existingUser);
      } else {
        // we don't have record
        const newUser = await User.create({
          thumbnail: profile._json.picture,
          googleID: profile.id,
          name: profile.displayName,
          email: profile._json.email
        });
        log('This is our User :D ... ', newUser);
        done(null, newUser);
      }

      log('access Token:', accessToken);
      log('refresh Token', refreshToken);
      log('profile:', profile);
    }
  )
);
