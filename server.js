const express = require('express')
const { resolve } = require('path')
const app = express()
const port = +process.env.PORT || 80
const cookieParser = require('cookie-parser')
const bodyParser = require('body-parser')

app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.urlencoded({ extended: false }))
app.use(express.json())
app.use(cookieParser())

app.use(require('./lib/routes.js'))

app.use(express.static(resolve(__dirname, 'lib/static')))
app.set('view engine', 'ejs')
app.set('views', resolve(__dirname, 'lib/templates'))

app.get('/ping', (_, res) => res.end('pong'))

app.listen(port, '0.0.0.0', () => {
  console.log(`listening on http://localhost:${port}`)
})
