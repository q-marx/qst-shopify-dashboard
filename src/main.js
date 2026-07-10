import {
  assessEbayPrep,
  assessReadiness,
  buildCsv,
  buildEbayPrepCsv,
  buildEbayPrepSummary,
  buildEbayReviewPlan,
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
  { value: "drafted", label: "Draft in progress", className: "demo" },
  { value: "ready", label: "Ready to export", className: "ok" },
  { value: "exported", label: "Export downloaded", className: "ok" }
];
const WORKSPACE_STATUS_VALUES = new Set(WORKSPACE_STATUS_OPTIONS.map((option) => option.value));
const MARKETPLACE_TITLE_LIMITS = {
  ebay: 80,
  etsy: 140,
  vinted: 80,
  depop: 128,
  facebook: 100,
  gumtree: 100
};

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
  workStatusFilter: "all",
  source: "loading",
  loading: false,
  error: "",
  account: null,
  accountLoading: false,
  accountError: "",
  billing: null,
  billingLoading: false,
  billingError: "",
  ebayConnection: null,
  ebayConnectionLoading: false,
  ebayConnectionError: "",
  ebaySettings: defaultEbaySettingsPayload(),
  ebaySettingsLoading: false,
  ebaySettingsSaving: false,
  ebaySettingsError: "",
  recentListings: [],
  recentExports: [],
  activityLoading: false,
  activityError: "",
  pairing: null,
  pairingLoading: false,
  pairingError: ""
};

const app = document.querySelector("#app");

renderShell();
refreshProducts();
refreshAccount();
refreshEbayConnection();
refreshEbaySettings();
refreshActivity();

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
    state.ebaySettingsError = error.message || "Could not load export setup status.";
  } finally {
    state.ebaySettingsLoading = false;
    renderEbayWorkflow();
  }
}

async function refreshEbayConnection() {
  if (!isEmbeddedShopifyContext() && !demoMode) {
    state.ebayConnection = null;
    return;
  }

  state.ebayConnectionLoading = true;
  state.ebayConnectionError = "";
  renderEbayWorkflow();

  try {
    state.ebayConnection = await backendRequest(`/api/ebay/connection${accountContextQuery()}`);
  } catch (error) {
    state.ebayConnectionError = error.message || "Could not load eBay connection status.";
  } finally {
    state.ebayConnectionLoading = false;
    renderEbayWorkflow();
  }
}

async function refreshActivity() {
  if (!isEmbeddedShopifyContext() && !demoMode) {
    state.recentListings = [];
    state.recentExports = [];
    return;
  }

  state.activityLoading = true;
  state.activityError = "";
  renderActivityPanel();

  try {
    const [listings, exportsPayload] = await Promise.all([
      backendRequest(`/api/listings/recent${accountContextQuery()}`),
      backendRequest(`/api/exports/recent${accountContextQuery()}`)
    ]);
    state.recentListings = listings.listings || [];
    state.recentExports = exportsPayload.exports || [];
  } catch (error) {
    state.activityError = error.message || "Could not load recent listing activity.";
  } finally {
    state.activityLoading = false;
    renderActivityPanel();
  }
}

function renderShell() {
  app.innerHTML = `
    <main class="app-shell">
      <nav class="app-nav" aria-label="QST workspace sections">
        <a href="#overview">Overview</a>
        <a href="#settings">Filters</a>
        <a href="#listing-review">Products</a>
        <a href="#exports">Downloads</a>
        <a href="#marketplace-export">Export setup</a>
        <a href="#activity-panel">Activity</a>
        <a href="#desktop-companion">Desktop companion</a>
        <a href="#support">Support</a>
      </nav>

      <section class="hero-band" id="overview">
        <div>
          <p class="eyebrow">Read-only Shopify product workspace</p>
          <h1>Prepare marketplace export packs from Shopify products inside Shopify Admin.</h1>
          <p class="hero-copy">
            Search products, review readiness, save draft records, and download marketplace-ready packs without changing your Shopify catalogue.
          </p>
        </div>
        <div class="source-card" id="source-card"></div>
      </section>

      <section class="metrics-grid" id="metrics"></section>

      <section class="toolbar" id="settings">
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
          <span>Progress</span>
          <select id="work-status-filter">
            <option value="all">All progress</option>
            ${WORKSPACE_STATUS_OPTIONS.map((option) => `<option value="${escapeAttribute(option.value)}">${escapeHtml(option.label)}</option>`).join("")}
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

      <section class="workspace-grid" id="listing-review">
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

      <section class="bulk-panel" id="bulk-panel"></section>

      <section class="export-bar" id="exports">
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

      <section class="workflow-panel" id="ebay-workflow"></section>

      <section class="activity-panel" id="activity-panel"></section>

      <section class="account-grid" id="account-panel"></section>

      <section class="support-strip" id="support">
        <div>
          <strong>QST reads Shopify product information to prepare listings. It does not change your Shopify catalogue.</strong>
          <span>Prepare drafts, save records, and download export packs inside Shopify Admin. QST Desktop is optional for advanced local workflows.</span>
        </div>
        <div class="support-links" aria-label="Support links">
          <a href="mailto:qst.support@q-mer.ch">Support</a>
          <a href="https://q-mer.ch/policies/privacy-policy" target="_blank" rel="noreferrer">Privacy</a>
          <a href="https://q-mer.ch/policies/terms-of-service" target="_blank" rel="noreferrer">Terms</a>
          <a href="https://q-mer.ch/policies/contact-information" target="_blank" rel="noreferrer">Contact</a>
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
  document.querySelector("#work-status-filter").addEventListener("change", (event) => {
    state.workStatusFilter = event.target.value;
    applyFilters();
    render();
  });
  document.querySelector("#marketplace-select").addEventListener("change", (event) => {
    state.marketplace = event.target.value;
    applyFilters();
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
    const workStatus = workspaceStatusFor(product.id).status;
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
      (state.statusFilter === "all" || product.status === state.statusFilter) &&
      (state.workStatusFilter === "all" || workStatus === state.workStatusFilter)
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
  renderActivityPanel();
  renderEbayWorkflow();
  renderBulkPanel();
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
    metric("Listing rows", variants),
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

function renderActivityPanel() {
  const panel = document.querySelector("#activity-panel");
  if (!panel) {
    return;
  }

  const latestListing = state.recentListings[0];
  const latestExport = state.recentExports[0];
  const exportStatus = state.products.length ? "Ready" : state.loading ? "Loading" : "Available";
  const exportStatusClass = state.products.length ? "ok" : state.loading ? "demo" : "neutral";

  panel.innerHTML = `
    <article>
      <span class="status-pill ${exportStatusClass}">${escapeHtml(exportStatus)}</span>
      <div>
        <h2>Marketplace export packs</h2>
        <p>Prepare CSV, workspace, and review packs from read-only Shopify data.</p>
      </div>
    </article>
    <article>
      <span class="status-pill ${latestListing ? "ok" : "neutral"}">${escapeHtml(state.recentListings.length)}</span>
      <div>
        <h2>Saved draft records</h2>
        <p>${latestListing ? `${latestListing.productTitle} - ${latestListing.status}` : "No saved draft records yet."}</p>
      </div>
    </article>
    <article>
      <span class="status-pill ${latestExport ? "ok" : "neutral"}">${escapeHtml(state.recentExports.length)}</span>
      <div>
        <h2>Recent exports</h2>
        <p>${latestExport ? `${latestExport.exportType} - ${latestExport.productCount} product${latestExport.productCount === 1 ? "" : "s"}` : "No export records yet."}</p>
      </div>
    </article>
    ${state.activityError ? `<p class="inline-error">${escapeHtml(state.activityError)}</p>` : ""}
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
  const webEbayOAuth = webEbayOAuthEnabled();
  const ebayConnected = Boolean(state.ebayConnection?.connected);
  const ebayEnvironment = state.ebayConnection?.environment || "sandbox";
  const ebayConfigured = state.ebayConnection?.configured !== false;
  const exportSetupSummary = setupSummaryFromSettings(ebaySetup);
  const setupStatusClass = exportSetupSummary.ready ? "ok" : exportSetupSummary.completed ? "demo" : "warning";
  const setupStatusLabel = state.ebaySettingsLoading
    ? "Loading"
    : exportSetupSummary.ready
      ? "Ready"
      : `${exportSetupSummary.completed}/${exportSetupSummary.total} complete`;
  const webOAuthControls = webEbayOAuth
    ? `
      <button class="secondary-button" id="connect-ebay" ${state.ebayConnectionLoading || !ebayConfigured || ebayConnected ? "disabled" : ""}>${state.ebayConnectionLoading ? "Checking..." : ebayConnected ? "eBay connected" : "Connect eBay"}</button>
      <button class="secondary-button" id="disconnect-ebay" ${state.ebayConnectionLoading || !ebayConnected ? "disabled" : ""}>Disconnect</button>
    `
    : "";
  const webOAuthCheck = webEbayOAuth
    ? ebaySetupCheck("sellerAccountConnected", `OAuth connected (${ebayEnvironment})`, ebayConnected, { disabled: true })
    : "";

  panel.innerHTML = `
    <div class="workflow-copy">
      <p class="eyebrow" id="marketplace-export">Marketplace export preparation</p>
      <h2>Prepare export-ready listing packs from Shopify products</h2>
      <p>
        QST turns selected Shopify products into draft records and export packs with copy, prices, SKUs, images, variant rows, readiness notes, and category search hints.
      </p>
      <p class="workflow-note">
        The Shopify app creates review packs and eBay-compatible CSV exports. Direct eBay publishing remains available in QST Desktop after the merchant connects eBay there.
      </p>
      ${webEbayOAuth && state.ebayConnectionError ? `<p class="inline-error">${escapeHtml(state.ebayConnectionError)}</p>` : ""}
    </div>
    <div class="workflow-status">
      <div>
        <span>Ready in view</span>
        <strong>${escapeHtml(readyLabel)}</strong>
      </div>
      <div>
        <span>Listing rows</span>
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
      <span class="batch-state">${escapeHtml(selectedLabel)}${selected.length ? `, ${selectedSummary.ready} export-ready` : ""}</span>
      ${webOAuthControls}
      <button class="secondary-button" id="select-ebay-ready" ${summary.ready ? "" : "disabled"}>Select export-ready</button>
      <button class="secondary-button" id="prepare-ebay-listings" ${selected.length ? "" : "disabled"}>Save draft records</button>
      <button class="secondary-button" id="download-ebay-plan" ${summary.ready || selected.length ? "" : "disabled"}>Download review plan</button>
      <button class="primary-button" id="download-ebay-batch" ${summary.ready || selected.length ? "" : "disabled"}>Download eBay CSV pack</button>
    </div>
    <div class="workflow-setup">
      <div class="setup-heading">
        <div>
          <h3>Export setup notes</h3>
          <p>Optional seller-review checks for details QST cannot infer from Shopify product data. They are saved with review plans and exports.</p>
        </div>
        <span class="status-pill ${setupStatusClass}">${escapeHtml(setupStatusLabel)}</span>
      </div>
      <div class="setup-checks">
        ${webOAuthCheck}
        ${ebaySetupCheck(
          "businessPoliciesReady",
          "Policy notes added",
          "Payment, return, fulfilment, and marketplace seller rules have been captured in setup notes.",
          ebaySetup.businessPoliciesReady
        )}
        ${ebaySetupCheck(
          "dispatchLocationReady",
          "Dispatch location added",
          "Country, postcode, or stock location is recorded for marketplace review.",
          ebaySetup.dispatchLocationReady
        )}
        ${ebaySetupCheck(
          "defaultCategoryReady",
          "Fallback category note added",
          "A default category or search hint is recorded for products needing category review.",
          ebaySetup.defaultCategoryReady
        )}
      </div>
      <div class="setup-fields">
        <label>
          <span>Fallback category note</span>
          <input id="ebay-category-label" type="text" value="${escapeAttribute(ebaySetup.defaultCategoryLabel)}" placeholder="Example: Home decor, seller review needed" />
        </label>
        <label>
          <span>Setup notes</span>
          <input id="ebay-setup-notes" type="text" value="${escapeAttribute(ebaySetup.notes)}" placeholder="Policy, dispatch, or category notes for exports" />
        </label>
        <button class="secondary-button" id="save-ebay-setup" ${state.ebaySettingsSaving || state.ebaySettingsLoading ? "disabled" : ""}>
          ${state.ebaySettingsSaving ? "Saving..." : "Save setup"}
        </button>
      </div>
      ${state.ebaySettingsError ? `<p class="inline-error">${escapeHtml(state.ebaySettingsError)}</p>` : ""}
    </div>
  `;

  panel.querySelector("#connect-ebay")?.addEventListener("click", startEbayOAuth);
  panel.querySelector("#disconnect-ebay")?.addEventListener("click", disconnectEbay);
  panel.querySelector("#select-ebay-ready")?.addEventListener("click", selectEbayReadyProducts);
  panel.querySelector("#prepare-ebay-listings")?.addEventListener("click", prepareSelectedListings);
  panel.querySelector("#download-ebay-plan")?.addEventListener("click", downloadEbayReviewPlan);
  panel.querySelector("#download-ebay-batch")?.addEventListener("click", downloadEbayBatch);
  panel.querySelector("#save-ebay-setup")?.addEventListener("click", saveEbaySetupFromPanel);
}

function renderBulkPanel() {
  const panel = document.querySelector("#bulk-panel");
  if (!panel) {
    return;
  }

  const selected = getSelectedProducts();
  const visibleCount = state.filteredProducts.length;
  const selectedText = selected.length
    ? `${selected.length} selected for ${marketplaceLabel(state.marketplace)}`
    : "No products selected";

  panel.innerHTML = `
    <div class="bulk-copy">
      <p class="eyebrow">Bulk draft updates</p>
      <h2>Update selected product drafts</h2>
      <p>Apply the same progress stage, title prefix, or tag to selected draft records. Store product data is not changed.</p>
    </div>
    <div class="bulk-controls">
      <span class="batch-state">${escapeHtml(selectedText)}</span>
      <label>
        <span>Set progress</span>
        <select id="bulk-status">
          <option value="">Keep progress</option>
          ${WORKSPACE_STATUS_OPTIONS.map((option) => `<option value="${escapeAttribute(option.value)}">${escapeHtml(option.label)}</option>`).join("")}
        </select>
      </label>
      <label>
        <span>Title prefix</span>
        <input id="bulk-title-prefix" type="text" placeholder="Example: Handmade" />
      </label>
      <label>
        <span>Append tag</span>
        <input id="bulk-tag" type="text" placeholder="Example: ebay-ready" />
      </label>
      <button class="secondary-button" id="bulk-select-visible" ${visibleCount ? "" : "disabled"}>Select visible</button>
      <button class="primary-button" id="bulk-apply" ${selected.length ? "" : "disabled"}>Apply changes</button>
    </div>
  `;

  panel.querySelector("#bulk-select-visible")?.addEventListener("click", () => {
    state.selectedIds = new Set(state.filteredProducts.map((product) => product.id));
    render();
  });
  panel.querySelector("#bulk-apply")?.addEventListener("click", applyBulkLocalPrep);
}

function applyBulkLocalPrep() {
  const products = getSelectedProducts();
  if (!products.length) {
    window.shopify?.toast?.show?.("Select products before applying changes.");
    return;
  }

  const status = document.querySelector("#bulk-status")?.value || "";
  const titlePrefix = document.querySelector("#bulk-title-prefix")?.value.trim() || "";
  const tag = document.querySelector("#bulk-tag")?.value.trim() || "";
  const hasDraftChange = Boolean(titlePrefix || tag);

  if (!status && !hasDraftChange) {
    window.shopify?.toast?.show?.("Choose a progress stage, title prefix, or tag first.");
    return;
  }

  const updatedAt = new Date().toISOString();
  for (const product of products) {
    if (hasDraftChange) {
      const draft = getDraft(product);
      const next = {
        ...draft,
        title: titlePrefix ? titleWithPrefix(draft.title, titlePrefix, state.marketplace) : draft.title,
        tags: tag ? tagsWithAppended(draft.tags, tag) : draft.tags
      };
      state.draftOverrides.set(draftKey(product.id, state.marketplace), next);
    }

    if (status) {
      setWorkspaceStatusRecord(product.id, status, updatedAt);
    } else if (hasDraftChange) {
      setWorkspaceStatusRecord(product.id, "drafted", updatedAt);
    }
  }

  persistLocalWorkspaceState();
  applyFilters();
  render();
  window.shopify?.toast?.show?.("Bulk prep applied locally.");
}

function ebaySetupCheck(key, label, descriptionOrChecked, checkedOrOptions = false, maybeOptions = {}) {
  const hasDescription = typeof descriptionOrChecked === "string";
  const description = hasDescription ? descriptionOrChecked : "";
  const checked = hasDescription ? checkedOrOptions : descriptionOrChecked;
  const options = hasDescription ? maybeOptions : checkedOrOptions;

  return `
    <label class="setup-check">
      <input type="checkbox" data-ebay-setup="${escapeAttribute(key)}" ${checked ? "checked" : ""} ${options.disabled ? "disabled" : ""} />
      <span class="setup-check-copy">
        <strong>${escapeHtml(label)}</strong>
        ${description ? `<small>${escapeHtml(description)}</small>` : ""}
      </span>
    </label>
  `;
}

async function startEbayOAuth() {
  state.ebayConnectionLoading = true;
  state.ebayConnectionError = "";
  renderEbayWorkflow();

  try {
    const result = await backendRequest("/api/ebay/oauth/start", {
      method: "POST",
      body: JSON.stringify({
        shop: inferredShopDomain(),
        returnTo: window.location.pathname + window.location.search
      })
    });
    window.top.location.href = result.authorizeUrl;
  } catch (error) {
    state.ebayConnectionError = error.message || "Could not start eBay OAuth.";
    state.ebayConnectionLoading = false;
    renderEbayWorkflow();
  }
}

async function disconnectEbay() {
  state.ebayConnectionLoading = true;
  state.ebayConnectionError = "";
  renderEbayWorkflow();

  try {
    state.ebayConnection = await backendRequest(`/api/ebay/connection${accountContextQuery()}`, {
      method: "DELETE"
    });
    await refreshEbaySettings();
    window.shopify?.toast?.show?.("eBay connection removed for this Shopify shop.");
  } catch (error) {
    state.ebayConnectionError = error.message || "Could not disconnect eBay.";
  } finally {
    state.ebayConnectionLoading = false;
    renderEbayWorkflow();
    renderActivityPanel();
  }
}

async function saveEbaySetupFromPanel() {
  const panel = document.querySelector("#ebay-workflow");
  if (!panel) {
    return;
  }

  const settings = {
    sellerAccountConnected: webEbayOAuthEnabled() && Boolean(state.ebayConnection?.connected),
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
    window.shopify?.toast?.show?.("Export setup saved.");
  } catch (error) {
    state.ebaySettings = previousSettings;
    state.ebaySettingsError = error.message || "Could not save export setup status.";
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

function webEbayOAuthEnabled() {
  return state.account?.marketplaces?.ebay?.webOauthEnabled === true;
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
  const shopifyReauthorizeUrl = account?.authentication?.shopifyReauthorizeUrl || "";
  const shopifySessionMissing = Boolean(account && account.authentication?.shopifySessionStored === false && shopifyReauthorizeUrl);
  const desktopPairingEnabled = desktop.pairingEnabled === true;
  const canPairDesktop = desktopPairingEnabled && !shopifySessionMissing;
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
  const pairingStatus = !desktopPairingEnabled ? "Pending" : shopifySessionMissing ? "Needs auth" : state.pairing ? "Ready" : "Not paired";
  const pairingCopy = shopifySessionMissing
    ? "Re-authorise Shopify first so QST Desktop can load products through this workspace."
    : desktopPairingEnabled
      ? "Generate a short code, then enter it in QST Desktop's Shopify workspace pairing screen."
      : "Pairing is paused until the released QST Desktop build includes the Shopify workspace pairing screen.";

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

    <article class="account-card" id="desktop-companion">
      <div class="account-heading">
        <span class="status-pill ${desktop.available ? "ok" : "demo"}">${escapeHtml(desktopStatus)}</span>
        <h2>Windows companion</h2>
      </div>
      <p class="account-copy">Optional companion for advanced desktop-first workflows after setup, using the same Shopify workspace.</p>
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
        <span class="status-pill ${state.pairing ? "ok" : "demo"}">${escapeHtml(pairingStatus)}</span>
        <h2>Desktop pairing</h2>
      </div>
      <p class="account-copy">${escapeHtml(pairingCopy)}</p>
      ${shopifySessionMissing ? `<p class="inline-error">Shopify server authorisation is missing for this store.</p>` : ""}
      ${state.pairing ? pairingCodeMarkup(state.pairing) : ""}
      ${state.pairingError ? `<p class="inline-error">${escapeHtml(state.pairingError)}</p>` : ""}
      <div class="account-actions">
        ${shopifySessionMissing ? `<a class="secondary-button link-button" href="${escapeAttribute(shopifyReauthorizeUrl)}" target="_top">Re-authorise Shopify</a>` : ""}
        <button class="secondary-button" id="generate-pairing" ${state.pairingLoading || !canPairDesktop ? "disabled" : ""}>
          ${state.pairingLoading ? "Generating..." : shopifySessionMissing ? "Authorise first" : desktopPairingEnabled ? "Generate code" : "Pairing pending"}
        </button>
      </div>
    </article>
  `;

  panel.querySelector("#refresh-account")?.addEventListener("click", refreshAccount);
  panel.querySelector("#generate-pairing")?.addEventListener("click", generatePairingCode);
  panel.querySelector("[data-copy-pairing-code]")?.addEventListener("click", copyPairingCode);
}

function pairingCodeMarkup(pairing) {
  return `
    <div class="pairing-box">
      <div class="pairing-code-row">
        <strong>${escapeHtml(pairing.code)}</strong>
        <button class="secondary-button compact-button" type="button" data-copy-pairing-code="${escapeAttribute(pairing.code)}">Copy code</button>
      </div>
      <span>Expires ${escapeHtml(formatDateTime(pairing.expiresAt))}</span>
    </div>
  `;
}

async function copyPairingCode(event) {
  const button = event.currentTarget;
  const code = button.dataset.copyPairingCode || state.pairing?.code || "";
  if (!code) {
    window.shopify?.toast?.show?.("No pairing code to copy.");
    return;
  }

  const copied = await copyTextToClipboard(code);
  window.shopify?.toast?.show?.(copied ? "Pairing code copied." : "Could not copy pairing code.");
  if (copied) {
    button.textContent = "Copied";
    window.setTimeout(() => {
      if (button.isConnected) {
        button.textContent = "Copy code";
      }
    }, 1800);
  }
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
      renderBulkPanel();
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
      <section class="draft-layout">
        <div class="draft-main-column">
          <div class="draft-image">${curatedProduct.imageUrl ? `<img src="${escapeHtml(curatedProduct.imageUrl)}" alt="" />` : "<span>No image selected</span>"}</div>
          <div class="draft-fields-card">
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
          </div>
          <div class="checklist">
            <h3>Readiness checks</h3>
            ${readiness.checks.map(checkItem).join("")}
          </div>
        </div>
        <div class="draft-side-column">
          ${workspaceStatusPanel(product)}
          ${imageCurationPanel(product)}
          ${listingWorkbenchPanel()}
          ${state.marketplace === "ebay" ? ebayDraftStatus(curatedProduct) : ""}
          <div class="variant-box">
            <h3>Listing rows</h3>
            ${variantList(product)}
          </div>
        </div>
      </section>
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
  const updated = current.updatedAt ? `Updated ${formatDateTime(current.updatedAt)}` : "No QST progress saved yet.";

  return `
    <div class="workspace-status-card">
      <div class="workspace-status-heading">
        <div>
          <h3>Product export progress</h3>
          <p>Local QST progress for filtering products. It does not publish or edit marketplace listings.</p>
        </div>
        <span class="status-pill ${current.className}" data-workspace-status-pill>${escapeHtml(current.label)}</span>
      </div>
      <div class="workspace-status-controls">
        <label>
          <span>Stage</span>
          <select id="workspace-status-select">
            ${WORKSPACE_STATUS_OPTIONS.map(
              (option) => `<option value="${escapeAttribute(option.value)}" ${option.value === current.status ? "selected" : ""}>${escapeHtml(option.label)}</option>`
            ).join("")}
          </select>
        </label>
        <label>
          <span>Reminder note</span>
          <input id="workspace-status-note" type="text" value="${escapeAttribute(current.note)}" placeholder="Example: Check category before export" />
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
        <h3>Actions</h3>
        <span>${escapeHtml(marketplaceLabel(state.marketplace))}</span>
      </div>
      <div class="listing-action-grid">
        <button class="secondary-button" data-copy-listing-field="title">Copy title</button>
        <button class="secondary-button" data-copy-listing-field="description">Copy description</button>
        <button class="secondary-button" data-copy-listing-field="tags">Copy tags</button>
        <button class="secondary-button" data-copy-listing-field="pack">Copy draft pack</button>
        <button class="secondary-button" data-download-current-listing>Download draft file</button>
        <button class="secondary-button" data-prepare-current-listing>Save draft record</button>
        <button class="primary-button" data-mark-current-ready>Mark ready to export</button>
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

  container.querySelector("[data-prepare-current-listing]")?.addEventListener("click", async () => {
    const previousSelection = new Set(state.selectedIds);
    state.selectedIds = new Set([product.id]);
    await prepareSelectedListings();
    state.selectedIds = previousSelection;
    render();
  });

  container.querySelector("[data-mark-current-ready]")?.addEventListener("click", () => {
    saveWorkspaceStatus(product.id, {
      status: "ready"
    });
    window.shopify?.toast?.show?.("Marked ready to export.");
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
  const filename = `qst-${state.marketplace}-${name}-${date}.txt`;
  download(
    filename,
    buildTextPack([curatedProduct], state.marketplace, {
      [product.id]: draft
    }),
    "text/plain;charset=utf-8"
  );
  void recordExport("single_listing_pack", [curatedProduct], filename);
  markProductsWorkspaceStatus([product], "exported");
  window.shopify?.toast?.show?.("Draft file downloaded.");
}

function ebayDraftStatus(product) {
  const prep = assessEbayPrep(product);
  const blockerText = prep.blockers.length
    ? prep.blockers.map((check) => check.label).join(", ")
    : "Ready to download as an export pack.";

  return `
    <div class="ebay-detail">
      <div class="ebay-detail-heading">
        <h3>Download readiness</h3>
        <span class="readiness-pill ${prep.state}">${prep.score}%</span>
      </div>
      <div class="ebay-facts">
        <span>Suggested category <strong>${escapeHtml(prep.categoryHint.label)}</strong></span>
        <span>Images selected <strong>${escapeHtml(prep.imageCount)}</strong></span>
        <span>Listing rows <strong>${escapeHtml(prep.inventoryRows)}</strong></span>
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
          <p>Pick images included in downloaded export packs.</p>
        </div>
        <span>${includedCount}/${entries.length} included</span>
      </div>
      <div class="image-choice-list ${entries.length > 4 ? "scrollable" : ""}">
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
    applyFilters();
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
    applyFilters();
    renderMetrics();
    renderProducts();
    renderBulkPanel();
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
  const updatedAt = new Date().toISOString();
  for (const product of products) {
    setWorkspaceStatusRecord(product.id, status, updatedAt);
  }
  persistLocalWorkspaceState();
  applyFilters();
  renderMetrics();
  renderProducts();
  renderBulkPanel();
  renderDraft();
  renderEbayWorkflow();
}

function setWorkspaceStatusRecord(productId, status, updatedAt = new Date().toISOString()) {
  const current = workspaceStatusFor(productId);
  const next = normalizeWorkspaceStatus({
    ...current,
    status,
    updatedAt
  });

  if (next.status === "not_started" && !next.note.trim()) {
    state.workspaceStatusOverrides.delete(workspaceKey(productId));
    return;
  }

  state.workspaceStatusOverrides.set(workspaceKey(productId), {
    status: next.status,
    note: next.note,
    updatedAt: next.updatedAt
  });
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
    updated.textContent = current.updatedAt ? `Updated ${formatDateTime(current.updatedAt)}` : "No QST progress saved yet.";
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
    return `<p>No listing rows returned from Shopify.</p>`;
  }

  return variants
    .slice(0, 12)
    .map((variant) => {
      const options = variantOptionSummary(variant);
      const label = options || (variants.length === 1 ? "Single listing row" : variant.title || "Listing row");
      const details = [variant.sku ? `SKU ${variant.sku}` : "", variant.price ? `Price ${variant.price}` : ""].filter(Boolean).join(" - ");
      return `
        <div class="variant-row">
          <strong>${escapeHtml(label)}</strong>
          <span>${escapeHtml(details)}</span>
        </div>
      `;
    })
    .join("");
}

function variantOptionSummary(variant) {
  return (variant.selectedOptions ?? [])
    .filter((option) => {
      const name = String(option.name || "").trim().toLowerCase();
      const value = String(option.value || "").trim().toLowerCase();
      return value && value !== "default title" && name !== "title";
    })
    .map((option) => `${option.name}: ${option.value}`)
    .join(", ");
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

function titleWithPrefix(title, prefix, marketplace) {
  const cleanPrefix = String(prefix || "").trim();
  const cleanTitle = String(title || "").trim();
  if (!cleanPrefix) {
    return cleanTitle;
  }

  const lowerTitle = cleanTitle.toLowerCase();
  const lowerPrefix = cleanPrefix.toLowerCase();
  const combined = lowerTitle.startsWith(`${lowerPrefix} `) || lowerTitle === lowerPrefix
    ? cleanTitle
    : `${cleanPrefix} ${cleanTitle}`.trim();

  return trimToMarketplaceTitle(combined, marketplace);
}

function tagsWithAppended(tags, tag) {
  const next = Array.isArray(tags) ? [...tags] : [];
  const cleanTag = String(tag || "").trim();
  if (!cleanTag) {
    return next;
  }

  return next.some((candidate) => candidate.toLowerCase() === cleanTag.toLowerCase())
    ? next
    : [...next, cleanTag];
}

function trimToMarketplaceTitle(value, marketplace) {
  const limit = MARKETPLACE_TITLE_LIMITS[marketplace] || 80;
  const text = String(value || "").trim();
  if (text.length <= limit) {
    return text;
  }

  return `${text.slice(0, Math.max(limit - 3, 1)).trimEnd()}...`;
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
  if (markWorkspaceDrafted(product.id)) {
    applyFilters();
  }
  persistLocalWorkspaceState();
}

function setPrimaryImage(product, url) {
  const override = imageOverrideFor(product.id);
  override.excludedUrls.delete(url);
  override.primaryUrl = url;
  if (markWorkspaceDrafted(product.id)) {
    applyFilters();
  }
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
  applyFilters();
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
  window.shopify?.toast?.show?.("Export-ready products selected.");
}

async function prepareSelectedListings() {
  const products = getSelectedProductsForExport();
  if (!products.length) {
    window.shopify?.toast?.show?.("Select one or more products first.");
    return;
  }

  const payloadProducts = products.map((product) => ({
    product,
    draft: getDraft(product),
    checks: state.marketplace === "ebay"
      ? assessEbayPrep(product).checks
      : assessReadiness(product).checks
  }));

  try {
    const result = await backendRequest("/api/listings/prepare", {
      method: "POST",
      body: JSON.stringify({
        shop: inferredShopDomain(),
        marketplace: state.marketplace,
        products: payloadProducts
      })
    });
    const failed = (result.records || []).filter((record) => record.status !== "prepared").length;
    markProductsWorkspaceStatus(products, failed ? "drafted" : "ready");
    await refreshActivity();
    window.shopify?.toast?.show?.(
      failed
        ? `Saved with ${failed} validation issue${failed === 1 ? "" : "s"}.`
        : "Draft records saved."
    );
  } catch (error) {
    window.shopify?.toast?.show?.(error.message || "Could not save draft records.");
  }
}

function downloadEbayBatch() {
  let products = getSelectedProductsForExport();
  if (!products.length) {
    products = state.filteredProducts
      .map(applyImageCuration)
      .filter((product) => assessEbayPrep(product).state === "ready");
  }

  if (!products.length) {
    window.shopify?.toast?.show?.("No export-ready products found in the current view.");
    return;
  }

  const date = new Date().toISOString().slice(0, 10);
  const draftOverrides = getDraftOverridesForExport(products);
  const filename = `qst-ebay-ready-batch-${date}.csv`;
  download(filename, buildEbayPrepCsv(products, draftOverrides), "text/csv;charset=utf-8");
  void recordExport("ebay_batch_csv", products, filename);
  markProductsWorkspaceStatus(products, "exported");
  window.shopify?.toast?.show?.("eBay CSV pack generated.");
}

function downloadEbayReviewPlan() {
  let products = getSelectedProductsForExport();
  if (!products.length) {
    products = state.filteredProducts
      .map(applyImageCuration)
      .filter((product) => assessEbayPrep(product).state === "ready");
  }

  if (!products.length) {
    window.shopify?.toast?.show?.("No export-ready products found in the current view.");
    return;
  }

  const date = new Date().toISOString().slice(0, 10);
  const draftOverrides = getDraftOverridesForExport(products);
  const ebaySetup = state.ebaySettings?.settings || defaultEbaySettingsPayload().settings;
  const filename = `qst-ebay-review-plan-${date}.json`;
  download(
    filename,
    buildEbayReviewPlan(products, ebaySetup, draftOverrides),
    "application/json;charset=utf-8"
  );
  void recordExport("ebay_review_plan", products, filename);
  markProductsWorkspaceStatus(products, "ready");
  window.shopify?.toast?.show?.("Review plan generated.");
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
  let filename = "";
  let exportType = "";
  if (type === "csv") {
    filename = `${baseName}.csv`;
    exportType = "marketplace_csv";
    download(filename, buildCsv(products, state.marketplace, draftOverrides), "text/csv;charset=utf-8");
  } else if (type === "workspace-json") {
    filename = `${baseName}.workspace.json`;
    exportType = "workspace_pack_json";
    download(filename, buildWorkspacePack(products, state.marketplace, draftOverrides), "application/json;charset=utf-8");
  } else {
    filename = `${baseName}.txt`;
    exportType = "copy_ready_listing_pack";
    download(filename, buildTextPack(products, state.marketplace, draftOverrides), "text/plain;charset=utf-8");
  }

  void recordExport(exportType, products, filename);
  markProductsWorkspaceStatus(products, "exported");
  window.shopify?.toast?.show?.("QST export generated.");
}

async function recordExport(exportType, products, filename) {
  try {
    await backendRequest("/api/exports/record", {
      method: "POST",
      body: JSON.stringify({
        shop: inferredShopDomain(),
        marketplace: state.marketplace,
        exportType,
        productCount: products.length,
        productIds: products.map((product) => product.id),
        filename
      })
    });
    await refreshActivity();
  } catch {
    // Export files are still valid if activity persistence is temporarily unavailable.
  }
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
