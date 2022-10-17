// super hacky "sdk", turn this into a better thing

// FIXME: terrible hack, use a proper sidecar we talk to over stdio/socket
const { spawn } = require('child_process')

const tier = module.exports = {}

const run = (...args) => {
  const c = spawn('tier', args)
  const out = []
  const err = []
  c.stdout.on('data', chunk => out.push(chunk))
  c.stderr.on('data', chunk => err.push(chunk))
  return new Promise((res, rej) => {
    c.on('error', rej)
    c.on('close', (code, signal) => {
      const stdout = Buffer.concat(out).toString()
      const stderr = Buffer.concat(err).toString()
      const result = { args, stdout, stderr, code, signal }
      if (code || signal) {
        const m = `command failed: tier ${
          args.map(a => JSON.stringify(a)).join(' ')
        }`
        rej(Object.assign(new Error(m), result))
      }
      res(result)
    })
  })
}

const parseTable = s => {
  const [headings, ...lines] = s.trim().split(/\n/).map(l => l.trim().split(/\s+/))
  return lines.reduce((o, l) => o.concat(Object.fromEntries(headings.map((h, i) => [h.toLowerCase(), l[i]]))), [])
}

tier.pull = async () => {
  const result = await run('pull')
  return JSON.parse(result.stdout)
}

// get the latest version of each plan
tier.pullPricingPage = async () => {
  const model = await tier.pull()
  const plans = []
  const latest = Object.create(null)
  for (const id of Object.keys(model.plans)) {
    const [name, version] = id.split('@')
    if (!latest[name] || version.localeCompare(latest[name], 'en')) {
      latest[name] = version
    }
  }
  for (const [name, version] of Object.entries(latest)) {
    const id = `${name}@${version}`
    const plan = model.plans[id]
    plan.id = id
    plans.push(plan)
  }
  return { plans }
}

tier.subscribe = async (org, plan) => {
  await run('subscribe', org, plan)
}

tier.limits = async (org) => {
  const { stdout } = await run('limits', org)
  return parseTable(stdout).reduce((o, l) => ({
    ...o,
    [l.feature]: isNaN(l.limit) ? Infinity : parseInt(l.limit, 10),
  }), {})
}

tier.ls = async () => parseTable((await run('ls')).stdout)
  .map(o => ({...o, base: parseInt(o.base, 10) }))

tier.whois = async (org) => (await run('whois', org)).stdout.trim()

tier.phases = async (org) => parseTable((await run('phases', org)).stdout.trim())
  .map(o => ({ ...o, index: parseInt(o.index, 10) }))

tier.report = async (org, feature, n) => {
  await run('report', org, feature, String(n) || '1')
}
