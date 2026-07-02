# QST Shopify Dashboard

This is the embedded Shopify Admin surface for QST. It is intentionally useful without the Windows desktop app:

- loads Shopify products through Shopify App Bridge direct Admin GraphQL access
- uses read-only `read_products` scope
- lets merchants search, filter, select, review, and edit listing drafts in memory
- connects eBay through OAuth when eBay app credentials are configured
- saves prepared listing records per Shopify shop with validation results
- prepares eBay-ready batch files with draft copy, prices, SKUs, image URLs, variants, readiness notes, and category search hints
- includes eBay setup validation for seller policies, dispatch location, and fallback category readiness
- exports an eBay publish-plan JSON file that previews the inventory item, offer, and publish sequence without calling eBay
- exports a QST workspace pack with listing text, marketplace draft data, promo-page HTML, variant rows, and an image URL manifest
- lets merchants choose export-only primary/included images for listing packs without editing Shopify media
- saves local draft and export-image choices in the merchant's browser so work survives refreshes without writing back to Shopify
- tracks browser-local marketplace work status per product so merchants can see what is drafted, ready, or exported
- filters the product queue by local marketplace work status for staged listing workflows
- provides copy-ready listing actions for titles, descriptions, tags, full packs, and single-product downloads
- applies browser-local bulk prep to selected products, including status updates, title prefixes, and tag appends
- generates copy-ready marketplace listing packs and CSV exports from the browser
- shows Shopify subscription status, desktop entitlement, and pairing availability
- positions the Windows QST app as an optional companion for advanced desktop-first workflows, not a requirement

The app also includes a Node/Express backend for Shopify compliance webhooks, Shopify/eBay OAuth callbacks, account status, listing/export records, installer entitlement, and desktop pairing.

For the full launch checklist and remaining setup steps, use [QST_SHOPIFY_LAUNCH_RUNBOOK.md](./QST_SHOPIFY_LAUNCH_RUNBOOK.md).

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
4. Set `QST_TOKEN_ENCRYPTION_KEY` before storing OAuth tokens outside local development.
5. Configure `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, `EBAY_REDIRECT_URI`, and `EBAY_ENVIRONMENT=sandbox` to enable the real eBay OAuth connection flow.
6. Update `shopify.app.toml` or `shopify.app.qst-listing-workspace.toml` with the same `client_id` and your hosted HTTPS `application_url`.
7. Keep the app embedded and keep direct Admin API access enabled:

```toml
[access_scopes]
scopes = "read_products"

[access.admin]
embedded_app_direct_api_access = true
direct_api_mode = "online"
```

8. Keep the required webhook subscription block in the app config:

```toml
[webhooks]
api_version = "2026-04"

[[webhooks.subscriptions]]
topics = ["app/uninstalled"]
compliance_topics = ["customers/redact", "customers/data_request", "shop/redact"]
uri = "/webhooks"
```

9. Run through Shopify CLI:

```powershell
shopify app dev --config qst-listing-workspace
```

The dev server now runs through Express and mounts Vite internally, so Shopify CLI still uses port `5173`. The config keeps `automatically_update_urls_on_dev = false` so temporary Cloudflare dev tunnels do not replace the production Render URL.

## Subscription And Desktop Flow

Use Shopify App Pricing/managed pricing in the Partner Dashboard for public subscription plans. The embedded app links merchants to Shopify's hosted plan selection page:

```text
https://admin.shopify.com/store/:store_handle/charges/:app_handle/pricing_plans
```

Set `QST_SHOPIFY_APP_HANDLE` and `VITE_QST_SHOPIFY_APP_HANDLE` to the embedded app handle used in Shopify Admin, for example `qst-listing-workspace` from `/apps/qst-listing-workspace`.
For local development only, `QST_DEV_STORE_HANDLE` can point the pricing button at your dev store when Shopify's embedded URL does not expose a shop handle. The production app resolves the merchant's actual shop from Shopify context instead.

After the merchant has an active plan, the dashboard can show the Windows installer. Desktop pairing remains behind an explicit release flag until the Windows build includes the matching pairing screen. The Shopify dashboard remains usable without the desktop app; the Windows companion is additive for advanced desktop-first workflows using the same Shopify product workspace. Configure the installer link with:

```env
QST_DESKTOP_DOWNLOAD_URL=https://your-hosted-installer-url
QST_DESKTOP_VERSION=1.0.0
QST_DESKTOP_PAIRING_ENABLED=false
```

Keep `QST_DESKTOP_PAIRING_ENABLED=false` until the released Windows build includes the Shopify workspace pairing screen that redeems `/api/desktop/pairing/:code`.

Production must use Postgres through `DATABASE_URL`. OAuth states, encrypted Shopify/eBay tokens, pairing codes, listing preparation records, export records, and marketplace setup state are stored per Shopify shop. `/readyz` fails in production unless durable storage is available.

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
- Liveness check path: `/healthz`
- Readiness check path: `/readyz`
- Database: PostgreSQL in Frankfurt, linked through `DATABASE_URL`

Render will ask for these secret or deployment-specific values:

```env
VITE_SHOPIFY_API_KEY=f0517dd50928e4546916d0c07b379e87
SHOPIFY_API_SECRET=your_current_or_rotated_shopify_client_secret
QST_TOKEN_ENCRYPTION_KEY=generate_or_set_a_32_byte_random_secret
EBAY_ENVIRONMENT=sandbox
EBAY_CLIENT_ID=your_ebay_client_id
EBAY_CLIENT_SECRET=your_ebay_client_secret
EBAY_REDIRECT_URI=your_ebay_redirect_uri_or_runame
QST_DESKTOP_VERSION=1.0.0
QST_DESKTOP_DOWNLOAD_URL=https://your-hosted-qst-installer-url
QST_DESKTOP_PAIRING_ENABLED=false
```

After Render deploys, copy the Render service URL and update the Shopify app config:

```toml
application_url = "https://your-render-service.onrender.com"

[auth]
redirect_urls = [
  "https://your-render-service.onrender.com/auth/shopify/callback",
  "https://your-render-service.onrender.com/auth/callback"
]
```

Then run `shopify app deploy --config qst-listing-workspace --allow-updates` so Shopify uses the production URL. If Shopify Admin still opens a `trycloudflare.com` URL after deployment, click `Clean dev preview` in the Shopify Admin dev console and reload the app.
