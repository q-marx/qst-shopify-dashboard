import {
  assessEbayPrep,
  assessReadiness,
  buildCsv,
  buildEbayPrepCsv,
  buildEbayPrepSummary,
  buildEbayPublishPlan,
  buildTextPack,
  buildWorkspacePack,
  createDraft,
  marketplaceLabel
} from "./listing-utils.js";
import { getShopifyIdToken, isEmbeddedShopifyContext, loadBillingStatus, loadProducts } from "./shopify-api.js";
import "./styles.css";

const demoMode = import.meta.env.VITE_QST_DEMO_MODE !== "false";
const LOCAL_WORKSPACE_VERSION = 1;
const WORKSPACE_STATUS_OPTIONS = [
  { value: "not_started", label: "Not started", className: "neutral" },
  { value: "drafted", label: "Drafted", className: "demo" },
  { value: "ready", label: "Ready", className: "ok" },
  { value: "exported", label: "Exported", className: "ok" }
];
const WORKSPACE_STATUS_VALUES = new Set(WORKSPACE_STATUS_OPTIONS.map((option) => option.value));

const state = {
  products: [],
  filteredProducts: [],
  selectedIds: new Set(),
  draftOverrides: new Map(),
  imageOverrides: new Map(),
  workspaceStatusOverrides: new Map(),
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
  ebaySettings: defaultEbaySettingsPayload(),
  ebaySettingsLoading: false,
  ebaySettingsSaving: false,
  ebaySettingsError: "",
  pairing: null,
  pairingLoading: false,
  pairingError: ""
};

const app = document.querySelector("#app");

renderShell();
refreshProducts();
refreshAccount();
refreshEbaySettings();

async function refreshProducts() {
  state.loading = true;
  state.error = "";
  render();

  try {
    const result = await loadProducts({ demoMode });
    state.products = result.products;
    state.source = result.source;
    state.selectedIds = new Set();
    restoreLocalWorkspaceState(result.products);
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

async function refreshEbaySettings() {
  if (!isEmbeddedShopifyContext() && !demoMode) {
    state.ebaySettings = defaultEbaySettingsPayload();
    return;
  }

  state.ebaySettingsLoading = true;
  state.ebaySettingsError = "";
  renderEbayWorkflow();

  try {
    state.ebaySettings = await backendRequest(`/api/marketplace-settings/ebay${accountContextQuery()}`);
  } catch (error) {
    state.ebaySettingsError = error.message || "Could not load eBay setup status.";
  } finally {
    state.ebaySettingsLoading = false;
    renderEbayWorkflow();
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
          <p>Exports are generated from read-only Shopify data. Local draft and image edits are saved in this browser.</p>
        </div>
        <div class="export-actions">
          <button class="text-button" id="clear-local-workspace">Clear local edits</button>
          <button class="secondary-button" id="export-csv">Download CSV</button>
          <button class="secondary-button" id="export-workspace-pack">Download workspace pack</button>
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
  document.querySelector("#clear-local-workspace").addEventListener("click", () => {
    clearLocalWorkspaceState();
  });
  document.querySelector("#export-csv").addEventListener("click", () => {
    exportSelected("csv");
  });
  document.querySelector("#export-workspace-pack").addEventListener("click", () => {
    exportSelected("workspace-json");
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
  const curatedProducts = state.products.map(applyImageCuration);
  const ready = curatedProducts.filter((product) => assessReadiness(product).state === "ready").length;
  const review = curatedProducts.filter((product) => assessReadiness(product).state === "review").length;
  const needsWork = curatedProducts.filter((product) => assessReadiness(product).state === "needs-work").length;
  const variants = state.products.reduce((total, product) => total + (product.variants?.length ?? 0), 0);
  const exported = state.products.filter((product) => workspaceStatusFor(product.id).status === "exported").length;

  document.querySelector("#metrics").innerHTML = [
    metric("Products loaded", state.products.length),
    metric("Ready to export", ready),
    metric("Needs review", review),
    metric("Needs work", needsWork),
    metric("Variants visible", variants),
    metric(`${marketplaceLabel(state.marketplace)} exported`, exported)
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
  const sourceProducts = state.filteredProducts.map(applyImageCuration);
  const summary = buildEbayPrepSummary(sourceProducts);
  const selected = getSelectedProducts().map(applyImageCuration);
  const selectedSummary = buildEbayPrepSummary(selected);
  const readyLabel = summary.total ? `${summary.ready}/${summary.total}` : "0/0";
  const selectedLabel = selected.length ? `${selected.length} selected` : "No batch selected";
  const ebaySetup = state.ebaySettings?.settings || defaultEbaySettingsPayload().settings;
  const ebaySetupSummary = state.ebaySettings?.summary || setupSummaryFromSettings(ebaySetup);
  const setupStatusClass = ebaySetupSummary.ready ? "ok" : ebaySetupSummary.completed ? "demo" : "warning";
  const setupStatusLabel = state.ebaySettingsLoading
    ? "Loading"
    : ebaySetupSummary.ready
      ? "Ready"
      : `${ebaySetupSummary.completed}/${ebaySetupSummary.total} complete`;

  panel.innerHTML = `
    <div class="workflow-copy">
      <p class="eyebrow">eBay batch workflow</p>
      <h2>Prepare an eBay-ready batch from Shopify products</h2>
      <p>
        QST turns selected Shopify products into an eBay review pack with draft copy, prices, SKUs, images, variant rows, readiness notes, and category search hints.
      </p>
      <p class="workflow-note">
        The Shopify dashboard prepares and exports the batch; merchants who pair QST Desktop can use the same workspace for local eBay publishing automation after eBay setup.
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
      <button class="secondary-button" id="download-ebay-plan" ${summary.ready || selected.length ? "" : "disabled"}>Download publish plan</button>
      <button class="primary-button" id="download-ebay-batch" ${summary.ready || selected.length ? "" : "disabled"}>Download eBay batch</button>
    </div>
    <div class="workflow-setup">
      <div class="setup-heading">
        <div>
          <h3>eBay publishing setup tracker</h3>
          <p>Track the setup needed before advanced eBay publishing in QST Desktop or a future hosted eBay publish flow.</p>
        </div>
        <span class="status-pill ${setupStatusClass}">${escapeHtml(setupStatusLabel)}</span>
      </div>
      <div class="setup-checks">
        ${ebaySetupCheck("sellerAccountConnected", "eBay seller account connected", ebaySetup.sellerAccountConnected)}
        ${ebaySetupCheck("businessPoliciesReady", "Payment, return, and fulfilment policies ready", ebaySetup.businessPoliciesReady)}
        ${ebaySetupCheck("dispatchLocationReady", "Dispatch country/postcode confirmed", ebaySetup.dispatchLocationReady)}
        ${ebaySetupCheck("defaultCategoryReady", "Fallback category chosen", ebaySetup.defaultCategoryReady)}
      </div>
      <div class="setup-fields">
        <label>
          <span>Fallback category note</span>
          <input id="ebay-category-label" type="text" value="${escapeAttribute(ebaySetup.defaultCategoryLabel)}" placeholder="Example: Home decor, 10033, seller review needed" />
        </label>
        <label>
          <span>Setup notes</span>
          <input id="ebay-setup-notes" type="text" value="${escapeAttribute(ebaySetup.notes)}" placeholder="Policy/account notes for the next publishing pass" />
        </label>
        <button class="secondary-button" id="save-ebay-setup" ${state.ebaySettingsSaving || state.ebaySettingsLoading ? "disabled" : ""}>
          ${state.ebaySettingsSaving ? "Saving..." : "Save setup"}
        </button>
      </div>
      ${state.ebaySettingsError ? `<p class="inline-error">${escapeHtml(state.ebaySettingsError)}</p>` : ""}
    </div>
  `;

  panel.querySelector("#select-ebay-ready")?.addEventListener("click", selectEbayReadyProducts);
  panel.querySelector("#download-ebay-plan")?.addEventListener("click", downloadEbayPublishPlan);
  panel.querySelector("#download-ebay-batch")?.addEventListener("click", downloadEbayBatch);
  panel.querySelector("#save-ebay-setup")?.addEventListener("click", saveEbaySetupFromPanel);
}

function ebaySetupCheck(key, label, checked) {
  return `
    <label class="setup-check">
      <input type="checkbox" data-ebay-setup="${escapeAttribute(key)}" ${checked ? "checked" : ""} />
      <span>${escapeHtml(label)}</span>
    </label>
  `;
}

async function saveEbaySetupFromPanel() {
  const panel = document.querySelector("#ebay-workflow");
  if (!panel) {
    return;
  }

  const settings = {
    sellerAccountConnected: panel.querySelector('[data-ebay-setup="sellerAccountConnected"]')?.checked || false,
    businessPoliciesReady: panel.querySelector('[data-ebay-setup="businessPoliciesReady"]')?.checked || false,
    dispatchLocationReady: panel.querySelector('[data-ebay-setup="dispatchLocationReady"]')?.checked || false,
    defaultCategoryReady: panel.querySelector('[data-ebay-setup="defaultCategoryReady"]')?.checked || false,
    defaultCategoryLabel: panel.querySelector("#ebay-category-label")?.value || "",
    notes: panel.querySelector("#ebay-setup-notes")?.value || ""
  };

  const previousSettings = state.ebaySettings;
  state.ebaySettings = {
    ...previousSettings,
    settings,
    summary: setupSummaryFromSettings(settings)
  };
  state.ebaySettingsSaving = true;
  state.ebaySettingsError = "";
  renderEbayWorkflow();

  try {
    state.ebaySettings = await backendRequest(`/api/marketplace-settings/ebay${accountContextQuery()}`, {
      method: "PUT",
      body: JSON.stringify({
        shop: inferredShopDomain(),
        settings
      })
    });
    window.shopify?.toast?.show?.("eBay setup saved.");
  } catch (error) {
    state.ebaySettings = previousSettings;
    state.ebaySettingsError = error.message || "Could not save eBay setup status.";
  } finally {
    state.ebaySettingsSaving = false;
    renderEbayWorkflow();
  }
}

function defaultEbaySettingsPayload() {
  const settings = {
    sellerAccountConnected: false,
    businessPoliciesReady: false,
    dispatchLocationReady: false,
    defaultCategoryReady: false,
    defaultCategoryLabel: "",
    notes: "",
    updatedAt: null
  };

  return {
    shop: "",
    marketplace: "ebay",
    settings,
    summary: setupSummaryFromSettings(settings)
  };
}

function setupSummaryFromSettings(settings) {
  const checks = [
    settings.sellerAccountConnected,
    settings.businessPoliciesReady,
    settings.dispatchLocationReady,
    settings.defaultCategoryReady
  ];
  const completed = checks.filter(Boolean).length;
  return {
    completed,
    total: checks.length,
    ready: completed === checks.length,
    status: completed === checks.length ? "ready" : completed ? "in_progress" : "not_started"
  };
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
      <p class="account-copy">Optional companion for bulk preparation, local review, and advanced eBay publishing automation using the same Shopify workspace.</p>
      ${desktopVersion ? `<p class="muted-copy">Version: ${escapeHtml(desktopVersion)}</p>` : `<p class="muted-copy">The Shopify dashboard can be used without installing QST Desktop; connect it only when you want local automation.</p>`}
      <div class="account-actions">
        ${
          desktop.available
            ? `<a class="primary-button link-button" href="${escapeAttribute(desktop.downloadUrl)}" target="_blank" rel="noreferrer">Download installer</a>`
            : `<button class="secondary-button" disabled>Installer pending</button>`
        }
      </div>
    </article>

    <article class="account-card">
      <div class="account-heading">
        <span class="status-pill ${state.pairing ? "ok" : "demo"}">${state.pairing ? "Ready" : "Not paired"}</span>
        <h2>Desktop pairing</h2>
      </div>
      <p class="account-copy">If you use QST Desktop, generate a short code to connect it to this Shopify product workspace.</p>
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
  const params = new URLSearchParams(window.location.search);
  const shop = params.get("shop");
  if (shop) {
    return shop;
  }

  const hostHandle = storeHandleFromEncodedHost(params.get("host"));
  if (hostHandle) {
    return `${hostHandle}.myshopify.com`;
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
  const curatedProduct = applyImageCuration(product);
  const readiness = assessReadiness(curatedProduct);
  const workspaceStatus = workspaceStatusFor(product.id);
  const active = product.id === state.activeProductId;
  const checked = state.selectedIds.has(product.id);
  const firstVariant = product.variants?.[0] ?? {};

  return `
    <article class="product-row ${active ? "active" : ""}">
      <input type="checkbox" data-select-product="${escapeHtml(product.id)}" ${checked ? "checked" : ""} aria-label="Select ${escapeHtml(product.title)}" />
      <button class="product-main" data-open-product="${escapeHtml(product.id)}">
        <span class="thumb">${curatedProduct.imageUrl ? `<img src="${escapeHtml(curatedProduct.imageUrl)}" alt="" />` : ""}</span>
        <span class="product-copy">
          <strong>${escapeHtml(product.title)}</strong>
          <small>${escapeHtml([product.productType, firstVariant.sku, product.status].filter(Boolean).join(" - "))}</small>
        </span>
      </button>
      <span class="work-status-pill ${workspaceStatus.className}">${escapeHtml(workspaceStatus.label)}</span>
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

  const curatedProduct = applyImageCuration(product);
  const readiness = assessReadiness(curatedProduct);
  const draft = getDraft(product);

  subtitle.textContent = `${marketplaceLabel(state.marketplace)} draft for ${product.title}`;
  content.innerHTML = `
    <div class="draft-stack">
      <div class="draft-image">${curatedProduct.imageUrl ? `<img src="${escapeHtml(curatedProduct.imageUrl)}" alt="" />` : "<span>No image selected</span>"}</div>
      ${workspaceStatusPanel(product)}
      ${imageCurationPanel(product)}
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
      ${listingWorkbenchPanel()}
      ${state.marketplace === "ebay" ? ebayDraftStatus(curatedProduct) : ""}
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
  bindWorkspaceStatusControls(content, product);
  bindListingWorkbenchControls(content, product);
  bindImageCurationControls(content, product);
}

function getDraft(product) {
  const key = draftKey(product.id, state.marketplace);
  const curatedProduct = applyImageCuration(product);
  const override = state.draftOverrides.get(key);
  return override ? { ...override, imageUrl: curatedProduct.imageUrl } : createDraft(curatedProduct, state.marketplace);
}

function workspaceStatusPanel(product) {
  const current = workspaceStatusFor(product.id);
  const updated = current.updatedAt ? `Updated ${formatDateTime(current.updatedAt)}` : "No local progress saved yet.";

  return `
    <div class="workspace-status-card">
      <div class="workspace-status-heading">
        <div>
          <h3>${escapeHtml(marketplaceLabel(state.marketplace))} workspace status</h3>
          <p>Track local listing progress for this marketplace. Shopify is not changed.</p>
        </div>
        <span class="status-pill ${current.className}" data-workspace-status-pill>${escapeHtml(current.label)}</span>
      </div>
      <div class="workspace-status-controls">
        <label>
          <span>Status</span>
          <select id="workspace-status-select">
            ${WORKSPACE_STATUS_OPTIONS.map(
              (option) => `<option value="${escapeAttribute(option.value)}" ${option.value === current.status ? "selected" : ""}>${escapeHtml(option.label)}</option>`
            ).join("")}
          </select>
        </label>
        <label>
          <span>Notes</span>
          <input id="workspace-status-note" type="text" value="${escapeAttribute(current.note)}" placeholder="Example: Category checked, ready for next export" />
        </label>
      </div>
      <p class="muted-copy" data-workspace-status-updated>${escapeHtml(updated)}</p>
    </div>
  `;
}

function bindWorkspaceStatusControls(container, product) {
  const select = container.querySelector("#workspace-status-select");
  const note = container.querySelector("#workspace-status-note");

  select?.addEventListener("change", (event) => {
    saveWorkspaceStatus(product.id, {
      status: event.currentTarget.value
    });
  });

  note?.addEventListener("input", (event) => {
    saveWorkspaceStatus(
      product.id,
      {
        note: event.currentTarget.value
      },
      {
        render: false
      }
    );
  });
}

function listingWorkbenchPanel() {
  return `
    <div class="listing-actions-card">
      <div class="listing-actions-heading">
        <h3>Listing actions</h3>
        <span>${escapeHtml(marketplaceLabel(state.marketplace))}</span>
      </div>
      <div class="listing-action-grid">
        <button class="secondary-button" data-copy-listing-field="title">Copy title</button>
        <button class="secondary-button" data-copy-listing-field="description">Copy description</button>
        <button class="secondary-button" data-copy-listing-field="tags">Copy tags</button>
        <button class="secondary-button" data-copy-listing-field="pack">Copy full pack</button>
        <button class="secondary-button" data-download-current-listing>Download current listing</button>
        <button class="primary-button" data-mark-current-ready>Mark ready</button>
      </div>
    </div>
  `;
}

function bindListingWorkbenchControls(container, product) {
  container.querySelectorAll("[data-copy-listing-field]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      await copyListingField(product, event.currentTarget.dataset.copyListingField);
    });
  });

  container.querySelector("[data-download-current-listing]")?.addEventListener("click", () => {
    downloadCurrentListing(product);
  });

  container.querySelector("[data-mark-current-ready]")?.addEventListener("click", () => {
    saveWorkspaceStatus(product.id, {
      status: "ready"
    });
    window.shopify?.toast?.show?.("Listing marked ready.");
  });
}

async function copyListingField(product, field) {
  const draft = getDraft(product);
  const text = listingFieldText(product, draft, field);
  if (!text) {
    window.shopify?.toast?.show?.("Nothing to copy.");
    return;
  }

  const copied = await copyTextToClipboard(text);
  if (copied) {
    if (field === "pack") {
      saveWorkspaceStatus(product.id, {
        status: "ready"
      });
    }
    window.shopify?.toast?.show?.("Copied to clipboard.");
  } else {
    window.shopify?.toast?.show?.("Copy failed. Try selecting the field manually.");
  }
}

function listingFieldText(product, draft, field) {
  if (field === "title") {
    return draft.title;
  }

  if (field === "description") {
    return draft.description;
  }

  if (field === "tags") {
    return draft.tags.join(", ");
  }

  if (field === "pack") {
    const curatedProduct = applyImageCuration(product);
    return buildTextPack([curatedProduct], state.marketplace, {
      [product.id]: draft
    });
  }

  return "";
}

async function copyTextToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return fallbackCopyText(text);
  }
}

function fallbackCopyText(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.select();

  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
}

function downloadCurrentListing(product) {
  const curatedProduct = applyImageCuration(product);
  const draft = getDraft(product);
  const date = new Date().toISOString().slice(0, 10);
  const name = filenamePart(product.handle || product.title || "listing");
  download(
    `qst-${state.marketplace}-${name}-${date}.txt`,
    buildTextPack([curatedProduct], state.marketplace, {
      [product.id]: draft
    }),
    "text/plain;charset=utf-8"
  );
  markProductsWorkspaceStatus([product], "exported");
  window.shopify?.toast?.show?.("Current listing downloaded.");
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

function imageCurationPanel(product) {
  const entries = productImageEntries(product);
  if (!entries.length) {
    return `
      <div class="image-curation">
        <div class="image-curation-heading">
          <h3>Export images</h3>
          <p>No Shopify images were returned for this product.</p>
        </div>
      </div>
    `;
  }

  const override = imageOverrideFor(product.id);
  const includedCount = entries.filter((entry) => !override.excludedUrls.has(entry.url)).length;
  const primaryUrl = primaryImageUrl(product, entries, override);

  return `
    <div class="image-curation">
      <div class="image-curation-heading">
        <div>
          <h3>Export images</h3>
          <p>Choose the primary image and image URLs included in browser exports. Shopify is not changed.</p>
        </div>
        <span>${includedCount}/${entries.length} included</span>
      </div>
      <div class="image-choice-list">
        ${entries.map((entry) => imageChoiceRow(entry, override, primaryUrl)).join("")}
      </div>
    </div>
  `;
}

function imageChoiceRow(entry, override, primaryUrl) {
  const included = !override.excludedUrls.has(entry.url);
  const primary = included && entry.url === primaryUrl;

  return `
    <div class="image-choice ${primary ? "primary" : ""}">
      <label class="image-include">
        <input type="checkbox" data-image-include="${escapeAttribute(entry.url)}" ${included ? "checked" : ""} />
        <span>Include</span>
      </label>
      <img src="${escapeAttribute(entry.url)}" alt="" />
      <div class="image-choice-copy">
        <strong>${primary ? "Primary image" : entry.role}</strong>
        <span>${escapeHtml(entry.altText || entry.url)}</span>
      </div>
      <button class="secondary-button image-primary-button" data-image-primary="${escapeAttribute(entry.url)}" ${primary || !included ? "disabled" : ""}>Set primary</button>
    </div>
  `;
}

function bindImageCurationControls(container, product) {
  container.querySelectorAll("[data-image-include]").forEach((checkbox) => {
    checkbox.addEventListener("change", (event) => {
      setImageIncluded(product, event.currentTarget.dataset.imageInclude, event.currentTarget.checked);
      renderProducts();
      renderDraft();
      renderEbayWorkflow();
    });
  });

  container.querySelectorAll("[data-image-primary]").forEach((button) => {
    button.addEventListener("click", (event) => {
      setPrimaryImage(product, event.currentTarget.dataset.imagePrimary);
      renderProducts();
      renderDraft();
      renderEbayWorkflow();
    });
  });
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
  if (markWorkspaceDrafted(product.id)) {
    refreshActiveWorkspaceStatusDom(product.id);
    renderMetrics();
    renderProducts();
    renderEbayWorkflow();
  }
  persistLocalWorkspaceState();
}

function draftKey(productId, marketplace) {
  return `${marketplace}:${productId}`;
}

function workspaceKey(productId, marketplace = state.marketplace) {
  return `${marketplace}:${productId}`;
}

function workspaceStatusFor(productId, marketplace = state.marketplace) {
  return normalizeWorkspaceStatus(state.workspaceStatusOverrides.get(workspaceKey(productId, marketplace)));
}

function normalizeWorkspaceStatus(record = {}) {
  const status = WORKSPACE_STATUS_VALUES.has(record.status) ? record.status : "not_started";
  const option = WORKSPACE_STATUS_OPTIONS.find((candidate) => candidate.value === status) || WORKSPACE_STATUS_OPTIONS[0];

  return {
    status,
    label: option.label,
    className: option.className,
    note: String(record.note || ""),
    updatedAt: String(record.updatedAt || "")
  };
}

function saveWorkspaceStatus(productId, updates = {}, options = {}) {
  const current = workspaceStatusFor(productId);
  const next = normalizeWorkspaceStatus({
    ...current,
    ...updates,
    updatedAt: new Date().toISOString()
  });
  const key = workspaceKey(productId);

  if (next.status === "not_started" && !next.note.trim()) {
    state.workspaceStatusOverrides.delete(key);
  } else {
    state.workspaceStatusOverrides.set(key, {
      status: next.status,
      note: next.note,
      updatedAt: next.updatedAt
    });
  }

  if (options.persist !== false) {
    persistLocalWorkspaceState();
  }

  if (options.render !== false) {
    renderMetrics();
    renderProducts();
    renderDraft();
    renderEbayWorkflow();
  }
}

function markWorkspaceDrafted(productId) {
  const current = workspaceStatusFor(productId);
  if (current.status === "drafted") {
    return false;
  }

  state.workspaceStatusOverrides.set(workspaceKey(productId), {
    status: "drafted",
    note: current.note,
    updatedAt: new Date().toISOString()
  });
  return true;
}

function markProductsWorkspaceStatus(products, status) {
  for (const product of products) {
    const current = workspaceStatusFor(product.id);
    state.workspaceStatusOverrides.set(workspaceKey(product.id), {
      status,
      note: current.note,
      updatedAt: new Date().toISOString()
    });
  }
  persistLocalWorkspaceState();
  renderMetrics();
  renderProducts();
  renderDraft();
  renderEbayWorkflow();
}

function refreshActiveWorkspaceStatusDom(productId) {
  if (productId !== state.activeProductId) {
    return;
  }

  const current = workspaceStatusFor(productId);
  const select = document.querySelector("#workspace-status-select");
  if (select) {
    select.value = current.status;
  }

  const pill = document.querySelector("[data-workspace-status-pill]");
  if (pill) {
    pill.className = `status-pill ${current.className}`;
    pill.textContent = current.label;
  }

  const updated = document.querySelector("[data-workspace-status-updated]");
  if (updated) {
    updated.textContent = current.updatedAt ? `Updated ${formatDateTime(current.updatedAt)}` : "No local progress saved yet.";
  }
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

function getSelectedProductsForExport() {
  return getSelectedProducts().map(applyImageCuration);
}

function productImageEntries(product) {
  const entries = [
    product.imageUrl
      ? {
          url: product.imageUrl,
          altText: "Featured image",
          role: "featured"
        }
      : null,
    ...(product.images ?? []).map((image, index) => ({
      url: image.url,
      altText: image.altText || "",
      role: index === 0 ? "gallery" : `gallery ${index + 1}`
    }))
  ]
    .filter((entry) => entry?.url)
    .filter((entry, index, all) => all.findIndex((candidate) => candidate.url === entry.url) === index);

  return entries;
}

function imageOverrideFor(productId) {
  const existing = state.imageOverrides.get(productId);
  if (existing) {
    return existing;
  }

  const next = {
    primaryUrl: "",
    excludedUrls: new Set()
  };
  state.imageOverrides.set(productId, next);
  return next;
}

function primaryImageUrl(product, entries = productImageEntries(product), override = imageOverrideFor(product.id)) {
  const includedEntries = entries.filter((entry) => !override.excludedUrls.has(entry.url));
  if (!includedEntries.length) {
    return "";
  }

  if (override.primaryUrl && includedEntries.some((entry) => entry.url === override.primaryUrl)) {
    return override.primaryUrl;
  }

  return includedEntries[0].url;
}

function setImageIncluded(product, url, included) {
  const override = imageOverrideFor(product.id);
  if (included) {
    override.excludedUrls.delete(url);
  } else {
    override.excludedUrls.add(url);
    if (override.primaryUrl === url) {
      override.primaryUrl = "";
    }
  }
  markWorkspaceDrafted(product.id);
  persistLocalWorkspaceState();
}

function setPrimaryImage(product, url) {
  const override = imageOverrideFor(product.id);
  override.excludedUrls.delete(url);
  override.primaryUrl = url;
  markWorkspaceDrafted(product.id);
  persistLocalWorkspaceState();
}

function applyImageCuration(product) {
  const entries = productImageEntries(product);
  if (!entries.length) {
    return {
      ...product,
      imageUrl: "",
      images: []
    };
  }

  const override = imageOverrideFor(product.id);
  const includedEntries = entries.filter((entry) => !override.excludedUrls.has(entry.url));
  const primaryUrl = primaryImageUrl(product, entries, override);
  const sortedEntries = [
    ...includedEntries.filter((entry) => entry.url === primaryUrl),
    ...includedEntries.filter((entry) => entry.url !== primaryUrl)
  ];

  return {
    ...product,
    imageUrl: primaryUrl,
    images: sortedEntries.map((entry) => ({
      url: entry.url,
      altText: entry.altText
    }))
  };
}

function restoreLocalWorkspaceState(products) {
  state.draftOverrides = new Map();
  state.imageOverrides = new Map();
  state.workspaceStatusOverrides = new Map();

  const productIds = new Set(products.map((product) => product.id));
  const payload = readLocalWorkspaceState();
  if (!payload) {
    return;
  }

  for (const entry of payload.draftOverrides || []) {
    if (!entry?.key || !entry?.draft) {
      continue;
    }

    const productId = productIdFromDraftKey(entry.key);
    if (productIds.has(productId)) {
      state.draftOverrides.set(entry.key, entry.draft);
    }
  }

  for (const entry of payload.imageOverrides || []) {
    if (!entry?.productId || !productIds.has(entry.productId)) {
      continue;
    }

    state.imageOverrides.set(entry.productId, {
      primaryUrl: String(entry.primaryUrl || ""),
      excludedUrls: new Set(Array.isArray(entry.excludedUrls) ? entry.excludedUrls.map(String) : [])
    });
  }

  for (const entry of payload.workspaceStatusOverrides || []) {
    if (!entry?.key) {
      continue;
    }

    const productId = productIdFromDraftKey(entry.key);
    if (!productIds.has(productId)) {
      continue;
    }

    const normalized = normalizeWorkspaceStatus(entry);
    if (normalized.status !== "not_started" || normalized.note.trim()) {
      state.workspaceStatusOverrides.set(entry.key, {
        status: normalized.status,
        note: normalized.note,
        updatedAt: normalized.updatedAt
      });
    }
  }
}

function persistLocalWorkspaceState() {
  const payload = {
    version: LOCAL_WORKSPACE_VERSION,
    updatedAt: new Date().toISOString(),
    draftOverrides: Array.from(state.draftOverrides.entries()).map(([key, draft]) => ({
      key,
      draft
    })),
    imageOverrides: Array.from(state.imageOverrides.entries())
      .map(([productId, override]) => ({
        productId,
        primaryUrl: override.primaryUrl || "",
        excludedUrls: Array.from(override.excludedUrls || [])
      }))
      .filter((entry) => entry.primaryUrl || entry.excludedUrls.length),
    workspaceStatusOverrides: Array.from(state.workspaceStatusOverrides.entries())
      .map(([key, record]) => ({
        key,
        ...normalizeWorkspaceStatus(record)
      }))
      .filter((entry) => entry.status !== "not_started" || entry.note.trim())
  };

  if (!payload.draftOverrides.length && !payload.imageOverrides.length && !payload.workspaceStatusOverrides.length) {
    removeLocalWorkspaceState();
    return;
  }

  try {
    window.localStorage?.setItem(localWorkspaceStorageKey(), JSON.stringify(payload));
  } catch {
    // Local persistence is a convenience layer; exports still work if storage is unavailable.
  }
}

function readLocalWorkspaceState() {
  try {
    const raw = window.localStorage?.getItem(localWorkspaceStorageKey());
    if (!raw) {
      return null;
    }

    const payload = JSON.parse(raw);
    return payload?.version === LOCAL_WORKSPACE_VERSION ? payload : null;
  } catch {
    return null;
  }
}

function clearLocalWorkspaceState() {
  state.draftOverrides = new Map();
  state.imageOverrides = new Map();
  state.workspaceStatusOverrides = new Map();
  removeLocalWorkspaceState();
  render();
  window.shopify?.toast?.show?.("Local QST edits cleared.");
}

function removeLocalWorkspaceState() {
  try {
    window.localStorage?.removeItem(localWorkspaceStorageKey());
  } catch {
    // Ignore unavailable storage.
  }
}

function localWorkspaceStorageKey() {
  const shop = inferredShopDomain() || state.account?.authentication?.shop || "local-preview";
  return `qst-listing-workspace:${shop}:local-workspace`;
}

function productIdFromDraftKey(key) {
  const text = String(key || "");
  const separator = text.indexOf(":");
  return separator >= 0 ? text.slice(separator + 1) : "";
}

function selectEbayReadyProducts() {
  state.selectedIds = new Set(
    state.filteredProducts
      .filter((product) => assessEbayPrep(applyImageCuration(product)).state === "ready")
      .map((product) => product.id)
  );
  render();
  window.shopify?.toast?.show?.("eBay-ready products selected.");
}

function downloadEbayBatch() {
  let products = getSelectedProductsForExport();
  if (!products.length) {
    products = state.filteredProducts
      .map(applyImageCuration)
      .filter((product) => assessEbayPrep(product).state === "ready");
  }

  if (!products.length) {
    window.shopify?.toast?.show?.("No eBay-ready products found in the current view.");
    return;
  }

  const date = new Date().toISOString().slice(0, 10);
  const draftOverrides = getDraftOverridesForExport(products);
  download(`qst-ebay-ready-batch-${date}.csv`, buildEbayPrepCsv(products, draftOverrides), "text/csv;charset=utf-8");
  markProductsWorkspaceStatus(products, "exported");
  window.shopify?.toast?.show?.("eBay batch generated.");
}

function downloadEbayPublishPlan() {
  let products = getSelectedProductsForExport();
  if (!products.length) {
    products = state.filteredProducts
      .map(applyImageCuration)
      .filter((product) => assessEbayPrep(product).state === "ready");
  }

  if (!products.length) {
    window.shopify?.toast?.show?.("No eBay-ready products found in the current view.");
    return;
  }

  const date = new Date().toISOString().slice(0, 10);
  const draftOverrides = getDraftOverridesForExport(products);
  const ebaySetup = state.ebaySettings?.settings || defaultEbaySettingsPayload().settings;
  download(
    `qst-ebay-publish-plan-${date}.json`,
    buildEbayPublishPlan(products, ebaySetup, draftOverrides),
    "application/json;charset=utf-8"
  );
  markProductsWorkspaceStatus(products, "ready");
  window.shopify?.toast?.show?.("eBay publish plan generated.");
}

function exportSelected(type) {
  const products = getSelectedProductsForExport();
  if (!products.length) {
    window.shopify?.toast?.show?.("Select one or more products first.");
    return;
  }

  const date = new Date().toISOString().slice(0, 10);
  const baseName = `qst-${state.marketplace}-listing-pack-${date}`;
  const draftOverrides = getDraftOverridesForExport(products);
  if (type === "csv") {
    download(`${baseName}.csv`, buildCsv(products, state.marketplace, draftOverrides), "text/csv;charset=utf-8");
  } else if (type === "workspace-json") {
    download(`${baseName}.workspace.json`, buildWorkspacePack(products, state.marketplace, draftOverrides), "application/json;charset=utf-8");
  } else {
    download(`${baseName}.txt`, buildTextPack(products, state.marketplace, draftOverrides), "text/plain;charset=utf-8");
  }

  markProductsWorkspaceStatus(products, "exported");
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

function filenamePart(value) {
  return String(value || "listing")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "listing";
}
