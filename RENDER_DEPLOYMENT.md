# Render Deployment Checklist

## What has been prepared

- `render.yaml` Blueprint for a Node web service and PostgreSQL database.
- Production server binding for Render's `PORT`.
- `/api/health` health check.
- Optional Postgres persistence for pairing codes and event logs through `DATABASE_URL`.
- Frankfurt web service and Frankfurt Postgres database so Render's internal database URL resolves correctly.
- Production-safe secrets in the Blueprint with `sync: false`.

## Required source setup

Render needs a Git-backed source. Push this `shopify-dashboard` folder as the root of a GitHub, GitLab, or Bitbucket repo.

Recommended repository name:

```text
qst-shopify-dashboard
```

## Render Blueprint flow

After the repo is pushed, open:

```text
https://dashboard.render.com/blueprint/new
```

Connect the repo that contains `render.yaml`, then apply the Blueprint.

If the Blueprint already exists and Render does not auto-sync after a GitHub push, open the Blueprint
page in Render and click **Manual Sync**. The sync should show a new database named
`qst-shopify-dashboard-db-frankfurt` and an update to the web service's `DATABASE_URL`.

## Fill these Render environment values

```env
VITE_SHOPIFY_API_KEY=f0517dd50928e4546916d0c07b379e87
SHOPIFY_API_SECRET=your_shopify_client_secret
QST_DESKTOP_VERSION=1.0.0
QST_DESKTOP_DOWNLOAD_URL=https://your-hosted-qst-installer-url
```

If the Windows installer is not hosted yet, leave `QST_DESKTOP_DOWNLOAD_URL` blank temporarily. The dashboard will keep showing `Installer pending`.

## After Render gives you a URL

Suppose Render gives:

```text
https://qst-shopify-dashboard.onrender.com
```

Update both Shopify config files:

```toml
application_url = "https://qst-shopify-dashboard.onrender.com"

[auth]
redirect_urls = [
  "https://qst-shopify-dashboard.onrender.com/auth/callback"
]
```

Then deploy the config to Shopify:

```powershell
shopify app deploy --config qst-listing-workspace
```

## Smoke test after deploy

Open these:

```text
https://qst-shopify-dashboard.onrender.com/api/health
https://admin.shopify.com/store/sst-test-site/apps/qst-listing-workspace
```

Or run:

```powershell
npm run render:health
```

Check:

- product list loads
- subscription status still shows `Active`
- `Generate code` creates a desktop pairing code
- `/api/health` reports `"storageReady": true`
- preferably `/api/health` also reports `"storage": "postgres"` and `"postgresReady": true`
- CSV and listing pack downloads still work
- no Render logs show webhook or token verification errors

If `/api/health` reports a `getaddrinfo ENOTFOUND dpg-...` storage error, the app is trying to use a
Render internal database URL that is not reachable from the web service's region. The current project
has the web service in Frankfurt and the existing database in Oregon, so either:

- Fast fix: copy the Oregon database's **External Database URL** into the web service's `DATABASE_URL`,
  then redeploy the web service.
- Clean fix: create or Blueprint-sync `qst-shopify-dashboard-db-frankfurt` in Frankfurt, then set the
  web service's `DATABASE_URL` to that Frankfurt database's **Internal Database URL**.

The app can keep running with `"storage": "memory_fallback"` while this is corrected, but pairing
codes are ephemeral until Postgres is ready.

## Before Shopify submission

Use at least a non-sleeping Render web service plan before review. Free services can cold-start, which may hurt Shopify's automated checks and reviewer experience.
