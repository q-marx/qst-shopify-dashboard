import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assessReadiness,
  buildEbayPrepCsv,
  buildTextPack,
  createDraft,
  exportSku
} from "../src/listing-utils.js";

const productWithoutSku = {
  id: "gid://shopify/Product/123456789",
  title: "Handcrafted Interlocking Heart Sculpture",
  handle: "handcrafted-heart-sculpture",
  description: "A handcrafted decorative heart sculpture with enough product detail for marketplace listing copy.",
  productType: "Home decor",
  vendor: "Q-Mer.ch",
  tags: ["Home Decor"],
  status: "ACTIVE",
  imageUrl: "https://cdn.example.test/heart.jpg",
  variants: [
    {
      id: "gid://shopify/ProductVariant/987654321",
      title: "Default Title",
      sku: "",
      price: "29.99",
      inventoryQuantity: 1,
      selectedOptions: []
    }
  ]
};

test("missing Shopify SKUs use QST export SKUs without blocking readiness", () => {
  const readiness = assessReadiness(productWithoutSku);
  const skuCheck = readiness.checks.find((check) => check.key === "sku");

  assert.equal(readiness.score, 100);
  assert.equal(skuCheck.ok, true);
  assert.equal(skuCheck.label, "Export SKU");
  assert.match(skuCheck.detail, /QST-generated export SKUs/);
});

test("drafts and exports include generated QST SKUs for read-only Shopify products", () => {
  const draft = createDraft(productWithoutSku, "ebay");
  const expectedSku = exportSku(productWithoutSku, productWithoutSku.variants[0], 0);

  assert.match(expectedSku, /^QST_/);
  assert.equal(draft.sku, expectedSku);

  const csv = buildEbayPrepCsv([productWithoutSku]);
  assert.match(csv, new RegExp(expectedSku));
  assert.doesNotMatch(csv, /SHOPIFY_/);

  const textPack = buildTextPack([productWithoutSku], "ebay");
  assert.match(textPack, new RegExp(`Export SKU: ${expectedSku}`));
});
