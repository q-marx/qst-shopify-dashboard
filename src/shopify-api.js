import { demoProducts } from "./demo-products.js";

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
        images(first: 4) {
          nodes {
            url
            altText
          }
        }
        variants(first: 20) {
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

export async function loadProducts({ demoMode }) {
  if (!isEmbeddedShopifyContext()) {
    if (demoMode) {
      return {
        source: "demo",
        products: demoProducts,
        pageInfo: { hasNextPage: false, endCursor: null }
      };
    }

    throw new Error(
      "Open this dashboard inside Shopify Admin, or enable VITE_QST_DEMO_MODE for local preview."
    );
  }

  const response = await fetch("shopify:admin/api/graphql.json", {
    method: "POST",
    body: JSON.stringify({
      query: PRODUCTS_QUERY,
      variables: {
        first: 50,
        after: null
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Shopify product request failed with ${response.status}.`);
  }

  const payload = await response.json();
  if (payload.errors?.length) {
    throw new Error(payload.errors.map((error) => error.message).join(" "));
  }

  const products = payload.data.products.nodes.map(mapProduct);

  return {
    source: "shopify",
    products,
    pageInfo: payload.data.products.pageInfo
  };
}

export async function loadBillingStatus({ demoMode }) {
  if (!isEmbeddedShopifyContext()) {
    return {
      source: demoMode ? "demo" : "local",
      active: demoMode,
      subscriptions: demoMode
        ? [
            {
              id: "demo-subscription",
              name: "Development preview",
              status: "ACTIVE",
              currentPeriodEnd: null,
              trialDays: 0
            }
          ]
        : []
    };
  }

  const response = await fetch("shopify:admin/api/graphql.json", {
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
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent || div.innerText || "";
}
