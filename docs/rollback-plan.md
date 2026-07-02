# Rollback Plan

## Fast rollback

1. In Shopify Partner Dashboard, restore the previous App URL and redirect URLs.
2. In Render, roll back the web service to the last healthy deploy.
3. If the custom domain was switched, point Shopify/eBay callbacks back to the previous healthy Render URL.
4. Keep Postgres attached; do not delete tables or rotate token encryption while investigating.
5. Verify `/healthz`, `/readyz`, `/auth/callback`, and desktop pairing compatibility routes.

## Data rollback

Do not delete token or listing/export tables during rollback. The app can safely ignore newer records, but deleting OAuth or pairing data may disconnect merchants.

If `QST_TOKEN_ENCRYPTION_KEY` was rotated incorrectly:

1. Restore the previous env var value.
2. Redeploy.
3. Confirm `/readyz`.
4. Test eBay connection state for a known development shop.

## Decommission guardrail

Do not decommission any older broker/backend service until:

- Shopify install and callback pass on the unified service.
- eBay callback passes in sandbox/review mode.
- Desktop compatibility endpoints are verified.
- No production merchant or released desktop build still depends on the old route.
