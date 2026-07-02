# QST Shopify Submission Positioning

## Product Position

QST Listing Workspace is the Shopify Admin app. It must be useful on its own:

- reads Shopify product data with `read_products`
- searches and filters products
- checks listing readiness
- lets merchants review and adjust marketplace listing drafts
- saves prepared marketplace listing records with validation outcomes
- prepares eBay-compatible CSV export packs with prices, SKUs, image URLs, variant rows, readiness notes, and category search hints
- tracks export setup readiness for policy notes, dispatch location, and fallback category
- exports an eBay-compatible review-plan JSON file without connecting to or publishing on eBay
- exports a QST workspace pack with listing text, marketplace draft data, promo-page HTML, variant rows, and an image URL manifest
- supports export-only primary/included image selection without editing Shopify media
- saves local draft and export-image choices in the merchant's browser without writing back to Shopify
- tracks browser-local marketplace work status per product so drafted, ready, and exported items remain visible
- filters the product queue by local marketplace work status so merchants can stage draft, ready, and exported work
- provides copy-ready listing actions for titles, descriptions, tags, full packs, and single-product downloads
- applies browser-local bulk prep to selected products, including status updates, title prefixes, and tag appends
- exports copy-ready marketplace packs and CSV files
- supports eBay, Etsy, Facebook Marketplace, Vinted, Depop, and Gumtree style preparation

The Windows QST desktop software is an optional companion for heavier workflows. Do not describe it as
required for the Shopify app to function.

## Safe Desktop Wording

Use:

```text
QST Desktop is an optional companion for merchants who want advanced desktop-first listing workflows outside Shopify Admin after setup.
```

```text
The Shopify app works inside Shopify Admin without installing QST Desktop. Merchants can optionally connect the Windows companion for larger or more detailed preparation workflows.
```

```text
The dashboard and desktop companion align around the same Shopify product workspace. The dashboard reads Shopify product data and prepares export-ready drafts; the optional desktop companion can be connected to the workspace for advanced desktop-first workflows after the released desktop build supports that flow.
```

Avoid:

```text
Requires QST Desktop.
```

```text
Install the desktop app to use QST.
```

```text
The Shopify app is only a connector.
```

```text
The Shopify app depends on the desktop software.
```

## How The Dashboard And Desktop Align

The dashboard is the Shopify-native workspace:

- product data comes from Shopify through App Bridge/Admin GraphQL
- data access is read-only
- drafts and exports are prepared in the browser
- Shopify subscription and desktop pairing availability are shown in Admin

The desktop companion should be presented as additive:

- helps with bulk preparation, local workflows, and advanced marketplace automation where supported by the released desktop build
- can publish eligible products to eBay after the merchant connects eBay and completes eBay setup in the desktop companion
- can continue from dashboard-prepared eBay drafts after setup
- can use listing drafts, image choices, SKU readiness, and export setup notes prepared in the Shopify dashboard
- can use the same product-level marketplace status context when merchants continue work outside Shopify Admin
- can use a short pairing code to associate with the Shopify workspace once the released desktop build supports code redemption
- should not be needed to search, review, edit, or export listing drafts in Shopify Admin
- should not be described as required for the Shopify app's marketplace export preparation

## App Store Listing Angle

Primary value proposition:

```text
Prepare marketplace-ready listing drafts from your Shopify products without editing your store data.
```

Short description:

```text
Search products, review listing readiness, prepare eBay-compatible CSVs, and export marketplace packs from inside Shopify Admin.
```

Feature bullets:

- Read-only product workspace for marketplace listing preparation
- Product readiness checks for title, description, image, price, SKU, and status
- eBay-compatible CSV preparation with draft copy, variant rows, image URLs, and category search hints
- Export setup notes for policy, dispatch location, and fallback category readiness
- Review-plan export for checking product data before import or desktop continuation
- QST workspace pack export with listing data, promo-page HTML, variants, and image URL manifest
- Export-only image selection for choosing primary/included listing images without changing Shopify
- Browser-local draft and image persistence for continuing marketplace preparation after refresh
- Product-level local marketplace status for tracking drafted, ready, and exported work
- Local work-status filtering for staged marketplace listing queues
- Copy-ready draft actions for titles, descriptions, tags, and individual listing packs
- Browser-local bulk prep for selected products without editing Shopify product records
- Draft marketplace titles, descriptions, and tags
- Export selected products as CSV or copy-ready listing packs
- Optional Windows companion for advanced desktop-first workflows after setup

Reviewer note:

```text
QST Listing Workspace is fully usable inside Shopify Admin with read-only product access. The Windows desktop companion is optional and is not required to search products, review readiness, prepare eBay-compatible CSVs, edit listing drafts, or export listing packs.
```
