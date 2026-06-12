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
          ? "Needs seller category review before publishing"
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

function csvCell(value) {
  const text = String(value ?? "").replace(/\r?\n/g, " ");
  return `"${text.replace(/"/g, '""')}"`;
}
