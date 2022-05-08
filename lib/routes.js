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

  // also optional, store it in a cookie so we don't have to look
  // it up every time.  Very soon, the pricing page will take an
  // org identifier, so we'll stuff that data in the response when
  // it matters.  Other than showing the pricing page, there are
  // really no cases where it should matter to your app what "plan"
  // a user is on.
  res.cookie('plan', plan, { maxAge: 10 * year })

  await addUserToDatabase(user)
  await setSecureLoginCookies(res, user)
}

const loginUser = async (res, user) => {
  if (!validateSignin(user)) {
    return null
  }

  // see comment above about 'plan' being optional, we only use
  // this to show "Current Plan" in the pricing page.
  const plan = await tier.lookupCurrentPlan(`org:${user.id}`)
  res.cookie('plan', plan)
  await setSecureLoginCookies(res, user)
  return user
}

const userIsAuthorized = async (user, feature) => {
  // initial proof of concept of app, just allow everyone
  if (!user || !feature) {
    throw new Error('invalid authZ check')
  }

  // entitlement check to see if the user's current plan
  // allows them to perform this action.  This is the kind
  // of flagging you'll add to every feature that you want
  // to potentially collect money for someday.
  if (await tier.cannot(`org:${user}`, feature)) {
    return false
  } else {
    return true
  }
}

// Show a pricing page based on what we have defined in Tier
routes.get('/pricing', async (req, res) => {
  const pricingPage = await tier.pullPricingPage()
  const { plan } = req.cookies
  showPage(req, res, 'pricing.ejs', {
    header: 'Pricing Plans',
    plans: pricingPage.plans,
    plan,
  })
})

// change a user's plan by calling tier.appendPhase
// This phase will dictate what they're allowed to do, and
// how much they're charged when they do it.
routes.post('/plan', mustLogin, async (req, res) => {
  const {plan} = req.body
  await tier.appendPhase(`org:${username}`, plan)
  res.cookie('plan', plan, { httpOnly: true })
  res.send({ok: 'updated plan'})
})

// This page is where a user might enter their payment details
// Until they do this, we can't actually invoice stripe for them,
// but you may decide to make them do this right up front, or
// let them do a few things before actually requiring a credit card.
routes.get('/payment', mustLogin, async (req, res) => {
  const user = req.cookies.user
  const stripeOptions = await tier.stripeOptions(`org:${user}`)
  showPage(req, res, 'payment.ejs', { stripeOptions })
})

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
