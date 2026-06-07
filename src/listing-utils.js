const TITLE_LIMITS = {
  ebay: 80,
  etsy: 140,
  vinted: 80,
  depop: 128,
  facebook: 100,
  gumtree: 100
};

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
