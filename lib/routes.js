const express = require('express')
const routes = module.exports = express.Router()
const tier = require('tier').default
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

defaultTemplateData.title = 'Tier.run Node.js Demo'

const pullPricingPage = async () => {
  const latest = await tier.pullLatest()
  // return [{plan},...] but with the id attached to each one.
  // This is experimental and will be improved soon!
  return {
    plans: Object.entries(latest.plans)
      .sort(([a], [b]) => a.localeCompare(b, 'en'))
      .map(([id, plan]) => ({ id, ...plan }))
  }
}


const { year } = require('./time.js')
const signupNewUser = async (res, user) => {
  // new user, call subscribe to put them on our default "free" plan
  //
  // Note: this is strictly optional!  You could also just
  // not have them on a plan (though it means that any
  // entitlement checks will be rejected, and there will
  // not be a "customer" to attach payment info to).
  // Or, you could take them to a pricing page as part of the
  // initial sign-up flow.  It really is up to you how you want
  // your app to handle it.
  const pricingPage = await pullPricingPage()
  const plan = pricingPage.plans[0].id
  await tier.subscribe(`org:${user.id}`, plan)

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

  await setSecureLoginCookies(res, user)
  return user
}

const log = async (req, _, next) => {
  console.error(req.method, req.url)
  next()
}

routes.get('/', log, (req, res) => {
  res.redirect(isAuthenticated(req) ? '/app' : '/login')
})

routes.get('/logout', log, (_, res) => {
  res.cookie('user', '', { maxAge: 0, httpOnly: true })
  res.cookie('plan', '', { maxAge: 0, httpOnly: true })
  res.redirect('/login')
})

routes.get('/signup', log, (req, res) => {
  return showPage(req, res, 'signup.ejs', {
    header: 'sign up',
    errors: {},
    user: '',
    pass: '',
  })
})

routes.post('/signup', log, async (req, res) => {
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
    await signupNewUser(res, { id: user, pass })
    res.redirect(303, '/app')
  }
})

routes.get('/login', log, (req, res) => {
  return showPage(req, res, 'login.ejs', { header: 'please log in' })
})

routes.post('/login', log, async (req, res) => {
  const {user, pass} = req.body
  const requestUser = { id: user, pass }
  const userLogin = await loginUser(res, requestUser)
  if (!userLogin) {
    return showPage(req, res, 'login.ejs', {
      header: 'please log in',
      error: 'incorrect',
    })
  }
  return res.redirect(303, '/app')
})

// This page is where a user might enter their payment details
// Until they do this, we can't actually invoice stripe for them,
// but you may decide to make them do this right up front, or
// let them do a few things before actually requiring a credit card.
routes.get('/payment', log, mustLogin, async (req, res) => {
  const user = req.cookies.user
  const { stripe_id: customerID } = await tier.whois(`org:${user}`)
  // check if the user has a payment method, to show above the form
  // create the setup intent for this page view, and get the clientSecret
  const options = {
    customer: await getStripeCustomer(customerID),
    setupIntent: await createStripeSetupIntent(customerID),
    stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
  }
  showPage(req, res, 'payment.ejs', options)
})

const getStripeCustomer = async (customerID) => {
  const url = new URL('https://api.stripe.com/v1/customers/' + customerID)
  url.searchParams.set('expand[]', 'invoice_settings')
  url.searchParams.append('expand[]', 'invoice_settings.default_payment_method')
  const stripeRes = await fetch(url.href, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${process.env.STRIPE_KEY}`,
    },
  })
  return await stripeRes.json()
}

const createStripeSetupIntent = async (customerID) => {
  const setupIntent = await fetch('https://api.stripe.com/v1/setup_intents', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.STRIPE_KEY}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      customer: customerID,
      'payment_method_types[]': 'card',
    }),
  })
  const seti = await setupIntent.json()
  if (seti.error) {
    throw seti.error
  }
  return seti
}

// redirected here by Stripe
// /attach-payment-method?setup_intent=seti_...&setup_intent_client_secret=seti_..._secret_...&redirect_status=succeeded
routes.get('/attach-payment-method', log, mustLogin, async (req, res) => {
  const parsed = new URLSearchParams(req.url.substring(req.url.indexOf('?')))
  const setup_intent = parsed.get('setup_intent')
  const redirect_status = parsed.get('redirect_status')

  const u = new URL(`https://api.stripe.com/v1/setup_intents/${setup_intent}`)
  const setupIntent = await fetch(u.href, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${process.env.STRIPE_KEY}`,
    },
  })
  const seti = await setupIntent.json()
  if (redirect_status === 'succeeded' && seti.payment_method) {
    // attach to customer
    const { stripe_id: customerID } = await tier.whois(`org:${req.cookies.user}`)
    const url = 'https://api.stripe.com/v1/customers/' + customerID
    const stripeRes = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${process.env.STRIPE_KEY}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        'invoice_settings[default_payment_method]': seti.payment_method,
      }).toString(),
    })
    await stripeRes.json()
    return res.redirect(303, '/payment')
  }

  // some kind of error or thing requiring user action
  // TODO: pass this info to the payment page to resolve
  return res.json([ seti, redirect_status ])
})

routes.get('/app', log, mustLogin, (req, res) => {
  showPage(req, res, 'app.ejs', { header: 'temp converter', req })
})

const fToC = (F) => (F - 32) * (5/9)
const cToF = (C) => C * (9/5) + 32

routes.post('/convert', log, mustLogin, async (req, res) => {
  const { C, F } = req.body
  const user = req.cookies.user

  const usage = await tier.limit(`org:${user}`, 'feature:convert')
  if (usage.limit >= usage.used) {
    return res.status(402).send({ error: 'not allowed by plan', usage })
  }

  if (C === undefined && F === undefined) {
    return res.status(400).send({ error: 'bad request, temp required' })
  }

  if (C !== undefined) {
    return res.send({ F: cToF(C), usage })
  } else {
    return res.send({ C: fToC(F), usage })
  }
})

routes.use('/ping', log, (_, res) => res.send('pong'))

routes.get('/pricing', log, async (req, res) => {
  const pricingPage = await pullPricingPage()
  const { plan } = req.cookies
  showPage(req, res, 'pricing.ejs', {
    header: 'Pricing Plans',
    plans: pricingPage.plans,
    plan,
  })
})

// change a user's plan by calling tier.subscribe
// This phase will dictate what they're allowed to do, and
// how much they're charged when they do it.
routes.post('/plan', log, mustLogin, async (req, res) => {
  const { plan } = req.body
  await tier.subscribe(`org:${user}`, plan)
  res.cookie('plan', plan, { httpOnly: true })
  res.send({ ok: 'updated plan' })
})
