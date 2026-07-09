const TITLE_LIMITS = {
  ebay: 80,
  etsy: 140,
  vinted: 80,
  depop: 128,
  facebook: 100,
  gumtree: 100
};

const EBAY_CATEGORY_HINTS = [
  {
    label: "Home decor",
    keywords: ["home decor", "decorative", "ornament", "sculpture", "coaster", "jesmonite", "vase", "shelf", "wedding decor"]
  },
  {
    label: "Jewellery and watches",
    keywords: ["jewellery", "jewelry", "necklace", "pendant", "bracelet", "earring", "ring", "watch"]
  },
  {
    label: "Clothes, shoes and accessories",
    keywords: ["clothing", "shirt", "dress", "jacket", "shoe", "bag", "handbag", "fashion", "accessory"]
  },
  {
    label: "Health and beauty",
    keywords: ["beauty", "mascara", "makeup", "cosmetic", "skincare", "perfume", "fragrance"]
  },
  {
    label: "Collectables",
    keywords: ["collectable", "collectible", "figure", "figurine", "model", "memorabilia", "vintage"]
  },
  {
    label: "Garden and patio",
    keywords: ["garden", "patio", "outdoor", "planter", "plant pot"]
  },
  {
    label: "Business and office",
    keywords: ["office", "stationery", "desk", "organiser", "organizer"]
  }
];

export function createDraft(product, marketplace = "ebay") {
  const titleLimit = TITLE_LIMITS[marketplace] ?? 80;
  const title = smartTrim(product.title, titleLimit);
  const tags = collectTags(product);
  const variantText = summarizeVariants(product);
  const description = [
    product.description || `${product.title} prepared from Shopify product data.`,
    variantText ? `\nOptions available:\n${variantText}` : "",
    product.productType ? `\nCategory/type: ${product.productType}` : "",
    product.vendor ? `Brand/vendor: ${product.vendor}` : "",
    tags.length ? `Tags: ${tags.join(", ")}` : ""
  ]
    .filter(Boolean)
    .join("\n");

  return {
    marketplace,
    title,
    description,
    tags,
    price: product.variants?.[0]?.price ?? "",
    sku: product.variants?.[0]?.sku ?? "",
    imageUrl: product.imageUrl ?? ""
  };
}

export function assessEbayPrep(product) {
  const draft = createDraft(product, "ebay");
  const variants = product.variants?.length ? product.variants : [{}];
  const imageUrls = productImageUrls(product);
  const categoryHint = ebayCategoryHint(product);
  const variantOptionsReady =
    variants.length <= 1 ||
    variants.every((variant) =>
      (variant.selectedOptions ?? []).some((option) => usableOptionValue(option.value))
    );
  const variantsWithinLimit = variants.length <= 100;
  const hasPublishablePrice = variants.some((variant) => parsePrice(variant.price) >= 0.99);
  const hasShopifySku = variants.some((variant) => String(variant.sku || "").trim());

  const checks = [
    {
      key: "title",
      label: "eBay title",
      ok: Boolean(draft.title && draft.title.length <= TITLE_LIMITS.ebay),
      detail: "Title is within eBay's 80 character limit"
    },
    {
      key: "description",
      label: "Description",
      ok: Boolean(product.description && product.description.trim().length >= 30),
      detail: "Description has enough detail for marketplace copy"
    },
    {
      key: "images",
      label: "Images",
      ok: imageUrls.length > 0,
      detail: `${imageUrls.length} image URL${imageUrls.length === 1 ? "" : "s"} available for the pack`
    },
    {
      key: "price",
      label: "Price",
      ok: hasPublishablePrice,
      detail: "At least one variant meets the eBay minimum price"
    },
    {
      key: "sku",
      label: "SKU source",
      ok: true,
      detail: hasShopifySku
        ? "Uses Shopify SKUs where available"
        : "QST can generate SHOPIFY_ reference SKUs for export tracking"
    },
    {
      key: "variant_options",
      label: "Variants",
      ok: variantOptionsReady,
      detail:
        variants.length <= 1
          ? "Single listing row"
          : "Variant option values can be mapped into eBay rows"
    },
    {
      key: "variant_limit",
      label: "Variant limit",
      ok: variantsWithinLimit,
      detail: "eBay variation listings support up to 100 variants"
    },
    {
      key: "category",
      label: "Category hint",
      ok: categoryHint.confidence !== "none",
      detail:
        categoryHint.confidence === "none"
          ? "Needs seller category review before export or desktop publishing"
          : `${categoryHint.label} from Shopify title, type, tags, or description`
    },
    {
      key: "status",
      label: "Shopify status",
      ok: product.status === "ACTIVE",
      detail: "Product is active in Shopify"
    }
  ];

  const passed = checks.filter((check) => check.ok).length;
  const score = Math.round((passed / checks.length) * 100);
  const blockers = checks.filter((check) => !check.ok);

  return {
    checks,
    passed,
    total: checks.length,
    score,
    state: score >= 85 ? "ready" : score >= 60 ? "review" : "needs-work",
    blockers,
    categoryHint,
    imageCount: imageUrls.length,
    inventoryRows: variants.length
  };
}

export function assessReadiness(product) {
  const checks = [
    {
      key: "title",
      label: "Title",
      ok: Boolean(product.title && product.title.trim().length >= 8),
      detail: "Product title is present"
    },
    {
      key: "description",
      label: "Description",
      ok: Boolean(product.description && product.description.trim().length >= 30),
      detail: "Description has enough detail for marketplace copy"
    },
    {
      key: "image",
      label: "Image",
      ok: Boolean(product.imageUrl),
      detail: "At least one product image is available"
    },
    {
      key: "price",
      label: "Price",
      ok: Boolean(product.variants?.some((variant) => Number(variant.price) > 0)),
      detail: "At least one variant has a usable price"
    },
    {
      key: "sku",
      label: "SKU",
      ok: Boolean(product.variants?.some((variant) => String(variant.sku || "").trim())),
      detail: "A SKU is available for tracking"
    },
    {
      key: "status",
      label: "Status",
      ok: product.status === "ACTIVE",
      detail: "Product is active in Shopify"
    }
  ];

  const passed = checks.filter((check) => check.ok).length;
  const score = Math.round((passed / checks.length) * 100);

  return {
    checks,
    passed,
    total: checks.length,
    score,
    state: score >= 85 ? "ready" : score >= 55 ? "review" : "needs-work"
  };
}

export function buildEbayPrepSummary(products) {
  const summary = {
    total: products.length,
    ready: 0,
    review: 0,
    needsWork: 0,
    missingImages: 0,
    priceIssues: 0,
    categoryReview: 0,
    autoSkuRows: 0,
    inventoryRows: 0
  };

  for (const product of products) {
    const prep = assessEbayPrep(product);
    const variants = product.variants?.length ? product.variants : [{}];
    summary.inventoryRows += prep.inventoryRows;

    if (prep.state === "ready") {
      summary.ready += 1;
    } else if (prep.state === "review") {
      summary.review += 1;
    } else {
      summary.needsWork += 1;
    }

    if (!prep.checks.find((check) => check.key === "images")?.ok) {
      summary.missingImages += 1;
    }

    if (!prep.checks.find((check) => check.key === "price")?.ok) {
      summary.priceIssues += 1;
    }

    if (!prep.checks.find((check) => check.key === "category")?.ok) {
      summary.categoryReview += 1;
    }

    summary.autoSkuRows += variants.filter((variant) => !String(variant.sku || "").trim()).length;
  }

  return summary;
}

export function buildEbayPrepCsv(products, draftOverrides = {}) {
  const rows = [
    [
      "action",
      "shopify_product_id",
      "shopify_variant_id",
      "handle",
      "ebay_title",
      "ebay_description",
      "price",
      "sku",
      "quantity",
      "variant_options",
      "image_urls",
      "category_search_hint",
      "category_hint_source",
      "readiness_score",
      "review_items"
    ]
  ];

  for (const product of products) {
    const draft = draftOverrides[product.id] || createDraft(product, "ebay");
    const prep = assessEbayPrep(product);
    const imageUrls = productImageUrls(product);
    const variants = product.variants?.length ? product.variants : [{}];
    const reviewItems = prep.blockers.map((check) => check.label).join("; ");

    variants.forEach((variant, index) => {
      rows.push([
        prep.state === "ready" ? "ready_for_ebay_review" : "needs_review",
        product.id,
        variant.id || "",
        product.handle || "",
        draft.title,
        draft.description,
        variant.price || draft.price || "",
        variant.sku || generatedSku(product, variant, index),
        normalizedQuantity(variant.inventoryQuantity),
        variantOptionsText(variant),
        imageUrls.join(" | "),
        prep.categoryHint.label,
        prep.categoryHint.source,
        String(prep.score),
        reviewItems
      ]);
    });
  }

  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

export function buildEbayPublishPlan(products, ebaySettings = {}, draftOverrides = {}) {
  const setup = normalizeEbaySetup(ebaySettings);
  const setupMissing = ebaySetupMissing(setup);

  return JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      mode: "ebay_publish_plan",
      callsEbayApi: false,
      purpose:
        "Review the eBay Inventory API sequence QST would use after eBay seller setup is complete. This file does not publish listings.",
      setup: {
        ready: setupMissing.length === 0,
        missing: setupMissing,
        defaultCategoryLabel: setup.defaultCategoryLabel || "",
        notes: setup.notes || ""
      },
      workflow: [
        {
          step: "create_or_replace_inventory_item",
          method: "PUT",
          endpointTemplate: "/sell/inventory/v1/inventory_item/{sku}",
          reviewRequired: ["condition", "quantity", "image URLs", "item specifics"]
        },
        {
          step: "create_offer",
          method: "POST",
          endpointTemplate: "/sell/inventory/v1/offer",
          reviewRequired: ["categoryId", "merchantLocationKey", "paymentPolicyId", "returnPolicyId", "fulfillmentPolicyId"]
        },
        {
          step: "publish_offer",
          method: "POST",
          endpointTemplate: "/sell/inventory/v1/offer/{offerId}/publish",
          reviewRequired: ["seller approval before making the listing live"]
        }
      ],
      products: products.map((product) => ebayPublishPlanProduct(product, setup, draftOverrides[product.id]))
    },
    null,
    2
  );
}

export function buildEbayReviewPlan(products, ebaySettings = {}, draftOverrides = {}) {
  const setup = normalizeEbaySetup(ebaySettings);
  const setupMissing = ebayExportSetupMissing(setup);

  return JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      mode: "ebay_export_review_plan",
      callsEbayApi: false,
      purpose:
        "Review Shopify product data, eBay-compatible draft fields, and seller notes before importing a CSV or continuing in QST Desktop. This file does not connect to or publish on eBay.",
      setup: {
        ready: setupMissing.length === 0,
        missing: setupMissing,
        defaultCategoryLabel: setup.defaultCategoryLabel || "",
        notes: setup.notes || ""
      },
      products: products.map((product) => ebayReviewPlanProduct(product, setup, draftOverrides[product.id]))
    },
    null,
    2
  );
}

export function buildTextPack(products, marketplace = "ebay", draftOverrides = {}) {
  return products
    .map((product, index) => {
      const draft = draftOverrides[product.id] || createDraft(product, marketplace);
      const readiness = assessReadiness(product);
      return [
        `# ${index + 1}. ${draft.title}`,
        "",
        `Marketplace: ${marketplaceLabel(marketplace)}`,
        `Shopify product: ${product.title}`,
        `Handle: ${product.handle || "-"}`,
        `Readiness: ${readiness.passed}/${readiness.total} checks`,
        `Price: ${draft.price || "-"}`,
        `SKU: ${draft.sku || "-"}`,
        "",
        "Description:",
        draft.description,
        "",
        `Tags: ${draft.tags.join(", ") || "-"}`,
        `Image: ${draft.imageUrl || "-"}`
      ].join("\n");
    })
    .join("\n\n---\n\n");
}

export function buildWorkspacePack(products, marketplace = "ebay", draftOverrides = {}) {
  const label = marketplaceLabel(marketplace);
  const pack = {
    generatedAt: new Date().toISOString(),
    mode: "qst_workspace_pack",
    marketplace: label,
    note:
      "Browser-generated pack from read-only Shopify data. Image files are represented by source URLs; no Shopify product data is changed.",
    products: products.map((product, index) => workspacePackProduct(product, marketplace, draftOverrides[product.id], index))
  };

  return JSON.stringify(pack, null, 2);
}

export function buildCsv(products, marketplace = "ebay", draftOverrides = {}) {
  const rows = [
    [
      "marketplace",
      "shopify_product_id",
      "handle",
      "title",
      "description",
      "tags",
      "price",
      "sku",
      "image_url",
      "readiness_score"
    ]
  ];

  for (const product of products) {
    const draft = draftOverrides[product.id] || createDraft(product, marketplace);
    const readiness = assessReadiness(product);
    rows.push([
      marketplaceLabel(marketplace),
      product.id,
      product.handle,
      draft.title,
      draft.description,
      draft.tags.join(", "),
      draft.price,
      draft.sku,
      draft.imageUrl,
      String(readiness.score)
    ]);
  }

  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

export function marketplaceLabel(value) {
  return (
    {
      ebay: "eBay",
      etsy: "Etsy",
      vinted: "Vinted",
      depop: "Depop",
      facebook: "Facebook Marketplace",
      gumtree: "Gumtree"
    }[value] ?? value
  );
}

export function ebayCategoryHint(product) {
  const haystack = [
    product.title,
    product.productType,
    product.vendor,
    product.description,
    ...(product.tags ?? [])
  ]
    .join(" ")
    .toLowerCase();

  for (const hint of EBAY_CATEGORY_HINTS) {
    const match = hint.keywords.find((keyword) => haystack.includes(keyword));
    if (match) {
      return {
        label: hint.label,
        source: `keyword:${match}`,
        confidence: "medium"
      };
    }
  }

  return {
    label: "Seller category review needed",
    source: "no_hint",
    confidence: "none"
  };
}

function collectTags(product) {
  const base = Array.isArray(product.tags) ? product.tags : [];
  const generated = [
    product.productType,
    product.vendor,
    ...(product.variants ?? []).flatMap((variant) =>
      (variant.selectedOptions ?? []).map((option) => option.value)
    )
  ];

  return [...base, ...generated]
    .map((tag) => String(tag || "").trim())
    .filter(Boolean)
    .filter((tag, index, all) => all.findIndex((candidate) => candidate.toLowerCase() === tag.toLowerCase()) === index)
    .slice(0, 20);
}

function productImageUrls(product) {
  return [
    product.imageUrl,
    ...(product.images ?? []).map((image) => image.url)
  ]
    .map((url) => String(url || "").trim())
    .filter(Boolean)
    .filter((url, index, all) => all.indexOf(url) === index)
    .slice(0, 12);
}

function workspacePackProduct(product, marketplace, draftOverride, index) {
  const draft = draftOverride || createDraft(product, marketplace);
  const readiness = assessReadiness(product);
  const imageManifest = productImageUrls(product).map((url, imageIndex) => ({
    index: imageIndex + 1,
    role: imageIndex === 0 ? "primary" : "gallery",
    sourceUrl: url,
    suggestedFilename: `${slugify(product.title || product.handle || `product-${index + 1}`)}-${imageIndex + 1}.jpg`
  }));
  const variants = product.variants?.length ? product.variants : [{}];

  return {
    folderName: slugify(product.title || product.handle || `product-${index + 1}`),
    files: {
      listingPack: "listing_pack.txt",
      marketplaceListing: `listing_${slugify(marketplaceLabel(marketplace))}.txt`,
      promoPage: "promo_page.html",
      imageManifest: "image_manifest.json"
    },
    source: {
      shopifyProductId: product.id,
      handle: product.handle || "",
      status: product.status || "",
      productType: product.productType || "",
      vendor: product.vendor || ""
    },
    readiness: {
      score: readiness.score,
      passed: readiness.passed,
      total: readiness.total,
      reviewItems: readiness.checks.filter((check) => !check.ok).map((check) => check.label)
    },
    listing: {
      marketplace: marketplaceLabel(marketplace),
      title: draft.title,
      description: draft.description,
      tags: draft.tags,
      price: draft.price || "",
      sku: draft.sku || ""
    },
    variants: variants.map((variant, variantIndex) => ({
      index: variantIndex + 1,
      shopifyVariantId: variant.id || "",
      title: variant.title || "",
      sku: variant.sku || generatedSku(product, variant, variantIndex),
      price: variant.price || "",
      quantity: normalizedQuantity(variant.inventoryQuantity),
      options: variantOptionsText(variant)
    })),
    images: {
      originalImageCount: imageManifest.length,
      backgroundRemovedImageCount: 0,
      browserPackLimitation:
        "The Shopify app exports image source URLs. Use QST Desktop for local image downloads and background-removed image variants.",
      manifest: imageManifest
    },
    promoPageHtml: buildPromoPageHtml(product, draft, imageManifest, marketplace)
  };
}

function buildPromoPageHtml(product, draft, imageManifest, marketplace) {
  const hero = imageManifest[0]?.sourceUrl || "";
  const title = escapeHtmlText(draft.title || product.title || "Marketplace listing");
  const description = escapeHtmlText(draft.description || "");
  const tags = (draft.tags || []).map(escapeHtmlText).join(", ");
  const imageMarkup = hero
    ? `<img src="${escapeHtmlText(hero)}" alt="${title}">`
    : "<span>No image available</span>";

  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${title}</title>`,
    "<style>",
    "body{font-family:Arial,sans-serif;margin:0;background:#f6f6f7;color:#202223}",
    ".wrap{max-width:920px;margin:0 auto;padding:32px}",
    ".hero{display:grid;grid-template-columns:minmax(0,1fr) minmax(260px,360px);gap:24px;align-items:start}",
    ".media{border:1px solid #ddd;border-radius:8px;overflow:hidden;background:#fff;min-height:260px;display:flex;align-items:center;justify-content:center}",
    ".media img{width:100%;height:100%;object-fit:cover}",
    ".meta{color:#5c5f62}.box{margin-top:24px;border:1px solid #ddd;border-radius:8px;background:#fff;padding:18px}",
    "</style>",
    "</head>",
    "<body>",
    '<main class="wrap">',
    '<section class="hero">',
    "<div>",
    `<p class="meta">${escapeHtmlText(marketplaceLabel(marketplace))} draft from Shopify product data</p>`,
    `<h1>${title}</h1>`,
    `<p>${description.replace(/\n/g, "<br>")}</p>`,
    `<p class="meta">Price: ${escapeHtmlText(draft.price || "-")} | SKU: ${escapeHtmlText(draft.sku || "-")}</p>`,
    "</div>",
    `<div class="media">${imageMarkup}</div>`,
    "</section>",
    '<section class="box">',
    "<h2>Listing notes</h2>",
    `<p><strong>Shopify handle:</strong> ${escapeHtmlText(product.handle || "-")}</p>`,
    `<p><strong>Product type:</strong> ${escapeHtmlText(product.productType || "-")}</p>`,
    `<p><strong>Tags:</strong> ${tags || "-"}</p>`,
    `<p><strong>Images:</strong> ${imageManifest.length}</p>`,
    "</section>",
    "</main>",
    "</body>",
    "</html>"
  ].join("");
}

function ebayPublishPlanProduct(product, setup, draftOverride) {
  const draft = draftOverride || createDraft(product, "ebay");
  const prep = assessEbayPrep(product);
  const imageUrls = productImageUrls(product);
  const variants = product.variants?.length ? product.variants : [{}];
  const categoryLabel = setup.defaultCategoryReady && setup.defaultCategoryLabel
    ? setup.defaultCategoryLabel
    : prep.categoryHint.label;

  return {
    shopifyProductId: product.id,
    handle: product.handle || "",
    sourceTitle: product.title,
    readiness: {
      state: prep.state,
      score: prep.score,
      reviewItems: prep.blockers.map((check) => check.label)
    },
    category: {
      searchHint: categoryLabel,
      hintSource: prep.categoryHint.source,
      sellerFallbackConfirmed: Boolean(setup.defaultCategoryReady)
    },
    inventoryItems: variants.map((variant, index) => {
      const sku = variant.sku || generatedSku(product, variant, index);
      return {
        sku,
        shopifyVariantId: variant.id || "",
        createOrReplaceInventoryItem: {
          endpoint: `/sell/inventory/v1/inventory_item/${sku}`,
          title: draft.title,
          description: draft.description,
          imageUrls,
          price: variant.price || draft.price || "",
          quantity: normalizedQuantity(variant.inventoryQuantity),
          variantOptions: variantOptionsText(variant),
          itemSpecifics: {
            productType: product.productType || "",
            vendor: product.vendor || "",
            tags: collectTags(product)
          }
        },
        createOffer: {
          endpoint: "/sell/inventory/v1/offer",
          marketplaceId: "EBAY_GB",
          format: "FIXED_PRICE",
          requiredSellerValues: {
            categoryId: setup.defaultCategoryReady ? "seller_confirmed_or_taxonomy_result" : "required_before_publish",
            merchantLocationKey: setup.dispatchLocationReady ? "seller_confirmed" : "required_before_publish",
            paymentPolicyId: setup.businessPoliciesReady ? "seller_confirmed" : "required_before_publish",
            returnPolicyId: setup.businessPoliciesReady ? "seller_confirmed" : "required_before_publish",
            fulfillmentPolicyId: setup.businessPoliciesReady ? "seller_confirmed" : "required_before_publish"
          }
        },
        publishOffer: {
          endpoint: "/sell/inventory/v1/offer/{offerId}/publish",
          allowedWhen: prep.state === "ready" && ebaySetupMissing(setup).length === 0
        }
      };
    })
  };
}

function ebayReviewPlanProduct(product, setup, draftOverride) {
  const draft = draftOverride || createDraft(product, "ebay");
  const prep = assessEbayPrep(product);
  const imageUrls = productImageUrls(product);
  const variants = product.variants?.length ? product.variants : [{}];
  const categoryLabel = setup.defaultCategoryReady && setup.defaultCategoryLabel
    ? setup.defaultCategoryLabel
    : prep.categoryHint.label;

  return {
    shopifyProductId: product.id,
    handle: product.handle || "",
    sourceTitle: product.title,
    draft: {
      title: draft.title,
      description: draft.description,
      price: draft.price || "",
      sku: draft.sku || "",
      tags: Array.isArray(draft.tags) ? draft.tags : collectTags(product),
      primaryImageUrl: draft.imageUrl || product.imageUrl || imageUrls[0] || ""
    },
    readiness: {
      state: prep.state,
      score: prep.score,
      reviewItems: prep.blockers.map((check) => check.label)
    },
    category: {
      searchHint: categoryLabel,
      hintSource: prep.categoryHint.source,
      sellerFallbackConfirmed: Boolean(setup.defaultCategoryReady)
    },
    images: imageUrls,
    exportRows: variants.map((variant, index) => ({
      sku: variant.sku || generatedSku(product, variant, index),
      shopifyVariantId: variant.id || "",
      title: draft.title,
      price: variant.price || draft.price || "",
      quantity: normalizedQuantity(variant.inventoryQuantity),
      variantOptions: variantOptionsText(variant),
      sellerReview: {
        category: setup.defaultCategoryReady ? "confirmed_or_taxonomy_result" : "review_before_import",
        dispatchLocation: setup.dispatchLocationReady ? "confirmed" : "review_before_import",
        policies: setup.businessPoliciesReady ? "confirmed" : "review_before_import"
      }
    }))
  };
}

function normalizeEbaySetup(input) {
  return {
    sellerAccountConnected: Boolean(input.sellerAccountConnected),
    businessPoliciesReady: Boolean(input.businessPoliciesReady),
    dispatchLocationReady: Boolean(input.dispatchLocationReady),
    defaultCategoryReady: Boolean(input.defaultCategoryReady),
    defaultCategoryLabel: String(input.defaultCategoryLabel || "").trim(),
    notes: String(input.notes || "").trim()
  };
}

function ebaySetupMissing(setup) {
  return [
    setup.sellerAccountConnected ? "" : "eBay seller account connection",
    setup.businessPoliciesReady ? "" : "payment, return, and fulfilment policies",
    setup.dispatchLocationReady ? "" : "dispatch country/postcode",
    setup.defaultCategoryReady ? "" : "fallback category"
  ].filter(Boolean);
}

function ebayExportSetupMissing(setup) {
  return [
    setup.businessPoliciesReady ? "" : "payment, return, and fulfilment policy notes",
    setup.dispatchLocationReady ? "" : "dispatch country/postcode",
    setup.defaultCategoryReady ? "" : "fallback category"
  ].filter(Boolean);
}

function parsePrice(value) {
  const number = Number(String(value ?? "").replace(/[^0-9.]+/g, ""));
  return Number.isFinite(number) ? number : 0;
}

function usableOptionValue(value) {
  const text = String(value || "").trim().toLowerCase();
  return Boolean(text && text !== "default" && text !== "default title");
}

function generatedSku(product, variant, index) {
  const productToken = skuToken(shopifyIdTail(product.id) || product.handle || product.title || "PRODUCT");
  const variantToken = skuToken(shopifyIdTail(variant.id) || variant.title || String(index + 1));
  return variantsAreMeaningful(product) ? `SHOPIFY_${productToken}_${variantToken}`.slice(0, 50) : `SHOPIFY_${productToken}`.slice(0, 50);
}

function variantsAreMeaningful(product) {
  return (product.variants ?? []).length > 1;
}

function shopifyIdTail(value) {
  return String(value || "").split("/").filter(Boolean).pop() || "";
}

function skuToken(value) {
  const token = String(value || "")
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "");
  return token.slice(0, 40) || "SKU";
}

function normalizedQuantity(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return "1";
  }

  return String(Math.max(0, Math.floor(number)));
}

function variantOptionsText(variant) {
  return (variant.selectedOptions ?? [])
    .filter((option) => usableOptionValue(option.value))
    .map((option) => `${option.name}: ${option.value}`)
    .join(" | ");
}

function summarizeVariants(product) {
  const variants = product.variants ?? [];
  if (variants.length <= 1) {
    return "";
  }

  return variants
    .slice(0, 10)
    .map((variant) => {
      const options = (variant.selectedOptions ?? [])
        .map((option) => `${option.name}: ${option.value}`)
        .join(", ");
      return `- ${options || variant.title}${variant.sku ? ` (${variant.sku})` : ""}`;
    })
    .join("\n");
}

function smartTrim(value, limit) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= limit) {
    return text;
  }

  const clipped = text.slice(0, limit + 1);
  const lastSpace = clipped.lastIndexOf(" ");
  return `${clipped.slice(0, lastSpace > 40 ? lastSpace : limit).trim()}...`;
}

function slugify(value) {
  return String(value || "listing")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "listing";
}

function escapeHtmlText(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function csvCell(value) {
  const text = String(value ?? "").replace(/\r?\n/g, " ");
  return `"${text.replace(/"/g, '""')}"`;
}
