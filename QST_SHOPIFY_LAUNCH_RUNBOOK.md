# QST Shopify Launch Runbook

This is the working checklist for getting QST Listing Workspace functioning properly for Shopify review and early customers.

Use this document as the source of truth for the current Shopify dashboard project. It does not require changes to the QST desktop source code.

## Current Known State

- Repository: `q-marx/qst-shopify-dashboard`
- Local folder: `C:\Users\Mark\Downloads\QST RELEASE VERSION 1 - Codex\shopify-dashboard`
- Live Render app: `https://qst-shopify-dashboard.onrender.com`
- Shopify embedded app: `https://admin.shopify.com/store/sst-test-site/apps/qst-listing-workspace/`
- Shopify app name: `QST Listing Workspace`
- Shopify app handle: `qst-listing-workspace`
- Client ID in config: `f0517dd50928e4546916d0c07b379e87`
- Required Shopify scope: `read_products`
- Latest confirmed Git commit before this document: `aab8efa Clarify desktop upgrade path`

The direct Render URL is not supposed to show live Shopify products. Live products load inside Shopify Admin because the dashboard uses Shopify App Bridge direct Admin GraphQL access. Direct browser visits can only show an empty or preview state because there is no embedded Shopify session.

## Priority Order

Complete these in this order:

1. Fix Render Postgres persistence.
2. Confirm Render production environment variables.
3. Deploy Shopify app config.
4. Confirm Shopify App Pricing.
5. Configure the desktop installer link or leave it intentionally pending.
6. Run the embedded app QA checklist.
7. Prepare the Shopify App Store submission assets and wording.
8. Submit only after all final gates pass.

## 1. Fix Render Postgres Persistence

This is the main technical issue left.

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
- The current database shown in Render is in Oregon.
- The web service appears to be using an internal Render database hostname that is only reachable from services in the same Render region.

Render's own docs say internal database URLs are for Render services in the same region, while external URLs are for connections from outside that private regional network.

### Fast Fix

Use this if you want to get working quickly with the existing Oregon database.

1. Open Render Dashboard.
2. Open the project containing `qst-shopify-dashboard`.
3. Open the database service, currently shown as `qst-shopify-dashboard-db`.
4. Open its connection details.
5. Copy the full `External Database URL`.
6. Open the web service `qst-shopify-dashboard`.
7. Go to `Environment`.
8. Find `DATABASE_URL`.
9. Replace the existing value with the database's full `External Database URL`.
10. Save changes.
11. Redeploy the web service.
12. Wait until Render says the deployment is live.
13. Run:

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

### Clean Fix

Use this when you want the clean production setup.

1. Open Render Dashboard.
2. Create or Blueprint-sync a Postgres database named `qst-shopify-dashboard-db-frankfurt`.
3. Put it in the same region as the web service: Frankfurt.
4. Open the new Frankfurt database.
5. Copy its `Internal Database URL`.
6. Open the web service `qst-shopify-dashboard`.
7. Go to `Environment`.
8. Set `DATABASE_URL` to the Frankfurt database's `Internal Database URL`.
9. Redeploy the web service.
10. Run:

```powershell
cd "C:\Users\Mark\Downloads\QST RELEASE VERSION 1 - Codex\shopify-dashboard"
npm run render:health
```

Expected result is the same:

```json
{
  "storage": "postgres",
  "postgresReady": true,
  "fallbackActive": false,
  "storagePersistence": "durable"
}
```

Do not submit to Shopify while `/api/health` still reports `memory_fallback`.

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
QST_DESKTOP_VERSION=Not configured
QST_DESKTOP_DOWNLOAD_URL=
QST_PAIRING_TTL_MINUTES=15
DATABASE_URL=postgres_connection_url
```

Notes:

- `SHOPIFY_API_SECRET` must be the real client secret from the Shopify app.
- `QST_DESKTOP_DOWNLOAD_URL` can stay blank until the Windows installer is hosted.
- If `QST_DESKTOP_DOWNLOAD_URL` is blank, the Shopify app remains usable; the desktop card should show installer pending.
- Before public review, use a non-sleeping Render web service plan if possible. Render free services can cold-start, which can hurt Shopify automated checks and reviewer experience.

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
shopify app deploy --config qst-listing-workspace
```

After deploy:

1. Open Shopify Partner Dashboard.
2. Open `QST Listing Workspace`.
3. Confirm the latest app version is active.
4. Confirm scopes show only `read_products`.
5. Confirm App URL is `https://qst-shopify-dashboard.onrender.com`.
6. Confirm redirect URL is `https://qst-shopify-dashboard.onrender.com/auth/callback`.
7. Confirm required compliance webhooks are present in the app version.

## 5. Configure Shopify App Pricing

Shopify requires public app charges to use Shopify App Pricing or the Shopify Billing API. This app is built around Shopify App Pricing.

In Partner Dashboard:

1. Open `QST Listing Workspace`.
2. Open `Distribution`.
3. Open the Shopify App Store listing submission area.
4. Open pricing content or pricing setup.
5. Use Shopify App Pricing.
6. Keep the private `$0` test plan for development testing.
7. Create the public paid plan when ready.

Recommended first public plan:

```text
Plan name: QST Starter
Type: recurring monthly
Trial: optional
Description: Prepare marketplace-ready Shopify listings, export eBay-ready batches, and optionally pair QST Desktop for heavier local workflows and one-click eBay publishing after setup.
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

## 6. Configure Desktop Installer And Pairing

The Shopify dashboard must work without QST Desktop. The desktop app is an optional companion.

Safe wording:

```text
QST Desktop is an optional companion for merchants who want bulk preparation, local review, and one-click eBay publishing automation outside Shopify Admin after setup.
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
QST_DESKTOP_DOWNLOAD_URL=https://your-hosted-qst-installer-url
```

4. Redeploy.
5. Open the embedded Shopify app.
6. Confirm the Windows companion card shows a download button.

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

- This Shopify dashboard project does not modify QST desktop.
- If the existing desktop build does not yet redeem these pairing endpoints, do not claim live two-way sync in the Shopify submission.
- Say the desktop companion can be paired for local workflows and one-click eBay publishing after setup only when the released desktop build supports the pairing flow.

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

### eBay Workflow

Check:

- eBay batch workflow panel appears when `eBay` is selected.
- eBay-ready counts update.
- `Select eBay-ready` selects eligible products.
- eBay setup tracker fields save.
- Download eBay batch works.
- Download publish plan works.
- Exported or ready local work status updates after downloads.

### Billing And Pairing

Check:

- Subscription card shows active or plan not selected accurately.
- Choose/manage plan goes to Shopify's hosted pricing page.
- Desktop card says optional.
- Installer button only appears when `QST_DESKTOP_DOWNLOAD_URL` is configured.
- Pairing code generation works only after subscription is active.

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
Search products, review listing readiness, prepare eBay-ready batches, and export marketplace packs from inside Shopify Admin.
```

Feature bullets:

- Read-only product workspace for marketplace listing preparation.
- Product readiness checks for title, description, image, price, SKU, and status.
- eBay-ready batch preparation with draft copy, variant rows, image URLs, and category search hints.
- eBay setup tracker for account, policy, dispatch location, and fallback category readiness.
- eBay publish-plan export for reviewing the inventory item, offer, and publish sequence.
- QST workspace pack export with listing data, promo-page HTML, variants, and image URL manifest.
- Export-only image selection for choosing primary and included listing images without changing Shopify.
- Browser-local draft and image persistence for continuing marketplace preparation after refresh.
- Product-level local marketplace status for tracking drafted, ready, and exported work.
- Local work-status filtering for staged marketplace listing queues.
- Copy-ready draft actions for titles, descriptions, tags, and individual listing packs.
- Browser-local bulk prep for selected products without editing Shopify product records.
- Draft marketplace titles, descriptions, and tags.
- Export selected products as CSV or copy-ready listing packs.
- Optional Windows companion for larger local workflows and one-click eBay publishing automation after setup.

Reviewer note:

```text
QST Listing Workspace is fully usable inside Shopify Admin with read-only product access. QST Desktop is optional and is not required to search products, review readiness, prepare eBay-ready batches, edit listing drafts, or export listing packs. The app uses read-only product access and does not write product changes back to Shopify.
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

Screenshots should show:

1. Main dashboard with loaded Shopify products.
2. Readiness and work status filters.
3. Listing draft panel.
4. eBay batch workflow.
5. Export/image curation controls.
6. Subscription and optional desktop companion cards.

Demo video should show:

1. Open app inside Shopify Admin.
2. Search/filter products.
3. Open a listing draft.
4. Edit draft text locally.
5. Select images for export.
6. Select eBay-ready products.
7. Download an eBay batch or workspace pack.
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
