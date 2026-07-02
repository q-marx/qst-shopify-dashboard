# Render Migration

## Recommended sequence

1. Build and test locally with `npm.cmd test` and `npm.cmd run build`.
2. Deploy the unified service to a temporary Render URL.
3. Add Render Postgres and required secret env vars.
4. Confirm `/healthz` succeeds and `/readyz` reports durable Postgres.
5. Test Shopify install/callback in a development store.
6. Test embedded app load inside Shopify Admin.
7. Test product retrieval with App Bridge direct Admin GraphQL.
8. If QST Desktop eBay OAuth is in scope, test eBay OAuth in sandbox/review mode.
9. Test prepared listing records and export records.
10. Test desktop pairing endpoints without requiring desktop for the web workflow.
11. Add the custom QST domain.
12. Update Shopify Partner Dashboard App URL and redirect URLs.
13. Update eBay callback/RuName settings if the domain changed.
14. Switch production traffic.
15. Monitor Render logs, `/readyz`, Shopify callback logs, and optional desktop eBay callback outcomes.
16. Keep the previous broker/dashboard live temporarily if any deployed desktop build still depends on it.

## Custom domain

Preferred hostname: `qst.q-mer.ch`.

Manual DNS action:

- Add the hostname as a custom domain in the Render web service.
- Create the DNS record Render displays for `qst.q-mer.ch`.
- Wait for Render TLS certificate provisioning.
- Replace temporary `onrender.com` URLs in Shopify and eBay settings only after the Render domain status is healthy.

## Current blockers requiring user/account action

- Confirm DNS access for `q-mer.ch` or provide the exact person/system that can add the Render DNS record.
- Add real eBay sandbox/review app credentials in Render only if testing optional QST Desktop eBay OAuth.
- Confirm whether `qst.q-mer.ch` is the exact hostname to use.
- Confirm Shopify App Pricing plans and public listing URLs.
