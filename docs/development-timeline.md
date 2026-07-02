# SST To QST Development Timeline

Last updated: 2026-07-02

This timeline records the known development path from the pre-QST SST phase through the current Shopify App Store submission work.

## Evidence Notes

- User-provided project history: QST was previously named SST.
- Local evidence still uses `sst-test-site.myshopify.com` as the Shopify development store, which supports continuity from the SST naming.
- The earliest preserved local installer/build artifacts in this workspace are QST-branded and date from May 2026.
- Dates below are based on preserved files, release notes, Git history, and runbook entries in this workspace. Items marked "inferred" are based on context rather than a preserved release artifact.

## Timeline

### SST Phase - Before May 2026

Status: user-provided history, limited local artifacts.

- The tool existed before the QST name and was previously called SST.
- The project focus was a Shopify seller workflow for reducing repeated marketplace listing work.
- The current dev store name `sst-test-site` appears throughout later QST testing, showing naming continuity from SST into QST.

### Early QST Desktop Builds - 6 to 8 May 2026

Status: preserved installer artifacts.

- Multiple archived installer builds appear under `releases/archive`.
- Earliest preserved installer artifact:
  - `QST-Setup_20260507_124424.exe`
  - file timestamp: 2026-05-06 00:59:56
- Additional installer iterations were created through 2026-05-07 and 2026-05-08.
- This period appears to be rapid packaging and installer iteration for the desktop application.

### Desktop Build Stabilisation - 9 to 13 May 2026

Status: preserved build/dist rotation folders.

- `QST_RELEASE_SOURCE_729_fixed` contains rotated PyInstaller build and dist folders from 2026-05-09 through 2026-05-13.
- Repeated build rotations indicate active work on packaged desktop stability, launch behaviour, and source cleanup.

### QST 1.0 Desktop Verification - 13 May 2026

Status: release notes and QA evidence.

Release notes record:

- Shopify restore verified with `sst-test-site`.
- Shopify product loading verified with 204 products.
- eBay readiness verified with business policies, postcode, and default category.
- Single-item eBay publish/update verified.
- Sequential eBay batch publish verified to continue after a forced item failure.
- Marketplace listing pack generation verified.
- Failure-injection checks passed for Shopify restore errors, eBay token expiry, policy retry, invalid category, image/background-removal failures, and export permission errors.
- User-facing output folders moved under `Documents\QST`.
- Reset App Data returned QST to a true first-run state.

### Desktop Release QA And Polish - 14 to 18 May 2026

Status: `docs/qa/CURRENT_RELEASE_GAP_AUDIT.md`.

Closed work included:

- release docs created: Quick Start, Reviewer Notes, EULA, OSS notices, and release notes
- Inno Setup installer build
- GUI smoke checks
- setup wizard and theme polish
- image caching and performance improvements
- marketplace/status column visibility fixes
- variant preview and timestamp display improvements
- current recording build refreshed under `releases/QST_current`

Remaining desktop release gaps at that point included:

- clean-machine installer install/uninstall verification
- short human-visible GUI pass
- Shopify App Store/broker-side proof
- final legal/compliance review

### Promo And App Store Asset Preparation - 18 May to 3 June 2026

Status: preserved promo folders and scripts.

- `qst_video_production_pack` created.
- `qst_video_storyboard_v2.md` created.
- Canva/video asset scripts and promo folders were prepared.
- Promo copy still focused heavily on the desktop QST sync tool and direct eBay publishing.

### Shopify Dashboard Project Begins - 7 June 2026

Status: Git history in `shopify-dashboard`.

Initial dashboard commits:

- prepared QST Shopify dashboard for Render
- made installer env optional for initial Render deploy
- fixed Render build/startup behaviour
- added Postgres retry and health checks
- pointed Shopify config at Render production URL

### Early Dashboard Positioning Tests - 8 to 11 June 2026

Status: Git history.

- Public listing rescue / promotional pages were briefly added.
- Those revenue/distraction pages were removed before submission.
- This established that the Shopify app should remain focused on the embedded product workspace rather than external services or lead magnets.

### Dashboard Export Workflow Buildout - 12 June 2026

Status: Git history.

Dashboard features added:

- eBay-ready batch workflow
- eBay setup tracker
- review/publish plan export
- QST workspace pack export
- export image curation
- browser-local workspace persistence
- marketplace work status
- copy-ready listing actions
- browser-local bulk prep
- desktop upgrade path wording
- Shopify launch runbook
- Render Postgres verification notes

### Production URL And Shopify Dev Tunnel Guard - 15 June 2026

Status: Git history.

- Shopify config was protected from accidental dev tunnel URL replacement.
- Production Render URL remained the intended live app URL.

### Shopify Dashboard / Desktop Pairing Push - 2 July 2026

Status: Git history and built installer.

Work completed:

- unified dashboard desktop pairing and eBay OAuth broker routes into the dashboard service
- enabled desktop pairing in Render config
- allowed desktop pairing before plan status
- added copy-code action for pairing codes
- fixed desktop Shopify pairing authorization flow
- fixed dashboard workflow panel layout
- fixed Shopify OAuth callback redirect to the whitelisted `/auth/callback`
- uploaded the public QST Desktop installer release asset

### Submission Repositioning - 2 July 2026

Status: Git history.

Dashboard was repositioned for Shopify review:

- web app became "marketplace export preparation" rather than web eBay sync/publishing
- prepared listing records no longer require eBay OAuth
- eBay OAuth remains available for optional QST Desktop workflows
- reviewer instructions no longer require eBay sandbox credentials
- support/privacy/terms/contact links were added to the dashboard support strip
- export setup notes were clarified in the UI

### Current Submission Phase - 2 July 2026

Status: active.

Open items are tracked in `docs/shopify-submission-gap-register.md`.

Primary remaining work:

- create public Shopify App Pricing plan
- update public Q-MER.CH support/getting-started copy
- upload App Store screenshots/media
- complete embedded Shopify Admin QA
- verify Partner Dashboard URLs, pricing, scopes, and webhooks
- optionally code-sign QST Desktop installer
