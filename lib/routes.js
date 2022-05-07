const express = require('express')
const routes = module.exports = express.Router()
const {
  addUserToDatabase,
  validateSignin,
  mustLogin,
  setSecureLoginCookies,
  isAuthenticated,
  validateNewUser,
} = require('./users.js')

const {
  defaultTemplateData,
  showPage,
} = require('./templates.js')

// load the tier client with the TIER_* values in the env.
const {TierClient} = require('@tier.run/sdk')
const tier = TierClient.fromEnv()

// put this script in every page somewhere.
const tierJS = JSON.stringify(tier.tierJSUrl())
const tierClientScript = `<script src=${tierJS}></script>`

defaultTemplateData.tierClientScript = tierClientScript
defaultTemplateData.title = 'Tier.run Node.js Demo'

const signupNewUser = async (user) => {
  // new user, call append phase to put them on our default "free" plan
  //
  // Note: this is strictly optional!  You could also just
  // not have them on a plan (though it means that any
  // entitlement checks will be rejected, and there will
  // not be a "customer" to attach payment info to).
  // Or, you could take them to a pricing page as part of the
  // initial sign-up flow.  It really is up to you how you want
  // your app to handle it.
  const pricingPage = await tier.pullPricingPage()
  const plan = pricingPage.plans[0].id
  await tier.appendPhase(`org:${user.id}`, plan)

  await addUserToDatabase(user)
  await setSecureLoginCookies(res, user)
}

const loginUser = async (res, user) => {
  if (!validateSignin(user)) {
    return null
  }

  await setSecureLoginCookies(res, user)
  return user
}

const userIsAuthorized = async (user, feature) => {
  // initial proof of concept of app, just allow everyone
  if (!user || !feature) {
    throw new Error('invalid authZ check')
  }
  return true
}

routes.get('/', (req, res) => {
  res.redirect(isAuthenticated(req) ? '/app' : '/login')
})

routes.get('/logout', (_, res) => {
  res.cookie('user', '', { maxAge: 0, httpOnly: true })
  res.cookie('plan', '', { maxAge: 0, httpOnly: true })
  res.redirect('/login')
})

routes.get('/signup', (_, res) => {
  return showPage(req, res, 'signup.ejs', {
    header: 'sign up',
    errors: {},
    user: '',
    pass: '',
  })
})

routes.post('/signup', (req, res) => {
  const {user, pass} = req.body
  const validate = validateNewUser(user, pass)
  if (validate.errors) {
    showPage(req, res, 'signup.ejs', {
      header: 'sign up',
      errors: validate.errors,
      user,
      pass,
    })
  } else {
    signupNewUser(req, res)
    res.redirect(303, '/app')
  }
})

routes.get('/login', (req, res) => {
  return showPage(req, res, 'login.ejs', { header: 'please log in' })
})

routes.post('/login', async (req, res) => {
  const {user, pass} = req.body
  const requestUser = { id: user, pass }
  const userLogin = await loginUser(res, requestUser)
  if (!userLogin) {
    return showPage(req, res, 'login.ejs', {
      header: 'please log in',
      error: 'incorrect',
    })
  }
  return res.redirect('/app')
})

routes.get('/app', mustLogin, (req, res) => {
  showPage(req, res, 'app.ejs', { header: 'temp converter', req })
})

const fToC = (F) => (F - 32) * (5/9)
const cToF = (C) => C * (9/5) + 32

routes.post('/convert', mustLogin, async (req, res) => {
  const { C, F } = req.body
  const user = req.cookies.user

  if (!await userIsAuthorized(user, 'feature:convert')) {
    res.status(402).send({ error: 'not allowed by plan' })
  }

  if (C === undefined && F === undefined) {
    res.statusCode = 400
    res.send({ error: 'bad request, temp required' })
    return
  }
  if (C !== undefined) {
    return res.send({ F: cToF(C) })
  } else {
    return res.send({ C: fToC(F) })
  }
})

routes.use('/ping', (req, res) => {
  console.error(req.method, req.url, req.headers)
  res.send('pong')
})
