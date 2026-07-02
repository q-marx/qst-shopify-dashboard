# Manual Acceptance Test

- [ ] Install on a Shopify development store.
- [ ] Open embedded QST app in Shopify Admin.
- [ ] Confirm correct shop identity.
- [ ] Browse products.
- [ ] Filter and select products.
- [ ] Open and review product data.
- [ ] Connect eBay sandbox/review account.
- [ ] Prepare/create test listing or verified draft.
- [ ] Generate export pack.
- [ ] Confirm Shopify catalogue was not changed.
- [ ] Confirm desktop companion is optional.
- [ ] Confirm app works after Render service idle period.
- [ ] Confirm callback routes work after deployment.
- [ ] Confirm no secrets appear in logs.
- [ ] Confirm uninstall/disconnect behaviour.

Additional web-specific checks:

- [ ] `/healthz` returns quickly.
- [ ] `/readyz` reports durable Postgres before submission.
- [ ] A shop cannot see another shop's listing/export records.
- [ ] eBay connection state shows `Sandbox` or `Production`.
- [ ] A missing eBay connection produces an actionable validation result.
