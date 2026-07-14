import { demoProducts, screenshotProducts } from "./demo-products.js";

const PRODUCTS_QUERY = `
  query QstProducts($first: Int!, $after: String) {
    products(first: $first, after: $after, sortKey: UPDATED_AT, reverse: true) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        title
        handle
        status
        vendor
        productType
        tags
        descriptionHtml
        updatedAt
        featuredMedia {
          preview {
            image {
              url
              altText
            }
          }
        }
        images(first: 12) {
          nodes {
            url
            altText
          }
        }
        variants(first: 10) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            id
            title
            sku
            price
            inventoryQuantity
            selectedOptions {
              name
              value
            }
          }
        }
      }
    }
  }
`;

const PRODUCT_VARIANTS_QUERY = `
  query QstProductVariants($id: ID!, $after: String) {
    product(id: $id) {
      variants(first: 250, after: $after) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
          title
          sku
          price
          inventoryQuantity
          selectedOptions {
            name
            value
          }
        }
      }
    }
  }
`;

const BILLING_QUERY = `
  query QstCurrentAppInstallation {
    currentAppInstallation {
      activeSubscriptions {
        id
        name
        status
        currentPeriodEnd
        trialDays
      }
    }
  }
`;

export async function loadProducts({ demoMode, screenshotMode = false }) {
  if (!isEmbeddedShopifyContext()) {
    if (screenshotMode) {
      return {
        source: "screenshot",
        products: screenshotProducts,
        pageInfo: { hasNextPage: false, endCursor: null }
      };
    }

    if (demoMode) {
      return {
        source: "demo",
        products: demoProducts,
        pageInfo: { hasNextPage: false, endCursor: null }
      };
    }

    throw new Error(import.meta.env.DEV
      ? "Open this dashboard inside Shopify Admin, or use the local development preview."
      : "Open this dashboard inside Shopify Admin to load store products securely.");
  }

  const productNodes = await collectConnectionPages(async (after) => {
    const payload = await shopifyAdminGraphql(PRODUCTS_QUERY, {
      first: 25,
      after
    }, "product");
    return payload.data?.products;
  });

  for (const product of productNodes) {
    const initialVariants = product.variants || { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } };
    if (!initialVariants.pageInfo?.hasNextPage) {
      continue;
    }

    const remainingVariants = await collectConnectionPages(async (after) => {
      const payload = await shopifyAdminGraphql(PRODUCT_VARIANTS_QUERY, {
        id: product.id,
        after
      }, "variant");
      return payload.data?.product?.variants;
    }, initialVariants.pageInfo.endCursor);
    product.variants.nodes.push(...remainingVariants);
    product.variants.pageInfo = { hasNextPage: false, endCursor: null };
  }

  const products = productNodes.map(mapProduct);

  return {
    source: "shopify",
    products,
    pageInfo: { hasNextPage: false, endCursor: null }
  };
}

export async function collectConnectionPages(fetchPage, initialAfter = null) {
  const nodes = [];
  let after = initialAfter;

  do {
    const connection = await fetchPage(after);
    if (!connection) {
      throw new Error("Shopify returned an incomplete paginated response.");
    }

    nodes.push(...(connection.nodes || []));
    if (!connection.pageInfo?.hasNextPage) {
      return nodes;
    }

    const nextCursor = connection.pageInfo.endCursor;
    if (!nextCursor || nextCursor === after) {
      throw new Error("Shopify pagination did not provide a new cursor.");
    }
    after = nextCursor;
  } while (true);
}

async function shopifyAdminGraphql(query, variables, resourceLabel) {
  const response = await fetch("shopify:admin/api/2026-07/graphql.json", {
    method: "POST",
    body: JSON.stringify({ query, variables })
  });

  if (!response.ok) {
    throw new Error(`Shopify ${resourceLabel} request failed with ${response.status}.`);
  }

  const payload = await response.json();
  if (payload.errors?.length) {
    throw new Error(payload.errors.map((error) => error.message).join(" "));
  }
  return payload;
}

export async function loadBillingStatus({ demoMode, screenshotMode = false }) {
  if (!isEmbeddedShopifyContext()) {
    const previewActive = demoMode || screenshotMode;
    return {
      source: screenshotMode ? "screenshot" : demoMode ? "demo" : "local",
      active: previewActive,
      subscriptions: previewActive
        ? [
            {
              id: screenshotMode ? "screenshot-subscription" : "demo-subscription",
              name: screenshotMode ? "QST Full Access" : "Development preview",
              status: "ACTIVE",
              currentPeriodEnd: null,
              trialDays: 0
            }
          ]
        : []
    };
  }

  const response = await fetch("shopify:admin/api/2026-07/graphql.json", {
    method: "POST",
    body: JSON.stringify({
      query: BILLING_QUERY
    })
  });

  if (!response.ok) {
    throw new Error(`Shopify subscription request failed with ${response.status}.`);
  }

  const payload = await response.json();
  if (payload.errors?.length) {
    throw new Error(payload.errors.map((error) => error.message).join(" "));
  }

  const subscriptions = payload.data?.currentAppInstallation?.activeSubscriptions ?? [];
  return {
    source: "shopify",
    active: subscriptions.some((subscription) => subscription.status === "ACTIVE"),
    subscriptions
  };
}

export async function getShopifyIdToken() {
  if (!isEmbeddedShopifyContext() || typeof window.shopify.idToken !== "function") {
    return "";
  }

  try {
    return await window.shopify.idToken();
  } catch {
    return "";
  }
}

export function isEmbeddedShopifyContext() {
  return typeof window !== "undefined" && typeof window.shopify !== "undefined";
}

function mapProduct(product) {
  const images = product.images?.nodes ?? [];
  const featuredImage = product.featuredMedia?.preview?.image?.url;

  return {
    id: product.id,
    title: product.title ?? "",
    handle: product.handle ?? "",
    status: product.status ?? "",
    vendor: product.vendor ?? "",
    productType: product.productType ?? "",
    tags: product.tags ?? [],
    description: stripHtml(product.descriptionHtml ?? ""),
    imageUrl: featuredImage || images[0]?.url || "",
    images: images.map((image) => ({
      url: image.url,
      altText: image.altText ?? ""
    })),
    variants: (product.variants?.nodes ?? []).map((variant) => ({
      id: variant.id,
      title: variant.title ?? "",
      sku: variant.sku ?? "",
      price: variant.price ?? "",
      inventoryQuantity: variant.inventoryQuantity,
      selectedOptions: variant.selectedOptions ?? []
    })),
    updatedAt: product.updatedAt ?? ""
  };
}

function stripHtml(html) {
  if (typeof document === "undefined") {
    return String(html).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  }
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent || div.innerText || "";
}
