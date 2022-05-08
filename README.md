# tier-node-demo

A demo of using tier to make a pricing page.

## Running this demo locally

Create an account on [tier](https://tier-run.herokuapp.com), and
[mint a
token](https://tier-run.herokuapp.com/app/account/tokens).

Then create a `.env` file containing:

```sh
TIER_KEY="token minted in previous step"
```

Push the pricing model by running:

```sh
npm run devtierpush
```

Then run `npm run dev` to start the server.

## Running against a different tierd/tierweb

Spin up the tierd and tierweb, create account, mint token.

The `.env` file should look like this:

```sh
# Configs for running against local tierd/tierweb
NODE_ENV=development
TIER_WEB_URL=http://localhost:3000
TIER_API_URL=http://127.0.0.1:8888
PORT=8300
TIER_KEY="key you minted on local dev tierweb"
```

Then run `npm run devtierpush ; npm run dev`.

## Running Prod Style

Put all those things in the actual environment, and run `npm
start`.

## Notes for Demoers and Demoees

The initial commit is "the app, without any Tier".  It's
basically a stub, many things have intentionally not been
implemented.

The `tier-integration` branch is a step-by-step integration of
Tier into the app.  You can walk through it bit by bit, or view
the final merge commit to see it all together at once.

Most of the tier-related parts are in the top portion of
`lib/routes.js`, and the templates in `lib/templates/*.ejs` for
the various pricing/plan related pages.
