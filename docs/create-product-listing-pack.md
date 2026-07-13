# Create A Listing Pack From One Product

This guide shows how to take one product in QST Listing Workspace and download a marketplace listing pack from it.

QST uses read-only Shopify product access. Draft edits, image choices, export status, and QST-generated export SKUs are used for the downloaded pack only. They do not change your Shopify catalogue.

## Steps

1. Open **QST Listing Workspace** inside Shopify Admin.

2. In the top navigation, choose **Products**.

3. Confirm the **Pack target**.

   QST defaults to **eBay**. Change this before editing the draft if you want a different marketplace-style pack.

4. Find the product you want to prepare.

   Use the search box or filters if the product is not visible.

5. Click the product row to open its **Listing draft**.

   If the correct product draft is already open, you can continue.

6. Review the draft fields:

   - **Marketplace title**
   - **Description**
   - **Suggested tags**

   You can edit these fields before exporting. These edits are saved by QST for the pack and do not update Shopify.

7. Review **Readiness checks**.

   A product can be exported when the checks pass or when any review items are acceptable to you. If a Shopify SKU is missing, QST shows an **Export SKU** and uses a generated `QST_...` value in the pack.

8. Review **Export images**.

   Keep the images you want included ticked. Use **Set primary** if a different image should appear first in the pack.

9. Review **Listing rows**.

   Confirm the row price and export SKU look sensible. If Shopify has a SKU, QST uses it. If Shopify has no SKU, QST uses a generated export SKU in the downloaded pack only.

10. Tick the checkbox at the far left of that product row in the **Products** list.

   The selected-products summary should change from **No products selected** to **1 product selected for eBay** or the marketplace you chose.

11. Scroll to the export buttons and choose the pack you need:

   - **Download listing pack** for a copy-ready text pack.
   - **Download workspace pack** for a structured JSON workspace pack.
   - **Download CSV** for a simple CSV export.

12. Save or open the downloaded file.

   The product's local QST progress changes to **Export downloaded** so it is easier to track what has already been prepared.

## Single-Product Shortcut

When the product's **Listing draft** is open, you can also use **Download draft file** in the **Actions** panel. This downloads a single-product text draft without needing to use the product checkbox.

Use the main **Download listing pack** button when you want the normal selected-product export flow, or when you may export more than one product at a time.
