# Deployment

## Target

Production should run as one always-on Render Web Service:

- Service: `qst-shopify-dashboard`
- Runtime: Node 20
- Build: `npm ci --include=dev && npm run build`
- Start: `npm start`
- Liveness: `GET /healthz`
- Readiness: `GET /readyz`
- Database: Render Postgres in the same region, attached through `DATABASE_URL`

`render.yaml` sets the web service to `plan: starter` and Postgres to `basic-256mb`. Render's Blueprint reference lists `starter` as a supported web-service instance type and `basic-256mb` as the default Postgres plan shape.

## Required environment variables

- `NODE_ENV=production`
- `VITE_QST_DEMO_MODE=false`
- `VITE_SHOPIFY_API_KEY`
- `SHOPIFY_API_SECRET`
- `SHOPIFY_SCOPES=read_products`
- `QST_TOKEN_ENCRYPTION_KEY`
- `QST_SHOPIFY_APP_HANDLE`
- `VITE_QST_SHOPIFY_APP_HANDLE`
- `QST_PLAN_NAME`
- `QST_SUBSCRIPTION_STATUS`
- `QST_DESKTOP_VERSION`
- `QST_DESKTOP_DOWNLOAD_URL`
- `QST_PAIRING_TTL_MINUTES`
- `DATABASE_URL`

Optional for QST Desktop eBay OAuth only:

- `EBAY_ENVIRONMENT=sandbox` or `production`
- `EBAY_CLIENT_ID`
- `EBAY_CLIENT_SECRET`
- `EBAY_REDIRECT_URI`
- `EBAY_SCOPES`

Do not commit actual values. Add them in Render Dashboard or through `sync: false` Blueprint prompts.

## Local checks

```powershell
npm.cmd test
npm.cmd run build
node --check server\index.js
```

Production-like smoke:

```powershell
$env:NODE_ENV='production'
$env:PORT='5184'
$env:VITE_SHOPIFY_API_KEY='test_api_key'
$env:SHOPIFY_API_SECRET='test_secret'
$env:QST_TOKEN_ENCRYPTION_KEY='local_test_key'
npm.cmd start
```

Then check:

- `http://127.0.0.1:5184/healthz` returns `ok: true`.
- `http://127.0.0.1:5184/readyz` returns `503` locally when no Postgres is configured.

## Manual production steps

1. Sync the Render Blueprint.
2. Confirm the service is on a paid always-on instance.
3. Confirm Postgres is on a non-free plan and in the same region.
4. Add all required secret env vars.
5. Run `npm.cmd run render:health` after deployment.
6. Confirm `/readyz` returns `ok: true`, `storage: postgres`, and `postgresReady: true`.
7. Update Shopify Partner Dashboard App URL and allowed redirect URLs.
8. If testing QST Desktop eBay OAuth, update eBay Developer callback/RuName settings to match `EBAY_REDIRECT_URI`.
9. Open the app inside Shopify Admin and run `docs/manual-acceptance-test.md`.

## Callback URLs

Shopify allowed redirect URLs:

- `https://qst.q-mer.ch/auth/shopify/callback` after custom domain cutover
- `https://qst.q-mer.ch/auth/callback` legacy compatibility route
- temporary Render equivalents during staging

Optional QST Desktop eBay callback:

- Use the value configured as `EBAY_REDIRECT_URI`.
- If eBay requires a RuName instead of a literal URL, use that RuName in the env var and register the real URL in the eBay Developer portal.
