# QST Shopify Submission Gap Register

Last updated: 2026-07-02

This is the current gap tracker for submitting QST Listing Workspace to the Shopify App Store. The older desktop release audit at `..\..\docs\qa\CURRENT_RELEASE_GAP_AUDIT.md` remains useful for QST Desktop, but this file tracks the Shopify web app submission path.

## Current Position

QST Listing Workspace is positioned as a read-only Shopify Admin app for marketplace export preparation.

The web app now:

- loads Shopify products inside Shopify Admin with `read_products`
- reviews product readiness
- prepares local listing drafts
- saves prepared listing records
- downloads CSV, workspace, listing-pack, and review-plan exports
- shows QST Desktop as optional
- does not require eBay OAuth or QST Desktop for the core Shopify review flow

## Completed

- Render web service is live at `https://qst-shopify-dashboard.onrender.com`.
- Render health reports durable Postgres, not memory fallback.
- Shopify OAuth redirect uses `https://qst-shopify-dashboard.onrender.com/auth/callback`.
- Desktop pairing code generation, copy action, and desktop redemption flow are implemented.
- Public installer URL is configured through GitHub Releases.
- Dashboard layout issue in the export workflow panel was fixed.
- Dashboard was repositioned from web eBay sync/publishing to export-pack preparation.
- Prepared records can be saved without an eBay OAuth connection.
- Dashboard support strip now links to support, privacy, terms, and contact routes.
- Reviewer instructions no longer require eBay sandbox credentials.

## Open Before Submission

### 1. Shopify App Pricing

Status: open, manual Partner Dashboard action.

Create at least one public plan under Shopify App Pricing. Keep the private `$0` test plan for development only.

Recommended first public plan:

- Display name: `QST Starter`
- Billing: monthly recurring
- Trial: optional
- Top features:
  - Read-only Shopify product workspace
  - Marketplace listing draft preparation
  - eBay-compatible CSV export packs
  - Workspace and listing pack downloads
  - Optional QST Desktop pairing

### 2. Shopify App Store Listing Content

Status: open.

Add listing content in Partner Dashboard:

- app introduction
- app card subtitle
- feature list
- categories/search terms
- pricing text
- reviewer instructions
- support email and support URL
- privacy policy URL
- screenshots and optional feature media

Use `docs/shopify-app-store-submission.md` and `SUBMISSION_POSITIONING.md` for approved wording.

### 3. Public Support And Legal Pages

Status: partially open.

Verified live:

- Privacy policy: `https://q-mer.ch/policies/privacy-policy`
- Terms of service: `https://q-mer.ch/policies/terms-of-service`
- Contact information: `https://q-mer.ch/policies/contact-information`

Still needed:

- publish a QST-specific support or getting-started page
- update the existing Q-MER.CH sync-tool page so it does not make stronger claims than the Shopify app supports
- confirm privacy and terms mention QST app data accurately

Draft page copy is in `docs/public-pages/`.

### 4. Screenshots And Media

Status: open.

Add screenshots in the Shopify Partner Dashboard listing editor, not in the code repo. Keep local source/working copies under `docs/app-store-media/` or `promo/`.

Required screenshot set:

- Overview with loaded Shopify products
- Product browser with filters
- Listing draft and readiness checks
- Marketplace export preparation panel
- Export/image curation controls

See `docs/app-store-media-plan.md`.

### 5. Embedded Shopify Admin QA

Status: open.

Run `docs/manual-acceptance-test.md` in the embedded app:

`https://admin.shopify.com/store/sst-test-site/apps/qst-listing-workspace/`

Capture pass/fail notes before submission.

### 6. Shopify Partner Dashboard Configuration Proof

Status: open.

Confirm in Partner Dashboard:

- app URL is `https://qst-shopify-dashboard.onrender.com`
- redirect URL includes `https://qst-shopify-dashboard.onrender.com/auth/callback`
- required compliance webhook topics are configured
- scopes are only `read_products`
- embedded app direct API access remains enabled
- Shopify App Pricing is selected

### 7. Public Page Copy Cleanup

Status: open.

The public Q-MER.CH sync-tool page still contains older desktop/eBay direct-publish phrasing. Before submission, either update the page or avoid linking it from the App Store listing.

Use wording that matches the Shopify app:

`Prepare marketplace-ready listing drafts and export packs from Shopify product data without changing your Shopify catalogue.`

### 8. Optional But Recommended

These are not web-app blockers, but should be planned:

- code-sign the Windows installer to reduce Microsoft Defender SmartScreen warnings
- move to a custom app domain such as `qst.q-mer.ch`
- clean up unused Render services so only the active dashboard service and Postgres remain billable
- run a clean-machine desktop install/uninstall pass

## Submission Go/No-Go

Submit only when:

- the public Shopify pricing plan exists
- the public support/privacy/terms URLs are live and accurate
- screenshots are uploaded
- reviewer instructions match the export-preparation flow
- embedded Shopify QA passes
- Render health reports durable Postgres
- App Store copy does not imply QST Desktop or eBay OAuth is required
