# QST Web Architecture

## Phase 0 findings

- Frontend framework: Vite with vanilla JavaScript. Entry point: `src/main.js`; HTML shell: `index.html`.
- Backend framework: Node 20 with Express 5. Entry point: `server/index.js`.
- Embedded Shopify app: yes. `shopify.app.toml` and `shopify.app.qst-listing-workspace.toml` set `embedded = true`.
- Shopify App Bridge and Polaris: loaded from Shopify CDN in `index.html`. Product reads use App Bridge direct Admin GraphQL through `fetch("shopify:admin/api/graphql.json")`.
- Shopify scopes: `read_products` only.
- Shopify auth routes: legacy `/auth/callback` remains; canonical routes are now `/auth/shopify/install` and `/auth/shopify/callback`.
- Product-query routes: frontend direct Admin GraphQL remains primary; backend now also exposes authenticated `/api/products` and `/api/products/detail` when a server-side Shopify OAuth session exists.
- eBay implementation: desktop publishing code exists in `../QST_RELEASE_SOURCE_729_fixed/ebay_listing.py` and token helpers exist under `../QST_RELEASE_SOURCE_729_fixed/ebay_auth`. Web now exposes eBay OAuth connection routes, status APIs, and desktop-compatible `/ebay/start`, `/ebay/status`, and `/ebay/refresh` routes authenticated by the QST Desktop pairing token.
- Token/storage layer before this work: Postgres support existed for pairing/settings, with memory fallback; no web eBay OAuth tokens were persisted.
- Token/storage layer now: Postgres-backed OAuth states, encrypted Shopify sessions, encrypted eBay connections, listing records, export records, pairing codes, event logs, and marketplace settings. Production readiness fails unless Postgres is available.
- Render services: current dashboard is one Render web service, `qst-shopify-dashboard`, plus Postgres `qst-shopify-dashboard-db-frankfurt`.
- Custom domain: no Q-MER.CH subdomain config is present in this repository. Current app config still uses `https://qst-shopify-dashboard.onrender.com`.
- Desktop source: present in `../QST_RELEASE_SOURCE_729_fixed`. The source, local PyInstaller bundle, and published v1.0 GitHub Release installer include a pairing-code client and dashboard-backed eBay OAuth, so `QST_DESKTOP_PAIRING_ENABLED` can be enabled for the dashboard deployment.
- Billing/pricing: no custom billing server flow. The app links to Shopify App Pricing managed plan selection through Shopify Admin.
- Public website source: Q-MER.CH Shopify theme/source is not present. See `docs/public-page-update.md`.

## Deployment decision

Use the preferred single-service architecture. The existing repository already hosts the embedded dashboard, API routes, Shopify callbacks, eBay callbacks, desktop companion endpoints, and health endpoints in one Express/Vite deployable. Splitting broker/dashboard responsibilities would add cold-start and callback risk.

Canonical route shape:

- `/` embedded QST dashboard
- `/api/*` authenticated QST API routes
- `/auth/shopify/*` Shopify install/callback routes
- `/auth/ebay/*` eBay OAuth routes
- `/desktop/*` desktop companion compatibility routes
- `/healthz` fast liveness route
- `/readyz` durable-storage readiness route

## Data model

Postgres tables created by `server/index.js`:

- `qst_oauth_states`: short-lived one-time OAuth state for Shopify and eBay.
- `qst_shopify_sessions`: per-shop encrypted Shopify Admin API access token and scope metadata.
- `qst_ebay_connections`: per-shop encrypted eBay OAuth tokens, environment, expiry, scopes, and account metadata.
- `qst_pairing_codes`: short-lived desktop pairing codes and hashed desktop tokens.
- `qst_marketplace_settings`: per-shop marketplace setup checks and notes.
- `qst_listing_records`: persisted prepared-listing records with validation errors and source snapshots.
- `qst_export_records`: generated export-pack activity.
- `qst_events`: redacted operational events.

Sensitive token values are encrypted with `QST_TOKEN_ENCRYPTION_KEY` before storage and are never returned by API responses.

## Desktop pairing contract

Backend routes:

- `POST /api/desktop/pairing-code`: embedded app creates a short-lived code for the authenticated Shopify shop.
- `GET /api/desktop/pairing/:code`: desktop checks pending code status.
- `POST /api/desktop/pairing/:code/redeem`: desktop claims the code once and receives a desktop token.

Desktop-side implementation needed in the Windows source:

- Ship the updated Windows build with `Accounts > Pair with Shopify Code...` and the setup wizard's `Pair with Shopify code` button.
- Call `GET /api/desktop/pairing/:code`, then `POST /api/desktop/pairing/:code/redeem`.
- Store the returned desktop token in the existing local token/config store.
- Use the desktop token against `POST /api/desktop/shopify/graphql` for read-only product loading.
- Do not request or store Shopify/eBay OAuth tokens directly in desktop for this pairing flow.
- Keep the existing desktop OAuth/store-domain setup available until the paired build has been QA-tested.
