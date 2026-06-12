# QST Shopify Dashboard

This is the embedded Shopify Admin surface for QST. It is intentionally useful without the Windows desktop app:

- loads Shopify products through Shopify App Bridge direct Admin GraphQL access
- uses read-only `read_products` scope
- lets merchants search, filter, select, review, and edit listing drafts in memory
- prepares eBay-ready batch files with draft copy, prices, SKUs, image URLs, variants, readiness notes, and category search hints
- includes an eBay setup tracker for seller account, policies, dispatch location, and fallback category readiness
- exports an eBay publish-plan JSON file that previews the inventory item, offer, and publish sequence without calling eBay
- exports a QST workspace pack with listing text, marketplace draft data, promo-page HTML, variant rows, and an image URL manifest
- lets merchants choose export-only primary/included images for listing packs without editing Shopify media
- saves local draft and export-image choices in the merchant's browser so work survives refreshes without writing back to Shopify
- tracks browser-local marketplace work status per product so merchants can see what is drafted, ready, or exported
- generates copy-ready marketplace listing packs and CSV exports from the browser
- shows Shopify subscription status, desktop entitlement, and a pairing code flow
- positions the Windows QST app as an optional advanced companion, not a requirement

The app also includes a small Node/Express backend for Shopify compliance webhooks, account status, installer entitlement, and desktop pairing.

## Local Demo

```powershell
cd shopify-dashboard
npm install
npm run dev
```

Open `http://127.0.0.1:5173`. Outside Shopify Admin the app uses demo products when `VITE_QST_DEMO_MODE=true`.

## Shopify App Setup

1. Copy `.env.example` to `.env`.
2. Set `VITE_SHOPIFY_API_KEY` to the app client ID from the Shopify Partner Dashboard.
3. Set `SHOPIFY_API_SECRET` to the app client secret before production deployment.
4. Update `shopify.app.toml` or `shopify.app.qst-listing-workspace.toml` with the same `client_id` and your hosted HTTPS `application_url`.
5. Keep the app embedded and keep direct Admin API access enabled:

```toml
[access_scopes]
scopes = "read_products"

[access.admin]
embedded_app_direct_api_access = true
direct_api_mode = "online"
```

6. Keep the required webhook subscription block in the app config:

```toml
[webhooks]
api_version = "2026-04"

[[webhooks.subscriptions]]
topics = ["app/uninstalled"]
compliance_topics = ["customers/redact", "customers/data_request", "shop/redact"]
uri = "/webhooks"
```

7. Run through Shopify CLI:

```powershell
shopify app dev --config qst-listing-workspace
```

The dev server now runs through Express and mounts Vite internally, so Shopify CLI still uses port `5173`.

## Subscription And Desktop Flow

Use Shopify App Pricing/managed pricing in the Partner Dashboard for public subscription plans. The embedded app links merchants to Shopify's hosted plan selection page:

```text
https://admin.shopify.com/store/:store_handle/charges/:app_handle/pricing_plans
```

Set `QST_SHOPIFY_APP_HANDLE` and `VITE_QST_SHOPIFY_APP_HANDLE` to the embedded app handle used in Shopify Admin, for example `qst-listing-workspace` from `/apps/qst-listing-workspace`.
For local development only, `QST_DEV_STORE_HANDLE` can point the pricing button at your dev store when Shopify's embedded URL does not expose a shop handle. The production app resolves the merchant's actual shop from Shopify context instead.

After the merchant has an active plan, the dashboard can show the Windows installer and generate a short desktop pairing code. The Shopify dashboard remains usable without the desktop app; the Windows companion is additive for larger local workflows and advanced eBay publishing automation using the same Shopify product workspace. Configure the installer link with:

```env
QST_DESKTOP_DOWNLOAD_URL=https://your-hosted-installer-url
QST_DESKTOP_VERSION=1.0.0
```

Pairing codes and marketplace setup state use in-memory storage until Postgres is connected. Use a database before production so pairing codes, desktop tokens, and saved marketplace setup state survive restarts and can be revoked or updated reliably.

## Build

```powershell
npm run build
```

The static output is written to `dist/`. In production, run the backend with `NODE_ENV=production` so it serves `dist/` and the API/webhook routes from the same origin.

## Render Deployment

This app includes a Render Blueprint in `render.yaml`. Push this `shopify-dashboard` folder as the root of a GitHub, GitLab, or Bitbucket repository, then open the Blueprint in Render.

Recommended Render settings:

- Web service: `qst-shopify-dashboard`
- Runtime: Node
- Region: Frankfurt
- Build command: `npm ci --include=dev && npm run build`
- Start command: `npm start`
- Health check path: `/api/health`
- Database: PostgreSQL in Frankfurt, linked through `DATABASE_URL`

Render will ask for these secret or deployment-specific values:

```env
VITE_SHOPIFY_API_KEY=f0517dd50928e4546916d0c07b379e87
SHOPIFY_API_SECRET=your_current_or_rotated_shopify_client_secret
QST_DESKTOP_VERSION=1.0.0
QST_DESKTOP_DOWNLOAD_URL=https://your-hosted-qst-installer-url
```

After Render deploys, copy the Render service URL and update the Shopify app config:

```toml
application_url = "https://your-render-service.onrender.com"

[auth]
redirect_urls = [
  "https://your-render-service.onrender.com/auth/callback"
]
```

Then run `shopify app deploy --config qst-listing-workspace` so Shopify uses the production URL.
