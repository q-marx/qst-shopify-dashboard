# QST Shopify Launch Runbook

This is the working checklist for getting QST Listing Workspace functioning properly for Shopify review and early customers.

Use this document as the source of truth for the current Shopify dashboard project. The Shopify dashboard can ship without QST Desktop. QST Desktop is optional and the released v1.0 desktop build can redeem the web-generated pairing code.

Current submission gaps are tracked in `docs/shopify-submission-gap-register.md`.

## Current Known State

- Repository: `q-marx/qst-shopify-dashboard`
- Local folder: `C:\Users\Mark\Downloads\QST RELEASE VERSION 1 - Codex\shopify-dashboard`
- Live Render app: `https://qst-shopify-dashboard.onrender.com`
- Shopify embedded app: `https://admin.shopify.com/store/sst-test-site/apps/qst-listing-workspace/`
- Shopify app name: `QST Listing Workspace`
- Shopify app handle: `qst-listing-workspace`
- Client ID in config: `f0517dd50928e4546916d0c07b379e87`
- Required Shopify scope: `read_products`
- Render Blueprint source of truth: `render.yaml` on GitHub `main`
- Current intended Render database: `qst-shopify-dashboard-db-frankfurt`
- Current intended Render database region: Frankfurt
- Current repository target: one paid always-on Render web service plus non-free Render Postgres
- Render Postgres status: fixed and verified durable on 2026-06-12
- Render Postgres status reverified durable on 2026-07-02
- Public installer asset: `https://github.com/q-marx/qst-shopify-dashboard/releases/download/v1.0.0/QST-Setup-v1.0.exe`
- Current submission positioning: marketplace export preparation, not required web eBay OAuth

The direct Render URL is not supposed to show live Shopify products. Live products load inside Shopify Admin because the dashboard uses Shopify App Bridge direct Admin GraphQL access. Direct browser visits can only show an empty or preview state because there is no embedded Shopify session.

## Current Snapshot - 2026-07-02

- Latest pushed dashboard commit: `aeb2b9c Reposition dashboard as export workflow`.
- Live Render health reports durable Postgres with `fallbackActive: false`.
- Shopify OAuth install now redirects to the whitelisted `/auth/callback`.
- Desktop pairing code generation, copy-to-clipboard, and desktop redemption are implemented.
- The dashboard no longer requires eBay OAuth to save prepared records or download exports.
- The web workflow should be described as marketplace export preparation.
- The older public Q-MER.CH sync-tool page still needs copy cleanup before it is used as a Shopify App Store support/marketing destination.
- QST-specific support/privacy/terms/getting-started draft copy is in `docs/public-pages/`.
- App Store media upload slots are planned in `docs/app-store-media-plan.md`.
- Development history is tracked in `docs/development-timeline.md`.

## Return-To-Work Snapshot - 2026-06-24

Use this as the current handoff point after the June break.

Verified locally on 2026-06-24:

- `git status --short` is clean.
- Latest local commit is `f382b41 Prevent Shopify dev tunnel replacing production URL`.
- `npm.cmd run build` passes. PowerShell `npm run build` can be blocked by local execution policy, so use `npm.cmd` if needed.
- Production-server local smoke passed:
  - `/healthz` returns OK in production mode.
  - `/readyz` returns OK only when durable Postgres is configured.
  - `/api/account` reports `QST Listing Workspace`.
  - `/api/desktop/download` returns 404 while the installer URL is intentionally unconfigured.
  - `/listing-grader` returns 404.
- Live Render health passed at `2026-06-24T10:55:45.598Z`:

```json
{
  "storage": "postgres",
  "storageReady": true,
  "postgresReady": true,
  "fallbackActive": false,
  "storagePersistence": "durable"
}
```

Dashboard completion status:

- The dashboard is feature-complete enough for the planned Shopify review flow based on source review, build, live health, and local production endpoint smoke.
- It is not submission-complete until the manual embedded Shopify Admin QA pass, Shopify pricing test, compliance webhook proof, public listing media, and support/legal URLs are complete.
- Do not describe the Windows desktop app as required. The dashboard must remain usable on its own inside Shopify Admin.

Render paid-plan gate:

- `render.yaml` now defines the web service as `plan: starter` and Postgres as `basic-256mb`.
- Before submission, sync the Blueprint and confirm Render has applied the non-free plans.
- After syncing, rerun `npm.cmd run render:health` and confirm `/readyz` reports durable Postgres with `fallbackActive: false`.

Work from here:

1. Create/confirm Shopify App Pricing, including the public `QST Starter` plan and the hosted plan-selection link.
2. Deploy or reconfirm Shopify app config from `shopify.app.qst-listing-workspace.toml`.
3. Run the embedded app QA checklist inside `https://admin.shopify.com/store/sst-test-site/apps/qst-listing-workspace/`.
4. Capture proof that compliance webhooks are configured in the Shopify Partner Dashboard and that invalid-HMAC probes still return 401.
5. Publish or update QST-specific support/getting-started/legal pages using `docs/public-pages/`.
6. Finish App Store submission assets: icon, screenshots, demo screencast, privacy policy URL, support email, support URL, pricing text, and reviewer instructions.
7. Do the separate desktop release gates from `..\docs\qa\CURRENT_RELEASE_GAP_AUDIT.md`: installer install/uninstall check, short visible GUI pass, code signing, and owner/legal review of release docs.

## Priority Order

Complete these in this order:

1. Confirm Render production environment variables.
2. Deploy Shopify app config.
3. Confirm Shopify App Pricing.
4. Confirm the desktop installer link remains optional.
5. Run the embedded app QA checklist.
6. Prepare the Shopify App Store submission assets and wording.
7. Submit only after all final gates pass.

## 1. Fix Render Postgres Persistence

Status: fixed.

Verified on 2026-06-12:

```json
{
  "storage": "postgres",
  "postgresReady": true,
  "fallbackActive": false,
  "storagePersistence": "durable"
}
```

Keep the recovery notes below in case Render ever regresses to memory fallback.

Current failing symptom:

```text
storage: memory_fallback
postgresReady: false
storageError: getaddrinfo ENOTFOUND dpg-...
```

What it means:

- The app is live.
- Shopify products and exports can still work.
- Pairing codes, marketplace setup state, and backend event logs are not durable.
- Data stored in `memory_fallback` can disappear when Render restarts or redeploys the web service.

Why it is happening:

- The Render web service is in Frankfurt.
- The old database shown in Render was in Oregon.
- The web service appears to be using an internal Render database hostname that is only reachable from services in the same Render region.
- The old database was Blueprint-managed, so deleting it manually can trigger this Render warning:

```text
This resource is managed by a Blueprint.
To prevent this resource from being recreated after deletion, first remove it from Blueprint qst-shopify-dashboard or disconnect the Blueprint entirely.
```

Render's own docs say internal database URLs are for Render services in the same region, while external URLs are for connections from outside that private regional network.
Render's Blueprint docs also say syncing never deletes existing resources automatically. To delete a Blueprint-managed resource, remove it from the Blueprint first, then delete it in the Dashboard.

### Current Clean Fix

Use this path now. Do not create a new Blueprint instance.

1. Confirm GitHub `main` contains the current `render.yaml`.
2. Open Render Dashboard.
3. Go to `Blueprints`.
4. Open the existing Blueprint named `qst-shopify-dashboard`.
5. Do not create a new Blueprint.
6. Click `Manual Sync` or `Sync`.
7. Confirm Render is syncing from `q-marx/qst-shopify-dashboard` on branch `main`.
8. The sync should create or reconcile:

```text
Web service: qst-shopify-dashboard
Region: Frankfurt

Database: qst-shopify-dashboard-db-frankfurt
Region: Frankfurt
```

9. The web service environment should get:

```text
DATABASE_URL = fromDatabase qst-shopify-dashboard-db-frankfurt connectionString
```

10. Wait until the database says `Available` and the web service redeploy is live.
11. Run:

```powershell
cd "C:\Users\Mark\Downloads\QST RELEASE VERSION 1 - Codex\shopify-dashboard"
npm run render:health
```

Expected result:

```json
{
  "storage": "postgres",
  "postgresReady": true,
  "fallbackActive": false,
  "storagePersistence": "durable"
}
```

### If The Old Oregon Database Still Exists

If `qst-shopify-dashboard-db` in Oregon still exists and Render blocks the Frankfurt database with:

```text
cannot have more than one active free tier database
```

use this sequence:

1. Make sure the existing Blueprint has synced the latest GitHub `main`.
2. Confirm the current `render.yaml` does not define `qst-shopify-dashboard-db`; it defines `qst-shopify-dashboard-db-frankfurt`.
3. Open the old Oregon database `qst-shopify-dashboard-db`.
4. If Render no longer warns that it is managed by the Blueprint, delete it.
5. If Render still warns that it is managed by the Blueprint, do not keep deleting it blindly. Sync the existing Blueprint from the latest `main` first.
6. After the old Oregon database is deleted, run `Manual Sync` on the existing Blueprint again.
7. Confirm the Frankfurt database is created.
8. Run:

```powershell
cd "C:\Users\Mark\Downloads\QST RELEASE VERSION 1 - Codex\shopify-dashboard"
npm run render:health
```

Expected result:

```json
{
  "storage": "postgres",
  "postgresReady": true,
  "fallbackActive": false,
  "storagePersistence": "durable"
}
```

### If You Already Deleted The Old Oregon Database

That is workable. Do not create a new Blueprint. Go straight to the existing Blueprint named `qst-shopify-dashboard`, run `Manual Sync`, and confirm it creates `qst-shopify-dashboard-db-frankfurt`.

If the old `qst-shopify-dashboard-db` comes back after sync, Render is syncing an old Blueprint definition or the wrong repository/branch. Stop and check that the Blueprint is connected to:

```text
q-marx/qst-shopify-dashboard
branch: main
render.yaml
```

### Fast Fix Fallback

Only use this if the clean Blueprint path is blocked and you need temporary durability.

1. Use the existing database's `External Database URL`.
2. Put it directly into the web service `DATABASE_URL`.
3. Redeploy.

This is not the preferred final setup because it keeps the web service and database in different regions.

Do not submit to Shopify while `/readyz` fails or reports `memory_fallback`.

## 2. Confirm Render Environment Variables

Open Render Dashboard, then the `qst-shopify-dashboard` web service, then `Environment`.

Required values:

```env
NODE_ENV=production
VITE_QST_DEMO_MODE=false
VITE_SHOPIFY_API_KEY=f0517dd50928e4546916d0c07b379e87
SHOPIFY_API_SECRET=your_current_shopify_client_secret
QST_APP_NAME=QST Listing Workspace
QST_SHOPIFY_APP_HANDLE=qst-listing-workspace
VITE_QST_SHOPIFY_APP_HANDLE=qst-listing-workspace
QST_PLAN_NAME=QST Starter
QST_SUBSCRIPTION_STATUS=not_checked
QST_DESKTOP_VERSION=1.0.0
QST_DESKTOP_DOWNLOAD_URL=https://github.com/q-marx/qst-shopify-dashboard/releases/download/v1.0.0/QST-Setup-v1.0.exe
QST_DESKTOP_PAIRING_ENABLED=true
QST_PAIRING_TTL_MINUTES=15
DATABASE_URL=postgres_connection_url
```

Notes:

- `SHOPIFY_API_SECRET` must be the real client secret from the Shopify app.
- `QST_DESKTOP_DOWNLOAD_URL` can stay blank until the Windows installer is hosted.
- If `QST_DESKTOP_DOWNLOAD_URL` is blank, the Shopify app remains usable; the desktop card should show installer pending.
- Before public review, use the paid non-sleeping Render web service plan from `render.yaml`. Free web services can cold-start, which can hurt Shopify automated checks and reviewer experience.

## 3. Confirm GitHub And Render Deployment

From PowerShell:

```powershell
cd "C:\Users\Mark\Downloads\QST RELEASE VERSION 1 - Codex\shopify-dashboard"
git status --short
git log -1 --oneline
npm run build
```

Expected:

- `git status --short` shows no uncommitted changes.
- `npm run build` succeeds.

After pushing any future changes:

```powershell
git push origin main
```

Then open Render and confirm the latest deployment is green.

Check the live app:

```powershell
npm run render:health
```

Do not rely only on "Deployed" in Render. The health check must also show durable Postgres before submission.

## 4. Deploy Shopify App Config

Current app config file:

```text
shopify.app.qst-listing-workspace.toml
```

It should contain:

```toml
name = "QST Listing Workspace"
client_id = "f0517dd50928e4546916d0c07b379e87"
application_url = "https://qst-shopify-dashboard.onrender.com"
embedded = true

[build]
automatically_update_urls_on_dev = false

[access_scopes]
scopes = "read_products"
optional_scopes = []
use_legacy_install_flow = false

[access.admin]
embedded_app_direct_api_access = true
direct_api_mode = "online"

[auth]
redirect_urls = [
  "https://qst-shopify-dashboard.onrender.com/auth/callback"
]

[webhooks]
api_version = "2026-04"

[[webhooks.subscriptions]]
topics = ["app/uninstalled"]
compliance_topics = ["customers/redact", "customers/data_request", "shop/redact"]
uri = "/webhooks"
```

Deploy the config:

```powershell
cd "C:\Users\Mark\Downloads\QST RELEASE VERSION 1 - Codex\shopify-dashboard"
shopify app deploy --config qst-listing-workspace --allow-updates
```

After deploy:

1. Open Shopify Partner Dashboard.
2. Open `QST Listing Workspace`.
3. Confirm the latest app version is active.
4. Confirm scopes show only `read_products`.
5. Confirm App URL is `https://qst-shopify-dashboard.onrender.com`.
6. Confirm redirect URL is `https://qst-shopify-dashboard.onrender.com/auth/callback`.
7. Confirm required compliance webhooks are present in the app version.

If Shopify Admin shows `Server Not Found` for a `trycloudflare.com` host, that is a stale Shopify CLI dev preview, not the production app. Click `Clean dev preview` in the Shopify Admin dev console, close the app tab, and reopen:

```text
https://admin.shopify.com/store/sst-test-site/apps/qst-listing-workspace/
```

## 5. Configure Shopify App Pricing

Shopify requires public app charges to use Shopify App Pricing or the Shopify Billing API. This app is built around Shopify App Pricing.

In Partner Dashboard:

1. Open `Apps > All Apps`.
2. Click `QST Listing Workspace`.
3. Open `Distribution`.
4. Beside the Shopify App Store listing, click `Manage listing`.
5. Under the published language, click `Edit`.
6. Under `Pricing content`, click `Manage` to open pricing setup.
7. Use Shopify App Pricing.
8. Keep the private `$0` test plan for development testing.
9. Under `Public plans`, click `Add` and create the public paid plan.

Recommended first public plan:

```text
Plan name: QST Starter
Type: recurring monthly
Trial: optional
Description: Prepare marketplace-ready Shopify listing drafts, export eBay-compatible CSV packs, and optionally pair QST Desktop for advanced local workflows.
```

For the plan redirect URL, use:

```text
/
```

The app links to Shopify's hosted plan page:

```text
https://admin.shopify.com/store/:store_handle/charges/:app_handle/pricing_plans
```

QA:

1. Open the embedded app in the dev store.
2. Click `Choose plan` or `Manage plan`.
3. Confirm Shopify's hosted pricing page opens.
4. Choose the test plan.
5. Return to the app.
6. Confirm the subscription card shows active plan state.

Source reminder: Shopify App Pricing includes a private `$0` test plan for testing, but public plans are the plans visible to merchants and on the Shopify App Store.

## 6. Configure Desktop Installer And Pairing

The Shopify dashboard must work without QST Desktop. The desktop app is an optional companion.

Safe wording:

```text
QST Desktop is an optional companion for merchants who want advanced desktop-first workflows outside Shopify Admin after setup.
```

Do not say:

```text
Requires QST Desktop.
The Shopify app is only a connector.
The Shopify app depends on the desktop software.
```

### Installer Link

When the Windows installer is hosted:

1. Upload the installer to a stable HTTPS URL.
2. Open Render web service `Environment`.
3. Set:

```env
QST_DESKTOP_VERSION=1.0.0
QST_DESKTOP_DOWNLOAD_URL=https://github.com/q-marx/qst-shopify-dashboard/releases/download/v1.0.0/QST-Setup-v1.0.exe
QST_DESKTOP_PAIRING_ENABLED=true
```

4. Redeploy.
5. Open the embedded Shopify app.
6. Confirm the Windows companion card shows a download button.

Do not use Shopify Admin `Content > Files` for the Windows installer if the file is over that store's file-size limit. The current installer is about 112 MB. The public GitHub Release asset is:

```text
https://github.com/q-marx/qst-shopify-dashboard/releases/download/v1.0.0/QST-Setup-v1.0.exe
```

If the installer is not hosted yet:

- Leave `QST_DESKTOP_DOWNLOAD_URL` blank.
- The dashboard should show installer pending.
- Do not make the Shopify app depend on the installer.

### Pairing Code

After Postgres is fixed:

1. Open the embedded Shopify app.
2. Confirm the subscription is active.
3. Click `Generate code`.
4. Confirm a short code appears.
5. Confirm the code expiration is shown.
6. Refresh the page.
7. Confirm the app still functions.

The code itself is generated by:

```text
POST /api/desktop/pairing-code
```

The desktop-side pairing lookup exists at:

```text
GET /api/desktop/pairing/:code
POST /api/desktop/pairing/:code/redeem
```

Important:

- This Shopify dashboard repo does not ship QST Desktop; desktop changes live in `C:\Users\Mark\Downloads\QST RELEASE VERSION 1 - Codex\QST_RELEASE_SOURCE_729_fixed`.
- The published v1.0 installer redeems the pairing endpoints, so the dashboard can enable desktop pairing.
- Say the desktop companion can be paired for advanced local workflows through the published v1.0 Windows installer.
- The desktop source, local PyInstaller bundle, and GitHub Release installer now include the pairing-code flow and dashboard-backed eBay OAuth.
- New paired desktop builds no longer require the separate Python `qst_broker` service for Shopify pairing or eBay OAuth; keep the old broker only while supporting older desktop builds.
- Set `QST_DESKTOP_PAIRING_ENABLED=true` in Render and redeploy.

## 7. Embedded App Functional QA

Run these from the actual Shopify embedded URL:

```text
https://admin.shopify.com/store/sst-test-site/apps/qst-listing-workspace/
```

Do not test product loading from the plain Render URL. Product loading requires Shopify Admin context.

### Product Workspace

Check:

- Products load from Shopify.
- Metrics show product count, ready count, review count, needs-work count, variants, and exported count.
- Search works by title, SKU, tag, and type.
- Readiness filter works.
- Shopify status filter works.
- Work status filter works.
- Marketplace target switch works for eBay, Etsy, Vinted, Depop, Facebook Marketplace, and Gumtree.

### Draft And Export

Check:

- Selecting a product shows a listing draft.
- Title, description, and tags are editable locally.
- Local edits survive refresh in the same browser.
- Product status changes to `Drafted` after local edits.
- Copy title works.
- Copy description works.
- Copy tags works.
- Copy full pack works.
- Download current listing works.
- Download CSV works.
- Download listing pack works.
- Download workspace pack works.
- Product status changes to `Exported` after export.
- Clear local edits resets browser-local draft/status/image choices.

### Image Curation

Check:

- Product images show in the draft panel.
- Primary image can be changed.
- Images can be included or excluded from export.
- Shopify product media is not changed.

### Marketplace Export Preparation

Check:

- Marketplace export preparation panel appears when `eBay` is selected.
- Export-ready counts update.
- `Select export-ready` selects eligible products.
- Export setup notes explain policy, dispatch, and fallback category checks.
- Export setup notes save.
- Download eBay CSV pack works.
- Download review plan works.
- Exported or ready local work status updates after downloads.
- No eBay OAuth connection is required for the Shopify Admin web workflow.

### Billing And Pairing

Check:

- Subscription card shows active or plan not selected accurately.
- Choose/manage plan goes to Shopify's hosted pricing page.
- Desktop card says optional.
- Installer button only appears when `QST_DESKTOP_DOWNLOAD_URL` is configured.
- Pairing code generation works when the Shopify workspace is authorised and desktop pairing is enabled.

### Old Revenue Paths

These should not show agency/service pages:

```text
https://qst-shopify-dashboard.onrender.com/listing-grader
https://qst-shopify-dashboard.onrender.com/listing-rescue
```

Expected result:

```text
404 Not found
```

## 8. Shopify Submission Wording

Use this App Store positioning.

Primary value proposition:

```text
Prepare marketplace-ready listing drafts from your Shopify products without editing your store data.
```

Short description:

```text
Search products, review listing readiness, prepare eBay-compatible CSVs, and export marketplace packs from inside Shopify Admin.
```

Feature bullets:

- Read-only product workspace for marketplace listing preparation.
- Product readiness checks for title, description, image, price, SKU, and status.
- eBay-compatible CSV preparation with draft copy, variant rows, image URLs, and category search hints.
- Export setup notes for policy, dispatch location, and fallback category readiness.
- Review-plan export for checking product data before import or desktop continuation.
- QST workspace pack export with listing data, promo-page HTML, variants, and image URL manifest.
- Export-only image selection for choosing primary and included listing images without changing Shopify.
- Browser-local draft and image persistence for continuing marketplace preparation after refresh.
- Product-level local marketplace status for tracking drafted, ready, and exported work.
- Local work-status filtering for staged marketplace listing queues.
- Copy-ready draft actions for titles, descriptions, tags, and individual listing packs.
- Browser-local bulk prep for selected products without editing Shopify product records.
- Draft marketplace titles, descriptions, and tags.
- Export selected products as CSV or copy-ready listing packs.
- Optional Windows companion for advanced desktop-first workflows after setup.

Reviewer note:

```text
QST Listing Workspace is fully usable inside Shopify Admin with read-only product access. QST Desktop is optional and is not required to search products, review readiness, prepare eBay-compatible CSVs, edit listing drafts, or export listing packs. The app uses read-only product access and does not write product changes back to Shopify.
```

## 9. Submission Assets To Prepare

Before submission, prepare:

- App icon.
- App listing screenshots.
- App demo video.
- Clear reviewer test instructions.
- Privacy policy URL.
- Support email.
- Support URL or simple support page.
- Pricing plan details.
- Terms of service URL if available.

Screenshots should be uploaded in Shopify Partner Dashboard. Keep local working copies under `docs/app-store-media/` or `..\promo\`. Screenshots should show:

1. Main dashboard with loaded Shopify products.
2. Readiness and work status filters.
3. Listing draft panel.
4. Marketplace export preparation.
5. Export/image curation controls.
6. Subscription and optional desktop companion cards.

Demo video should show:

1. Open app inside Shopify Admin.
2. Search/filter products.
3. Open a listing draft.
4. Edit draft text locally.
5. Select images for export.
6. Select export-ready products.
7. Download an eBay CSV pack or workspace pack.
8. Show optional QST Desktop pairing without implying it is required.

## 10. Final Submission Gates

Do not submit until all are true:

- `npm run build` passes locally.
- `git status --short` is clean.
- Latest commit is pushed to GitHub.
- Render latest deployment is live.
- `npm run render:health` reports durable Postgres.
- Embedded app loads products inside Shopify Admin.
- Direct Render URL does not pretend to show live Shopify products.
- Shopify pricing page works.
- Required privacy compliance webhooks are configured.
- Revenue/distraction pages are gone or return 404.
- The listing copy does not say the desktop app is required.
- The app video does not imply the Shopify app is only a connector.
- Support/privacy URLs are live.
- A reviewer can complete the core workflow without installing QST Desktop.

## Official References

- Shopify App Store requirements: `https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements`
- Shopify App Pricing: `https://shopify.dev/docs/apps/launch/billing/shopify-app-pricing`
- Shopify App Home and direct API access: `https://shopify.dev/docs/api/app-home`
- Shopify privacy law compliance: `https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance`
- Render Postgres connection docs: `https://render.com/docs/postgresql-creating-connecting`
