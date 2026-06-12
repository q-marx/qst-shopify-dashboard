import {
  assessEbayPrep,
  assessReadiness,
  buildCsv,
  buildEbayPrepCsv,
  buildEbayPrepSummary,
  buildTextPack,
  createDraft,
  marketplaceLabel
} from "./listing-utils.js";
import { getShopifyIdToken, isEmbeddedShopifyContext, loadBillingStatus, loadProducts } from "./shopify-api.js";
import "./styles.css";

const demoMode = import.meta.env.VITE_QST_DEMO_MODE !== "false";

const state = {
  products: [],
  filteredProducts: [],
  selectedIds: new Set(),
  draftOverrides: new Map(),
  activeProductId: null,
  marketplace: "ebay",
  query: "",
  readinessFilter: "all",
  statusFilter: "all",
  source: "loading",
  loading: false,
  error: "",
  account: null,
  accountLoading: false,
  accountError: "",
  billing: null,
  billingLoading: false,
  billingError: "",
  pairing: null,
  pairingLoading: false,
  pairingError: ""
};

const app = document.querySelector("#app");

renderShell();
refreshProducts();
refreshAccount();

async function refreshProducts() {
  state.loading = true;
  state.error = "";
  render();

  try {
    const result = await loadProducts({ demoMode });
    state.products = result.products;
    state.source = result.source;
    state.selectedIds = new Set();
    state.activeProductId = state.products[0]?.id ?? null;
    applyFilters();
  } catch (error) {
    state.error = error.message || "Could not load products.";
  } finally {
    state.loading = false;
    render();
  }
}

async function refreshAccount() {
  state.accountLoading = true;
  state.billingLoading = true;
  state.accountError = "";
  state.billingError = "";
  renderAccountPanel();

  try {
    state.account = await backendRequest(`/api/account${accountContextQuery()}`);
  } catch (error) {
    state.accountError = error.message || "Could not load account status.";
  } finally {
    state.accountLoading = false;
    renderAccountPanel();
  }

  try {
    state.billing = await loadBillingStatus({ demoMode });
  } catch (error) {
    state.billingError = isEmbeddedShopifyContext()
      ? "Subscription status could not be checked in this preview."
      : "Subscription status is shown when opened inside Shopify Admin.";
  } finally {
    state.billingLoading = false;
    renderAccountPanel();
  }
}

function renderShell() {
  app.innerHTML = `
    <main class="app-shell">
      <section class="hero-band">
        <div>
          <p class="eyebrow">Read-only Shopify product workspace</p>
          <h1>Prepare marketplace listing drafts inside Shopify Admin.</h1>
          <p class="hero-copy">
            Search products, review readiness, adjust listing copy, and export marketplace-ready packs from inside Shopify Admin.
          </p>
        </div>
        <div class="source-card" id="source-card"></div>
      </section>

      <section class="metrics-grid" id="metrics"></section>

      <section class="account-grid" id="account-panel"></section>

      <section class="workflow-panel" id="ebay-workflow"></section>

      <section class="toolbar">
        <label class="search-field">
          <span>Search</span>
          <input id="search-input" type="search" placeholder="Title, SKU, tag, type..." autocomplete="off" />
        </label>
        <label>
          <span>Readiness</span>
          <select id="readiness-filter">
            <option value="all">All products</option>
            <option value="ready">Ready</option>
            <option value="review">Needs review</option>
            <option value="needs-work">Needs work</option>
          </select>
        </label>
        <label>
          <span>Status</span>
          <select id="status-filter">
            <option value="all">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="DRAFT">Draft</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        </label>
        <label>
          <span>Pack target</span>
          <select id="marketplace-select">
            <option value="ebay">eBay</option>
            <option value="etsy">Etsy</option>
            <option value="vinted">Vinted</option>
            <option value="depop">Depop</option>
            <option value="facebook">Facebook Marketplace</option>
            <option value="gumtree">Gumtree</option>
          </select>
        </label>
        <button class="secondary-button" id="select-ready">Select ready</button>
        <button class="secondary-button" id="refresh-button">Refresh</button>
      </section>

      <section class="workspace-grid">
        <div class="panel product-panel">
          <div class="panel-heading">
            <div>
              <h2>Products</h2>
              <p id="product-count">No products loaded yet.</p>
            </div>
            <button class="text-button" id="clear-selection">Clear selection</button>
          </div>
          <div class="product-list" id="product-list"></div>
        </div>

        <aside class="panel draft-panel">
          <div class="panel-heading">
            <div>
              <h2>Listing draft</h2>
              <p id="draft-subtitle">Select a product to review.</p>
            </div>
          </div>
          <div id="draft-content"></div>
        </aside>
      </section>

      <section class="export-bar">
        <div>
          <strong id="selected-summary">No products selected</strong>
          <p>Exports are generated in your browser from read-only Shopify product data and your current draft settings.</p>
        </div>
        <div class="export-actions">
          <button class="secondary-button" id="export-csv">Download CSV</button>
          <button class="primary-button" id="export-pack">Download listing pack</button>
        </div>
      </section>
    </main>
  `;

  bindControls();
}

function bindControls() {
  document.querySelector("#search-input").addEventListener("input", (event) => {
    state.query = event.target.value;
    applyFilters();
    render();
  });
  document.querySelector("#readiness-filter").addEventListener("change", (event) => {
    state.readinessFilter = event.target.value;
    applyFilters();
    render();
  });
  document.querySelector("#status-filter").addEventListener("change", (event) => {
    state.statusFilter = event.target.value;
    applyFilters();
    render();
  });
  document.querySelector("#marketplace-select").addEventListener("change", (event) => {
    state.marketplace = event.target.value;
    render();
  });
  document.querySelector("#select-ready").addEventListener("click", () => {
    state.selectedIds = new Set(
      state.filteredProducts
        .filter((product) => assessReadiness(product).state === "ready")
        .map((product) => product.id)
    );
    render();
  });
  document.querySelector("#refresh-button").addEventListener("click", refreshProducts);
  document.querySelector("#clear-selection").addEventListener("click", () => {
    state.selectedIds.clear();
    render();
  });
  document.querySelector("#export-csv").addEventListener("click", () => {
    exportSelected("csv");
  });
  document.querySelector("#export-pack").addEventListener("click", () => {
    exportSelected("txt");
  });
}

function applyFilters() {
  const query = state.query.trim().toLowerCase();
  state.filteredProducts = state.products.filter((product) => {
    const readiness = assessReadiness(product);
    const haystack = [
      product.title,
      product.handle,
      product.vendor,
      product.productType,
      product.status,
      ...(product.tags ?? []),
      ...(product.variants ?? []).flatMap((variant) => [variant.sku, variant.title])
    ]
      .join(" ")
      .toLowerCase();

    return (
      (!query || haystack.includes(query)) &&
      (state.readinessFilter === "all" || readiness.state === state.readinessFilter) &&
      (state.statusFilter === "all" || product.status === state.statusFilter)
    );
  });

  if (!state.filteredProducts.some((product) => product.id === state.activeProductId)) {
    state.activeProductId = state.filteredProducts[0]?.id ?? null;
  }
}

function render() {
  renderSourceCard();
  renderMetrics();
  renderAccountPanel();
  renderEbayWorkflow();
  renderProducts();
  renderDraft();
  renderExportSummary();
}

function renderSourceCard() {
  const embedded = isEmbeddedShopifyContext();
  const sourceLabel = embedded
    ? "Shopify Admin"
    : demoMode
      ? state.source === "demo"
        ? "Demo data"
        : "Loading"
      : "Shopify Admin required";
  const sourceDescription = embedded
    ? "Using App Bridge direct GraphQL access with read-only product scope."
    : demoMode
      ? "Previewing dashboard behavior with sample products."
      : "Open this app inside Shopify Admin to load store products securely.";

  document.querySelector("#source-card").innerHTML = `
    <span class="status-pill ${embedded ? "ok" : "demo"}">${embedded ? "Embedded" : demoMode ? "Local preview" : "Direct view"}</span>
    <h2>${sourceLabel}</h2>
    <p>${sourceDescription}</p>
  `;
}

function renderMetrics() {
  const ready = state.products.filter((product) => assessReadiness(product).state === "ready").length;
  const review = state.products.filter((product) => assessReadiness(product).state === "review").length;
  const needsWork = state.products.filter((product) => assessReadiness(product).state === "needs-work").length;
  const variants = state.products.reduce((total, product) => total + (product.variants?.length ?? 0), 0);

  document.querySelector("#metrics").innerHTML = [
    metric("Products loaded", state.products.length),
    metric("Ready to export", ready),
    metric("Needs review", review),
    metric("Needs work", needsWork),
    metric("Variants visible", variants)
  ].join("");
}

function metric(label, value) {
  return `
    <article class="metric-card">
      <span>${label}</span>
      <strong>${value}</strong>
    </article>
  `;
}

function renderEbayWorkflow() {
  const panel = document.querySelector("#ebay-workflow");
  if (!panel) {
    return;
  }

  if (state.marketplace !== "ebay") {
    panel.hidden = true;
    panel.innerHTML = "";
    return;
  }

  panel.hidden = false;
  const sourceProducts = state.filteredProducts;
  const summary = buildEbayPrepSummary(sourceProducts);
  const selected = getSelectedProducts();
  const selectedSummary = buildEbayPrepSummary(selected);
  const readyLabel = summary.total ? `${summary.ready}/${summary.total}` : "0/0";
  const selectedLabel = selected.length ? `${selected.length} selected` : "No batch selected";

  panel.innerHTML = `
    <div class="workflow-copy">
      <p class="eyebrow">eBay batch workflow</p>
      <h2>Prepare an eBay-ready batch from Shopify products</h2>
      <p>
        QST turns selected Shopify products into an eBay review pack with draft copy, prices, SKUs, images, variant rows, readiness notes, and category search hints.
      </p>
    </div>
    <div class="workflow-status">
      <div>
        <span>Ready in view</span>
        <strong>${escapeHtml(readyLabel)}</strong>
      </div>
      <div>
        <span>Inventory rows</span>
        <strong>${escapeHtml(summary.inventoryRows)}</strong>
      </div>
      <div>
        <span>Category review</span>
        <strong>${escapeHtml(summary.categoryReview)}</strong>
      </div>
      <div>
        <span>Auto SKU rows</span>
        <strong>${escapeHtml(summary.autoSkuRows)}</strong>
      </div>
    </div>
    <div class="workflow-actions">
      <span class="batch-state">${escapeHtml(selectedLabel)}${selected.length ? `, ${selectedSummary.ready} eBay-ready` : ""}</span>
      <button class="secondary-button" id="select-ebay-ready" ${summary.ready ? "" : "disabled"}>Select eBay-ready</button>
      <button class="primary-button" id="download-ebay-batch" ${summary.ready || selected.length ? "" : "disabled"}>Download eBay batch</button>
    </div>
  `;

  panel.querySelector("#select-ebay-ready")?.addEventListener("click", selectEbayReadyProducts);
  panel.querySelector("#download-ebay-batch")?.addEventListener("click", downloadEbayBatch);
}

function renderAccountPanel() {
  const panel = document.querySelector("#account-panel");
  if (!panel) {
    return;
  }

  const account = state.account;
  const subscription = activeSubscription();
  const subscriptionActive = Boolean(subscription || state.billing?.active);
  const appHandle = account?.appHandle || import.meta.env.VITE_QST_SHOPIFY_APP_HANDLE || "qst-listing-workspace";
  const pricingPath = account?.subscription?.pricingPath || `/charges/${appHandle}/pricing_plans`;
  const pricingUrl =
    account?.subscription?.pricingUrl ||
    buildPricingUrl(pricingPath, account?.authentication?.shop);
  const pricingUnavailableMessage = account?.subscription?.pricingPath
    ? "Open this app from Shopify Admin to choose a plan."
    : subscriptionActive
      ? "Plan is active in Shopify."
      : "Open this app from Shopify Admin to choose a plan.";
  const desktop = account?.desktop ?? {};
  const canPairDesktop = account?.mode !== "production" || subscriptionActive;
  const planName = subscription?.name || account?.subscription?.planName || "Plan not selected";
  const subscriptionLabel = state.billingLoading
    ? "Checking"
    : subscriptionActive
      ? "Active"
      : state.billingError
        ? "Check needed"
        : "No active plan";
  const subscriptionClass = subscriptionActive ? "ok" : state.billingError ? "demo" : "warning";
  const desktopStatus = desktop.available ? "Available" : "Optional";
  const desktopVersion = desktop.version && desktop.version !== "Not configured" ? desktop.version : "";

  panel.innerHTML = `
    <article class="account-card">
      <div class="account-heading">
        <span class="status-pill ${subscriptionClass}">${escapeHtml(subscriptionLabel)}</span>
        <h2>Shopify subscription</h2>
      </div>
      <p class="account-copy">${escapeHtml(planName)}</p>
      ${subscription?.currentPeriodEnd ? `<p class="muted-copy">Renews ${escapeHtml(formatDate(subscription.currentPeriodEnd))}</p>` : ""}
      ${state.accountError ? `<p class="inline-error">${escapeHtml(state.accountError)}</p>` : ""}
      ${state.billingError ? `<p class="inline-error">${escapeHtml(state.billingError)}</p>` : ""}
      ${!pricingUrl ? `<p class="muted-copy">${escapeHtml(pricingUnavailableMessage)}</p>` : `<p class="muted-copy">Plan selection is hosted by Shopify.</p>`}
      <div class="account-actions">
        ${
          pricingUrl
            ? `<a class="secondary-button link-button" href="${escapeAttribute(pricingUrl)}" target="_top">${subscriptionActive ? "Manage plan" : "Choose plan"}</a>`
            : `<button class="secondary-button" disabled title="${escapeAttribute(pricingUnavailableMessage)}">${subscriptionActive ? "Manage plan" : "Choose plan"}</button>`
        }
        <button class="text-button" id="refresh-account">Refresh status</button>
      </div>
    </article>

    <article class="account-card">
      <div class="account-heading">
        <span class="status-pill ${desktop.available ? "ok" : "demo"}">${escapeHtml(desktopStatus)}</span>
        <h2>Windows companion</h2>
      </div>
      <p class="account-copy">Optional desktop tools for bulk preparation, local review, and workflows outside Shopify Admin.</p>
      ${desktopVersion ? `<p class="muted-copy">Version: ${escapeHtml(desktopVersion)}</p>` : `<p class="muted-copy">The Shopify dashboard can be used without installing QST Desktop.</p>`}
      <div class="account-actions">
        ${
          desktop.available
            ? `<a class="primary-button link-button" href="${escapeAttribute(desktop.downloadUrl)}" target="_blank" rel="noreferrer">Download installer</a>`
            : `<button class="secondary-button" disabled>No desktop download required</button>`
        }
      </div>
    </article>

    <article class="account-card">
      <div class="account-heading">
        <span class="status-pill ${state.pairing ? "ok" : "demo"}">${state.pairing ? "Ready" : "Not paired"}</span>
        <h2>Desktop pairing</h2>
      </div>
      <p class="account-copy">If you use QST Desktop, generate a short code to connect it to this Shopify workspace.</p>
      ${state.pairing ? pairingCodeMarkup(state.pairing) : ""}
      ${state.pairingError ? `<p class="inline-error">${escapeHtml(state.pairingError)}</p>` : ""}
      <div class="account-actions">
        <button class="secondary-button" id="generate-pairing" ${state.pairingLoading || !canPairDesktop ? "disabled" : ""}>
          ${state.pairingLoading ? "Generating..." : "Generate code"}
        </button>
      </div>
    </article>
  `;

  panel.querySelector("#refresh-account")?.addEventListener("click", refreshAccount);
  panel.querySelector("#generate-pairing")?.addEventListener("click", generatePairingCode);
}

function pairingCodeMarkup(pairing) {
  return `
    <div class="pairing-box">
      <strong>${escapeHtml(pairing.code)}</strong>
      <span>Expires ${escapeHtml(formatDateTime(pairing.expiresAt))}</span>
    </div>
  `;
}

async function generatePairingCode() {
  state.pairingLoading = true;
  state.pairingError = "";
  renderAccountPanel();

  try {
    state.pairing = await backendRequest("/api/desktop/pairing-code", {
      method: "POST",
      body: JSON.stringify({
        shop: inferredShopDomain()
      })
    });
    window.shopify?.toast?.show?.("QST Desktop pairing code generated.");
  } catch (error) {
    state.pairingError = error.message || "Could not generate a pairing code.";
  } finally {
    state.pairingLoading = false;
    renderAccountPanel();
  }
}

function activeSubscription() {
  return state.billing?.subscriptions?.find((subscription) => subscription.status === "ACTIVE") || null;
}

function buildPricingUrl(pricingPath, authenticatedShop = "") {
  const storeHandle = adminStoreHandle(authenticatedShop);
  if (!pricingPath || !storeHandle) {
    return "";
  }

  return `https://admin.shopify.com/store/${encodeURIComponent(storeHandle)}${pricingPath}`;
}

function adminStoreHandle(authenticatedShop = "") {
  const referrer = document.referrer;
  if (referrer) {
    try {
      const match = new URL(referrer).pathname.match(/\/store\/([^/]+)/);
      if (match?.[1]) {
        return decodeURIComponent(match[1]);
      }
    } catch {
      // Fall through to the Shopify shop query parameter below.
    }
  }

  const shop = new URLSearchParams(window.location.search).get("shop");
  if (shop) {
    return storeHandleFromShop(shop);
  }

  const host = new URLSearchParams(window.location.search).get("host");
  const hostStoreHandle = storeHandleFromEncodedHost(host);
  if (hostStoreHandle) {
    return hostStoreHandle;
  }

  if (authenticatedShop) {
    return storeHandleFromShop(authenticatedShop);
  }

  return "";
}

function inferredShopDomain() {
  const shop = new URLSearchParams(window.location.search).get("shop");
  if (shop) {
    return shop;
  }

  const handle = adminStoreHandle(state.account?.authentication?.shop);
  return handle ? `${handle}.myshopify.com` : "";
}

function storeHandleFromShop(shop) {
  return String(shop || "")
    .replace(/^https?:\/\//, "")
    .split(/[/?#]/)[0]
    .replace(/\.myshopify\.com$/i, "");
}

function storeHandleFromEncodedHost(host) {
  if (!host) {
    return "";
  }

  try {
    const decoded = window.atob(normalizeBase64(host));
    const match = decoded.match(/\/store\/([^/]+)/) || decoded.match(/^([^/.]+)\.myshopify\.com/);
    return match?.[1] || "";
  } catch {
    return "";
  }
}

function normalizeBase64(value) {
  const base = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  return base.padEnd(base.length + ((4 - (base.length % 4)) % 4), "=");
}

function accountContextQuery() {
  const params = new URLSearchParams();
  const currentParams = new URLSearchParams(window.location.search);
  const shop = currentParams.get("shop");
  const host = currentParams.get("host");
  const storeHandle = adminStoreHandle();

  if (shop) {
    params.set("shop", shop);
  }

  if (host) {
    params.set("host", host);
  }

  if (storeHandle) {
    params.set("store_handle", storeHandle);
  }

  const text = params.toString();
  return text ? `?${text}` : "";
}

async function backendRequest(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const token = await getShopifyIdToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(path, {
    ...options,
    headers
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || `Request failed with ${response.status}.`);
  }

  return payload;
}

function formatDate(value) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(new Date(value));
}

function formatDateTime(value) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function renderProducts() {
  const list = document.querySelector("#product-list");
  document.querySelector("#product-count").textContent = state.loading
    ? "Loading Shopify products..."
    : `${state.filteredProducts.length} of ${state.products.length} products shown.`;

  if (state.error) {
    list.innerHTML = `<div class="empty-state error-state">${escapeHtml(state.error)}</div>`;
    return;
  }

  if (state.loading) {
    list.innerHTML = `<div class="empty-state">Loading products from Shopify...</div>`;
    return;
  }

  if (!state.filteredProducts.length) {
    list.innerHTML = `<div class="empty-state">No products match the current filters.</div>`;
    return;
  }

  list.innerHTML = state.filteredProducts.map(productRow).join("");

  list.querySelectorAll("[data-select-product]").forEach((checkbox) => {
    checkbox.addEventListener("change", (event) => {
      const id = event.currentTarget.dataset.selectProduct;
      if (event.currentTarget.checked) {
        state.selectedIds.add(id);
      } else {
        state.selectedIds.delete(id);
      }
      renderEbayWorkflow();
      renderExportSummary();
    });
  });

  list.querySelectorAll("[data-open-product]").forEach((button) => {
    button.addEventListener("click", (event) => {
      state.activeProductId = event.currentTarget.dataset.openProduct;
      renderProducts();
      renderDraft();
    });
  });
}

function productRow(product) {
  const readiness = assessReadiness(product);
  const active = product.id === state.activeProductId;
  const checked = state.selectedIds.has(product.id);
  const firstVariant = product.variants?.[0] ?? {};

  return `
    <article class="product-row ${active ? "active" : ""}">
      <input type="checkbox" data-select-product="${escapeHtml(product.id)}" ${checked ? "checked" : ""} aria-label="Select ${escapeHtml(product.title)}" />
      <button class="product-main" data-open-product="${escapeHtml(product.id)}">
        <span class="thumb">${product.imageUrl ? `<img src="${escapeHtml(product.imageUrl)}" alt="" />` : ""}</span>
        <span class="product-copy">
          <strong>${escapeHtml(product.title)}</strong>
          <small>${escapeHtml([product.productType, firstVariant.sku, product.status].filter(Boolean).join(" - "))}</small>
        </span>
      </button>
      <span class="readiness-pill ${readiness.state}">${readiness.score}%</span>
    </article>
  `;
}

function renderDraft() {
  const product = state.products.find((candidate) => candidate.id === state.activeProductId);
  const content = document.querySelector("#draft-content");
  const subtitle = document.querySelector("#draft-subtitle");

  if (!product) {
    subtitle.textContent = "Select a product to review.";
    content.innerHTML = `<div class="empty-state">Choose a product to see listing copy, checks, variants, and export details.</div>`;
    return;
  }

  const readiness = assessReadiness(product);
  const draft = getDraft(product);

  subtitle.textContent = `${marketplaceLabel(state.marketplace)} draft for ${product.title}`;
  content.innerHTML = `
    <div class="draft-stack">
      <div class="draft-image">${product.imageUrl ? `<img src="${escapeHtml(product.imageUrl)}" alt="" />` : "<span>No image</span>"}</div>
      <label>
        <span>Marketplace title</span>
        <input type="text" data-draft-field="title" value="${escapeAttribute(draft.title)}" />
      </label>
      <label>
        <span>Description</span>
        <textarea rows="9" data-draft-field="description">${escapeHtml(draft.description)}</textarea>
      </label>
      <label>
        <span>Suggested tags</span>
        <input type="text" data-draft-field="tags" value="${escapeAttribute(draft.tags.join(", "))}" />
      </label>
      ${state.marketplace === "ebay" ? ebayDraftStatus(product) : ""}
      <div class="checklist">
        <h3>Readiness checks</h3>
        ${readiness.checks.map(checkItem).join("")}
      </div>
      <div class="variant-box">
        <h3>Variants</h3>
        ${variantList(product)}
      </div>
    </div>
  `;

  content.querySelectorAll("[data-draft-field]").forEach((field) => {
    field.addEventListener("input", (event) => {
      updateDraftOverride(product, event.currentTarget.dataset.draftField, event.currentTarget.value);
    });
  });
}

function getDraft(product) {
  const key = draftKey(product.id, state.marketplace);
  return state.draftOverrides.get(key) || createDraft(product, state.marketplace);
}

function ebayDraftStatus(product) {
  const prep = assessEbayPrep(product);
  const blockerText = prep.blockers.length
    ? prep.blockers.map((check) => check.label).join(", ")
    : "Ready for eBay batch review";

  return `
    <div class="ebay-detail">
      <div class="ebay-detail-heading">
        <h3>eBay batch readiness</h3>
        <span class="readiness-pill ${prep.state}">${prep.score}%</span>
      </div>
      <div class="ebay-facts">
        <span>Category hint <strong>${escapeHtml(prep.categoryHint.label)}</strong></span>
        <span>Image URLs <strong>${escapeHtml(prep.imageCount)}</strong></span>
        <span>Inventory rows <strong>${escapeHtml(prep.inventoryRows)}</strong></span>
      </div>
      <p class="${prep.blockers.length ? "inline-error" : "muted-copy"}">${escapeHtml(blockerText)}</p>
    </div>
  `;
}

function getDraftOverridesForExport(products) {
  return Object.fromEntries(
    products.map((product) => [product.id, getDraft(product)])
  );
}

function updateDraftOverride(product, field, value) {
  const key = draftKey(product.id, state.marketplace);
  const current = getDraft(product);
  const next = { ...current };

  if (field === "tags") {
    next.tags = String(value || "")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
  } else {
    next[field] = value;
  }

  state.draftOverrides.set(key, next);
}

function draftKey(productId, marketplace) {
  return `${marketplace}:${productId}`;
}

function checkItem(check) {
  return `
    <div class="check-item">
      <span class="${check.ok ? "check-ok" : "check-warn"}">${check.ok ? "Pass" : "Review"}</span>
      <div>
        <strong>${escapeHtml(check.label)}</strong>
        <p>${escapeHtml(check.detail)}</p>
      </div>
    </div>
  `;
}

function variantList(product) {
  const variants = product.variants ?? [];
  if (!variants.length) {
    return `<p>No variants returned from Shopify.</p>`;
  }

  return variants
    .slice(0, 12)
    .map((variant) => {
      const options = (variant.selectedOptions ?? [])
        .map((option) => `${option.name}: ${option.value}`)
        .join(", ");
      return `
        <div class="variant-row">
          <strong>${escapeHtml(options || variant.title || "Default")}</strong>
          <span>${escapeHtml([variant.sku, variant.price ? `Price ${variant.price}` : ""].filter(Boolean).join(" - "))}</span>
        </div>
      `;
    })
    .join("");
}

function renderExportSummary() {
  const selected = getSelectedProducts();
  document.querySelector("#selected-summary").textContent = selected.length
    ? `${selected.length} product${selected.length === 1 ? "" : "s"} selected for ${marketplaceLabel(state.marketplace)}`
    : "No products selected";
}

function getSelectedProducts() {
  return state.products.filter((product) => state.selectedIds.has(product.id));
}

function selectEbayReadyProducts() {
  state.selectedIds = new Set(
    state.filteredProducts
      .filter((product) => assessEbayPrep(product).state === "ready")
      .map((product) => product.id)
  );
  render();
  window.shopify?.toast?.show?.("eBay-ready products selected.");
}

function downloadEbayBatch() {
  let products = getSelectedProducts();
  if (!products.length) {
    products = state.filteredProducts.filter((product) => assessEbayPrep(product).state === "ready");
  }

  if (!products.length) {
    window.shopify?.toast?.show?.("No eBay-ready products found in the current view.");
    return;
  }

  const date = new Date().toISOString().slice(0, 10);
  const draftOverrides = getDraftOverridesForExport(products);
  download(`qst-ebay-ready-batch-${date}.csv`, buildEbayPrepCsv(products, draftOverrides), "text/csv;charset=utf-8");
  window.shopify?.toast?.show?.("eBay batch generated.");
}

function exportSelected(type) {
  const products = getSelectedProducts();
  if (!products.length) {
    window.shopify?.toast?.show?.("Select one or more products first.");
    return;
  }

  const date = new Date().toISOString().slice(0, 10);
  const baseName = `qst-${state.marketplace}-listing-pack-${date}`;
  const draftOverrides = getDraftOverridesForExport(products);
  if (type === "csv") {
    download(`${baseName}.csv`, buildCsv(products, state.marketplace, draftOverrides), "text/csv;charset=utf-8");
  } else {
    download(`${baseName}.txt`, buildTextPack(products, state.marketplace, draftOverrides), "text/plain;charset=utf-8");
  }

  window.shopify?.toast?.show?.("QST export generated.");
}

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/\n/g, " ");
}
