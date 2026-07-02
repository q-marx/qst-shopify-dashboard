# Reviewer Testing Instructions Template

## Test accounts

- Development store URL: `[ADD DEVELOPMENT STORE URL]`
- Reviewer Shopify account: `[ADD REVIEWER ACCOUNT EMAIL]`
- Reviewer Shopify password: `[ADD PASSWORD IN SHOPIFY SUBMISSION FORM ONLY]`
- Testing environment: `Shopify Admin embedded app`

Do not commit actual passwords to this repository.

## Steps

1. Open the QST app from Shopify Admin.
2. Confirm the Overview shows the correct Shopify shop context.
3. Open Products and confirm products load from Shopify.
4. Search/filter products and select one or more products.
5. Open Listing review and inspect title, description, price, image, options, and variants.
6. Open Export packs and review the export setup notes section.
7. Save prepared listing records for selected products.
8. Confirm validation results are visible if required data is missing.
9. Generate an eBay CSV pack or marketplace export pack.
10. Confirm QST Desktop is shown as optional, not required.
11. Confirm Shopify catalogue data was not changed.

## Expected results

- The app opens embedded in Shopify Admin.
- Product data belongs to the installed shop.
- The embedded app does not require an eBay account connection.
- Prepared listing records are persisted.
- Export packs download from selected product data.
- Desktop companion is optional.

## Known limitations

`[ADD ONLY TRUE CURRENT LIMITATIONS, IF ANY]`
