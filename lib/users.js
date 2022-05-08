const { day } = require('./time.js')

const addUserToDatabase = async (user) => {
  // technically this counts as an "in-memory document store"
  // it's webscale
  global.USER = user
}

const setSecureLoginCookies = async (res, user) => {
  res.cookie('user', user.id, { maxAge: 14 * day, httpOnly: true })
}

const validateUsername = (u) => {
  return u === 'user'
}

const validatePassword = (p) => {
  return p === 'pass'
}

const isAuthenticated = (req) => {
  return validateUsername(req.cookies.user)
}

const mustLogin = (req, res, next) => {
  if (isAuthenticated(req)) {
    return next()
  }
  res.redirect('/login')
}

const validateSignin = ({id, pass}) => {
  return validateUsername(id) && validatePassword(pass)
}

const validateNewUser = (u, p) => {
  if (!validateUsername(u)) {
    return {
      errors: {
        username: 'Username must be 4 characters, containing ' +
          'the characters "u", "s", "e", and "r", in that order.',
      }
    }
  }
  if (!validatePassword(p)) {
    return {
      errors: {
        password: 'Password too easy to guess. It must be "pass".',
      }
    }
  }
  return {ok: true}
}

module.exports = {
  isAuthenticated,
  addUserToDatabase,
  validateSignin,
  mustLogin,
  setSecureLoginCookies,
  validateNewUser,
}
