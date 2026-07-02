import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import pg from "pg";

const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const dataDir = path.join(rootDir, "data");
const distDir = path.join(rootDir, "dist");

loadEnvFile(path.join(rootDir, ".env"));

const isProduction = process.env.NODE_ENV === "production";
const port = Number(process.env.PORT || process.env.FRONTEND_PORT || 5173);
const host = isProduction || process.env.RENDER || process.env.HOST ? "0.0.0.0" : "127.0.0.1";
const pairingTtlMinutes = Math.max(Number(process.env.QST_PAIRING_TTL_MINUTES || 15), 1);
const desktopPairingEnabled = envFlag("QST_DESKTOP_PAIRING_ENABLED", false);
const pairingCodes = new Map();
const marketplaceSettings = new Map();
const oauthStates = new Map();
const shopifySessions = new Map();
const ebayConnections = new Map();
const desktopEbayOAuthRequests = new Map();
const listingRecords = new Map();
const exportRecords = new Map();
const databaseUrl = safeString(process.env.DATABASE_URL);
const db = databaseUrl
  ? new Pool({
      connectionString: databaseUrl,
      ssl: isProduction ? { rejectUnauthorized: false } : undefined
    })
  : null;
let dbReady = false;
let dbInitError = "";
let dbInitInProgress = false;

const app = express();
app.disable("x-powered-by");
app.use(securityHeaders);

const webhookPaths = [
  "/webhooks",
  "/webhooks/app/uninstalled",
  "/webhooks/customers/data_request",
  "/webhooks/customers/redact",
  "/webhooks/shop/redact"
];

for (const route of webhookPaths) {
  app.post(route, express.raw({ type: "*/*", limit: "1mb" }), handleWebhook);
}

app.use(express.json({ limit: "512kb" }));

app.get("/healthz", (_request, response) => {
  response.json({
    ok: true,
    app: "QST Listing Workspace",
    time: new Date().toISOString()
  });
});

app.get("/readyz", async (_request, response) => {
  const storage = storageHealth();
  if (db && dbReady) {
    try {
      await db.query("select 1");
    } catch (error) {
      response.status(503).json({
        ok: false,
        storage: "postgres",
        postgresReady: false,
        storageReady: false,
        storageError: error.message || "Postgres readiness check failed."
      });
      return;
    }
  }

  const ready = !isProduction || Boolean(db && dbReady);
  response.status(ready ? 200 : 503).json({
    ok: ready,
    app: "QST Listing Workspace",
    ...storage,
    requiredStorage: isProduction ? "postgres" : "memory_or_postgres",
    time: new Date().toISOString()
  });
});

app.get("/api/health", (_request, response) => {
  const storage = storageHealth();

  response.json({
    ok: true,
    app: "QST Listing Workspace",
    mode: isProduction ? "production" : "development",
    healthz: "/healthz",
    readyz: "/readyz",
    ...storage,
    time: new Date().toISOString()
  });
});

app.get("/api/account", async (request, response) => {
  try {
    response.json(await buildAccountPayload(authenticateAppBridgeRequest(request), request));
  } catch (error) {
    response.status(500).json({ error: redactError(error) });
  }
});

app.get("/api/marketplace-settings/ebay", async (request, response) => {
  const context = requireShopifyApiContext(request, response);
  if (!context) {
    return;
  }

  const { shop } = context;
  const settings = await getMarketplaceSettings(shop, "ebay");
  response.json({
    shop,
    marketplace: "ebay",
    settings,
    summary: ebaySettingsSummary(settings)
  });
});

app.put("/api/marketplace-settings/ebay", async (request, response) => {
  const context = requireShopifyApiContext(request, response);
  if (!context) {
    return;
  }

  const { shop } = context;
  const settings = normalizeEbaySettings(request.body?.settings || request.body || {});
  await saveMarketplaceSettings(shop, "ebay", settings);
  await recordEvent("ebay_setup_updated", {
    shop,
    completed: ebaySettingsSummary(settings).completed,
    ready: ebaySettingsSummary(settings).ready
  });

  response.json({
    shop,
    marketplace: "ebay",
    settings,
    summary: ebaySettingsSummary(settings)
  });
});

app.get("/api/ebay/connection", async (request, response) => {
  const context = requireShopifyApiContext(request, response);
  if (!context) {
    return;
  }

  const connection = await getEbayConnection(context.shop);
  response.json(buildEbayConnectionPayload(context.shop, connection, request));
});

app.post("/api/ebay/oauth/start", async (request, response) => {
  const context = requireShopifyApiContext(request, response);
  if (!context) {
    return;
  }

  const config = ebayOAuthConfig(request);
  if (!config.ready) {
    response.status(409).json({
      error: config.error,
      environment: config.environment,
      configured: false
    });
    return;
  }

  const state = await createOAuthState({
    provider: "ebay",
    shop: context.shop,
    ttlMinutes: 15,
    metadata: {
      environment: config.environment,
      returnTo: safeString(request.body?.returnTo) || "/"
    }
  });
  const authorizeUrl = ebayAuthorizeUrl(config, state.state);

  await recordEvent("ebay_oauth_started", {
    shop: context.shop,
    environment: config.environment
  });

  response.status(201).json({
    shop: context.shop,
    environment: config.environment,
    authorizeUrl,
    expiresAt: state.expiresAt
  });
});

app.delete("/api/ebay/connection", async (request, response) => {
  const context = requireShopifyApiContext(request, response);
  if (!context) {
    return;
  }

  await clearEbayConnection(context.shop);
  await recordEvent("ebay_connection_removed", {
    shop: context.shop,
    environment: ebayEnvironment()
  });

  response.json({
    shop: context.shop,
    marketplace: "ebay",
    connected: false,
    status: "disconnected",
    environment: ebayEnvironment()
  });
});

app.get("/ebay/start", async (request, response) => {
  const context = await requireDesktopPairingContext(request, response);
  if (!context) {
    return;
  }

  const slot = Math.min(Math.max(Number.parseInt(request.query.slot || "1", 10) || 1, 1), 20);
  const config = ebayOAuthConfig(request);
  if (!config.ready) {
    response.status(409).json({
      status: "error",
      error: config.error,
      environment: config.environment,
      configured: false
    });
    return;
  }

  const state = await createOAuthState({
    provider: "ebay",
    shop: context.shop,
    ttlMinutes: 15,
    metadata: {
      desktopBroker: true,
      slot,
      environment: config.environment
    }
  });
  await createDesktopEbayOAuthRequest({
    code: state.state,
    shop: context.shop,
    slot,
    environment: config.environment,
    expiresAt: state.expiresAt
  });
  const authorizeUrl = ebayAuthorizeUrl(config, state.state);

  await recordEvent("desktop_ebay_oauth_started", {
    shop: context.shop,
    slot,
    environment: config.environment
  });

  response.status(201).json({
    status: "pending",
    code: state.state,
    auth_url: authorizeUrl,
    authUrl: authorizeUrl,
    expires_at: state.expiresAt,
    expiresAt: state.expiresAt,
    meta: {
      shop: context.shop,
      slot,
      environment: config.environment
    }
  });
});

app.get("/ebay/status", async (request, response) => {
  const context = await requireDesktopPairingContext(request, response);
  if (!context) {
    return;
  }

  const code = safeString(request.query.code);
  const consume = Number(request.query.consume || 0) === 1;
  const requestRecord = await getDesktopEbayOAuthRequest(code);
  if (!requestRecord || requestRecord.shop !== context.shop) {
    response.status(404).json({
      status: "error",
      error: "eBay OAuth request was not found or has expired."
    });
    return;
  }

  if (requestRecord.status === "error") {
    response.json({
      status: "error",
      error: requestRecord.error || "eBay OAuth failed.",
      meta: desktopEbayOAuthMeta(requestRecord)
    });
    return;
  }

  if (requestRecord.status === "complete") {
    const tokenPayload = await readDesktopEbayTokenPayload(requestRecord);
    if (consume) {
      await markDesktopEbayOAuthConsumed(code);
    }
    response.json({
      status: "ready",
      token: consume ? tokenPayload : undefined,
      tokens: consume ? tokenPayload : undefined,
      meta: desktopEbayOAuthMeta(requestRecord)
    });
    return;
  }

  response.json({
    status: "pending",
    meta: desktopEbayOAuthMeta(requestRecord)
  });
});

app.post("/ebay/refresh", async (request, response) => {
  const context = await requireDesktopPairingContext(request, response);
  if (!context) {
    return;
  }

  const refreshToken = safeString(request.body?.refresh_token || request.body?.refreshToken);
  const scope = safeString(request.body?.scope || request.body?.scopes);
  const config = ebayOAuthConfig(request);
  if (!refreshToken) {
    response.status(400).json({ error: "refresh_token is required." });
    return;
  }
  if (!config.ready) {
    response.status(409).json({ error: config.error, configured: false, environment: config.environment });
    return;
  }

  try {
    const refreshed = await refreshEbayTokenPayload(config, refreshToken, scope);
    await recordEvent("desktop_ebay_token_refreshed", {
      shop: context.shop,
      environment: config.environment
    });
    response.json(refreshed);
  } catch (error) {
    response.status(error.statusCode || 502).json({ error: redactError(error) });
  }
});

app.get("/auth/ebay/start", (_request, response) => {
  response.status(400).type("text").send("Start eBay OAuth from the embedded QST app so the Shopify shop context can be verified.");
});

app.get("/auth/ebay/callback", async (request, response) => {
  const code = safeString(request.query.code);
  const stateValue = safeString(request.query.state);
  const error = safeString(request.query.error || request.query.error_description);

  if (error) {
    const failedState = stateValue ? await consumeOAuthState(stateValue, "ebay") : null;
    if (failedState?.metadata?.desktopBroker) {
      await failDesktopEbayOAuthRequest(failedState.state, error);
    }
    response.status(400).type("html").send(authResultHtml("eBay connection failed", error));
    return;
  }

  const state = await consumeOAuthState(stateValue, "ebay");
  if (!state) {
    response.status(400).type("html").send(authResultHtml("eBay connection failed", "The OAuth state is missing, expired, or already used."));
    return;
  }

  const config = ebayOAuthConfig(request, state.metadata?.environment);
  if (!code || !config.ready) {
    if (state.metadata?.desktopBroker) {
      await failDesktopEbayOAuthRequest(state.state, config.error || "Missing eBay OAuth authorization code.");
    }
    response.status(400).type("html").send(authResultHtml("eBay connection failed", config.error || "Missing eBay OAuth authorization code."));
    return;
  }

  try {
    const tokens = await exchangeEbayCodeForTokens(config, code);
    await saveEbayConnection(state.shop, config.environment, tokens);
    await saveMarketplaceSettings(state.shop, "ebay", {
      ...(await getMarketplaceSettings(state.shop, "ebay")),
      sellerAccountConnected: true
    });
    await recordEvent("ebay_oauth_connected", {
      shop: state.shop,
      environment: config.environment,
      scopes: tokens.scope || config.scopes
    });

    if (state.metadata?.desktopBroker) {
      await completeDesktopEbayOAuthRequest(state.state, tokens, {
        shop: state.shop,
        slot: state.metadata?.slot,
        environment: config.environment
      });
      response.type("html").send(authResultHtml("eBay connected", "Your eBay account connection was saved. Return to QST Desktop to continue."));
      return;
    }

    response.type("html").send(authResultHtml("eBay connected", "Your eBay account connection was saved for this Shopify shop. Return to QST in Shopify Admin to continue."));
  } catch (exchangeError) {
    if (state?.metadata?.desktopBroker) {
      await failDesktopEbayOAuthRequest(state.state, redactError(exchangeError));
    }
    response.status(502).type("html").send(authResultHtml("eBay connection failed", redactError(exchangeError)));
  }
});

app.get("/api/products", async (request, response) => {
  const context = requireShopifyApiContext(request, response);
  if (!context) {
    return;
  }

  try {
    const first = Math.min(Math.max(Number(request.query.first || 50), 1), 100);
    const result = await fetchShopifyProducts(context.shop, {
      first,
      after: safeString(request.query.after)
    });
    response.json(result);
  } catch (error) {
    response.status(error.statusCode || 502).json({
      error: redactError(error)
    });
  }
});

app.get("/api/products/detail", async (request, response) => {
  const context = requireShopifyApiContext(request, response);
  if (!context) {
    return;
  }

  try {
    const id = safeString(request.query.id);
    if (!id) {
      response.status(400).json({ error: "Product id is required." });
      return;
    }
    const result = await fetchShopifyProduct(context.shop, id);
    response.json(result);
  } catch (error) {
    response.status(error.statusCode || 502).json({
      error: redactError(error)
    });
  }
});

app.get("/api/listings/recent", async (request, response) => {
  const context = requireShopifyApiContext(request, response);
  if (!context) {
    return;
  }

  response.json({
    shop: context.shop,
    listings: await getRecentListingRecords(context.shop, 20)
  });
});

app.post("/api/listings/prepare", async (request, response) => {
  const context = requireShopifyApiContext(request, response);
  if (!context) {
    return;
  }

  const marketplace = safeString(request.body?.marketplace || "ebay").toLowerCase();
  const products = Array.isArray(request.body?.products) ? request.body.products : [];
  if (!products.length) {
    response.status(400).json({ error: "Select at least one product before preparing listings." });
    return;
  }

  const records = products.slice(0, 100).map((entry) => buildListingRecord(context.shop, marketplace, entry));
  await saveListingRecords(records);
  await recordEvent("listing_prepare_requested", {
    shop: context.shop,
    marketplace,
    count: records.length,
    prepared: records.filter((record) => record.status === "prepared").length,
    failed: records.filter((record) => record.status !== "prepared").length
  });

  const failed = records.filter((record) => record.status !== "prepared").length;
  response.status(failed ? 207 : 201).json({
    shop: context.shop,
    marketplace,
    status: failed ? "partial_or_validation_failed" : "prepared",
    records: records.map(publicListingRecord)
  });
});

app.get("/api/exports/recent", async (request, response) => {
  const context = requireShopifyApiContext(request, response);
  if (!context) {
    return;
  }

  response.json({
    shop: context.shop,
    exports: await getRecentExportRecords(context.shop, 20)
  });
});

app.post("/api/exports/record", async (request, response) => {
  const context = requireShopifyApiContext(request, response);
  if (!context) {
    return;
  }

  const record = buildExportRecord(context.shop, request.body || {});
  await saveExportRecord(record);
  await recordEvent("export_generated", {
    shop: context.shop,
    marketplace: record.marketplace,
    exportType: record.exportType,
    productCount: record.productCount
  });

  response.status(201).json({
    shop: context.shop,
    export: publicExportRecord(record)
  });
});

app.post("/api/desktop/pairing-code", async (request, response) => {
  const context = requireShopifyApiContext(request, response);
  if (!context) {
    return;
  }

  await cleanupExpiredPairingCodes();

  const now = new Date();
  const expiresAt = new Date(now.getTime() + pairingTtlMinutes * 60 * 1000);
  const shop = context.shop;
  const code = createPairingCode();
  const record = {
    code,
    shop,
    status: "pending",
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    user: context.auth.claims?.sub || null
  };

  await savePairingRecord(record);
  await recordEvent("desktop_pairing_created", {
    code,
    shop,
    expiresAt: record.expiresAt,
    authenticated: context.auth.authenticated
  });

  response.status(201).json({
    code,
    shop,
    status: record.status,
    expiresAt: record.expiresAt,
    ttlMinutes: pairingTtlMinutes,
    instructions: "Open QST Desktop, choose Shopify workspace, and enter this code."
  });
});

app.get("/api/desktop/pairing/:code", async (request, response) => {
  const record = await getPairingRecord(request.params.code);
  if (!record) {
    response.status(404).json({ error: "Pairing code was not found or has expired." });
    return;
  }

  response.json({
    code: record.code,
    shop: record.shop,
    status: record.status,
    expiresAt: record.expiresAt
  });
});

app.post("/api/desktop/pairing/:code/redeem", async (request, response) => {
  const record = await getPairingRecord(request.params.code);
  if (!record) {
    response.status(404).json({ error: "Pairing code was not found or has expired." });
    return;
  }

  if (record.status !== "pending") {
    response.status(409).json({ error: "Pairing code has already been used." });
    return;
  }

  const token = crypto.randomBytes(32).toString("hex");
  const claimedAt = new Date().toISOString();
  const claimedRecord = await claimPairingRecord(record.code, sha256(token), claimedAt);

  await recordEvent("desktop_pairing_claimed", {
    code: claimedRecord.code,
    shop: claimedRecord.shop,
    claimedAt: claimedRecord.claimedAt
  });

  response.json({
    shop: claimedRecord.shop,
    status: claimedRecord.status,
    desktopToken: token,
    desktopApiBaseUrl: publicBaseUrl(request),
    productScope: "read_products"
  });
});

app.post(["/api/desktop/shopify/graphql", "/desktop/shopify/graphql"], async (request, response) => {
  const context = await requireDesktopPairingContext(request, response);
  if (!context) {
    return;
  }

  const query = safeString(request.body?.query);
  const variables = request.body?.variables && typeof request.body.variables === "object" ? request.body.variables : {};
  const apiVersion = safeString(request.body?.api_version || request.body?.apiVersion || "2026-04");

  if (!query) {
    response.status(400).json({ error: "GraphQL query is required." });
    return;
  }

  try {
    const session = await getShopifySession(context.shop);
    if (!session?.accessToken) {
      const reauthorizeUrl = `${publicBaseUrl(request)}/auth/shopify/install?shop=${encodeURIComponent(context.shop)}`;
      response.status(409).json({
        error: "QST Desktop is paired, but this Shopify workspace needs server-side Shopify authorisation before products can load. Re-authorise Shopify in QST Listing Workspace, then generate a fresh desktop pairing code.",
        reauthorizeUrl
      });
      return;
    }

    const payload = await shopifyGraphql(context.shop, session.accessToken, query, variables, apiVersion);
    response.json(payload);
  } catch (error) {
    response.status(error.statusCode || 502).json({
      error: redactError(error)
    });
  }
});

app.get("/api/desktop/download", (_request, response) => {
  const downloadUrl = process.env.QST_DESKTOP_DOWNLOAD_URL;
  if (!downloadUrl) {
    response.status(404).json({
      error: "Desktop installer URL is not configured yet.",
      env: "Set QST_DESKTOP_DOWNLOAD_URL to enable this button."
    });
    return;
  }

  response.redirect(302, downloadUrl);
});

app.get(["/auth/shopify/install", "/auth/shopify"], handleShopifyInstall);
app.get(["/auth/shopify/callback", "/auth/callback"], handleShopifyOAuthCallback);

app.get("/desktop/pairing/:code", (request, response) => {
  response.redirect(307, `/api/desktop/pairing/${encodeURIComponent(request.params.code)}`);
});

app.get(["/listing-grader", "/listing-rescue"], (_request, response) => {
  response.status(404).type("text").send("Not found.");
});

app.get("/", (request, response, next) => {
  const shop = normalizeShopDomain(request.query.shop);
  if (isProduction && shop && !request.query.host) {
    response.redirect(302, shopifyAdminAppUrl(shop));
    return;
  }

  next();
});

if (isProduction) {
  app.use(express.static(distDir, { index: false }));
  app.get(/.*/, (_request, response) => {
    response.sendFile(path.join(distDir, "index.html"));
  });
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    root: rootDir,
    appType: "spa",
    server: {
      middlewareMode: true
    }
  });
  app.use(vite.middlewares);
}

startStorageInitialization();

app.listen(port, host, () => {
  console.log(`QST Shopify dashboard listening at http://${host}:${port}`);
});

const SHOPIFY_PRODUCTS_QUERY = `
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

const SHOPIFY_PRODUCT_DETAIL_QUERY = `
  query QstProduct($id: ID!) {
    product(id: $id) {
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
      images(first: 24) {
        nodes {
          url
          altText
        }
      }
      variants(first: 100) {
        nodes {
          id
          title
          sku
          price
          compareAtPrice
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

function securityHeaders(request, response, next) {
  response.setHeader(
    "Content-Security-Policy",
    "frame-ancestors https://admin.shopify.com https://*.myshopify.com;"
  );
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("X-Content-Type-Options", "nosniff");
  next();
}

function requireShopifyApiContext(request, response) {
  const auth = authenticateAppBridgeRequest(request);
  if (isProduction && !auth.authenticated) {
    response.status(401).json({ error: "A valid Shopify App Bridge ID token is required." });
    return null;
  }

  if (isProduction && !auth.shop) {
    response.status(401).json({ error: "The Shopify session token did not include a shop destination." });
    return null;
  }

  const shop = shopForRequest(request, auth);
  if (!shop) {
    response.status(400).json({ error: "Shop context could not be resolved." });
    return null;
  }

  return { auth, shop };
}

async function requireDesktopPairingContext(request, response) {
  const token = bearerToken(request);
  if (!token) {
    response.status(401).json({ error: "A valid QST Desktop pairing token is required." });
    return null;
  }

  const record = await getPairingRecordByDesktopTokenHash(sha256(token));
  if (!record || record.status !== "claimed" || !record.shop) {
    response.status(401).json({ error: "Desktop pairing token is invalid or has been revoked." });
    return null;
  }

  return {
    shop: record.shop,
    pairing: record
  };
}

async function handleShopifyInstall(request, response) {
  const shop = normalizeShopDomain(request.query.shop);
  const apiKey = shopifyApiKey();
  const secret = shopifySecret();

  if (!shop) {
    response.status(400).type("text").send("A valid myshopify.com shop parameter is required.");
    return;
  }

  if (!apiKey || !secret) {
    response.status(500).type("text").send("Shopify API credentials are not configured.");
    return;
  }

  const state = await createOAuthState({
    provider: "shopify",
    shop,
    ttlMinutes: 10,
    metadata: {
      returnTo: safeString(request.query.return_to) || "/"
    }
  });
  const redirectUri = `${publicBaseUrl(request)}/auth/callback`;
  const params = new URLSearchParams({
    client_id: apiKey,
    scope: shopifyScopes(),
    redirect_uri: redirectUri,
    state: state.state
  });

  response.redirect(302, `https://${shop}/admin/oauth/authorize?${params.toString()}`);
}

async function handleShopifyOAuthCallback(request, response) {
  if (!request.query.code) {
    response.redirect(302, "/");
    return;
  }

  const shop = normalizeShopDomain(request.query.shop);
  const stateValue = safeString(request.query.state);
  if (!shop || !verifyShopifyCallbackHmac(request.query)) {
    response.status(400).type("text").send("Invalid Shopify OAuth callback.");
    return;
  }

  const state = await consumeOAuthState(stateValue, "shopify");
  if (!state || state.shop !== shop) {
    response.status(400).type("text").send("Shopify OAuth state is missing, expired, or mismatched.");
    return;
  }

  try {
    const tokenPayload = await exchangeShopifyCodeForToken(shop, safeString(request.query.code));
    await saveShopifySession(shop, tokenPayload);
    await recordEvent("shopify_oauth_connected", {
      shop,
      scope: tokenPayload.scope || shopifyScopes()
    });
    response.redirect(302, shopifyAdminAppUrl(shop));
  } catch (error) {
    response.status(502).type("text").send(`Shopify OAuth exchange failed: ${redactError(error)}`);
  }
}

async function exchangeShopifyCodeForToken(shop, code) {
  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      client_id: shopifyApiKey(),
      client_secret: shopifySecret(),
      code
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    const message = payload.error_description || payload.error || `Shopify returned HTTP ${response.status}.`;
    const error = new Error(message);
    error.statusCode = response.status;
    throw error;
  }
  return payload;
}

async function fetchShopifyProducts(shop, variables) {
  const session = await getShopifySession(shop);
  if (!session?.accessToken) {
    const error = new Error("No server-side Shopify OAuth session is stored for this shop. Open the embedded app or reinstall QST to create one.");
    error.statusCode = 409;
    throw error;
  }

  const payload = await shopifyGraphql(shop, session.accessToken, SHOPIFY_PRODUCTS_QUERY, variables);
  return {
    shop,
    source: "shopify_admin_graphql",
    products: (payload.data?.products?.nodes || []).map(mapShopifyProduct),
    pageInfo: payload.data?.products?.pageInfo || { hasNextPage: false, endCursor: null }
  };
}

async function fetchShopifyProduct(shop, id) {
  const session = await getShopifySession(shop);
  if (!session?.accessToken) {
    const error = new Error("No server-side Shopify OAuth session is stored for this shop. Open the embedded app or reinstall QST to create one.");
    error.statusCode = 409;
    throw error;
  }

  const payload = await shopifyGraphql(shop, session.accessToken, SHOPIFY_PRODUCT_DETAIL_QUERY, { id });
  if (!payload.data?.product) {
    const error = new Error("Product was not found for this shop.");
    error.statusCode = 404;
    throw error;
  }

  return {
    shop,
    source: "shopify_admin_graphql",
    product: mapShopifyProduct(payload.data.product)
  };
}

async function shopifyGraphql(shop, accessToken, query, variables, apiVersion = "2026-04") {
  const version = /^20\d{2}-(01|04|07|10)$/.test(apiVersion) ? apiVersion : "2026-04";
  const response = await fetch(`https://${shop}/admin/api/${version}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Shopify-Access-Token": accessToken
    },
    body: JSON.stringify({ query, variables })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.errors?.length) {
    const message = payload.errors?.map((error) => error.message).join(" ") || `Shopify returned HTTP ${response.status}.`;
    const error = new Error(message);
    error.statusCode = response.status;
    throw error;
  }
  return payload;
}

function mapShopifyProduct(product) {
  const images = product.images?.nodes || [];
  const featuredImage = product.featuredMedia?.preview?.image?.url;
  return {
    id: product.id,
    title: safeString(product.title),
    handle: safeString(product.handle),
    status: safeString(product.status),
    vendor: safeString(product.vendor),
    productType: safeString(product.productType),
    tags: Array.isArray(product.tags) ? product.tags : [],
    description: stripHtml(safeString(product.descriptionHtml)),
    imageUrl: featuredImage || images[0]?.url || "",
    images: images.map((image) => ({
      url: safeString(image.url),
      altText: safeString(image.altText)
    })),
    variants: (product.variants?.nodes || []).map((variant) => ({
      id: safeString(variant.id),
      title: safeString(variant.title),
      sku: safeString(variant.sku),
      price: safeString(variant.price),
      compareAtPrice: safeString(variant.compareAtPrice),
      inventoryQuantity: variant.inventoryQuantity,
      selectedOptions: Array.isArray(variant.selectedOptions) ? variant.selectedOptions : []
    })),
    updatedAt: safeString(product.updatedAt)
  };
}

function stripHtml(html) {
  return safeString(html).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

async function handleWebhook(request, response) {
  if (!verifyWebhookHmac(request)) {
    response.status(401).send("Invalid Shopify webhook HMAC.");
    return;
  }

  const topic = safeString(request.get("x-shopify-topic")) || topicFromPath(request.path);
  const shop = safeString(request.get("x-shopify-shop-domain"));
  const webhookId = safeString(request.get("x-shopify-webhook-id"));

  await recordEvent("shopify_webhook", {
    topic,
    shop,
    webhookId,
    apiVersion: safeString(request.get("x-shopify-api-version")),
    payload: summarizeWebhookPayload(request.body)
  });

  if (topic === "app/uninstalled") {
    await clearPairingRecords(shop);
    await clearShopData(shop);
  }

  response.status(200).json({ ok: true });
}

async function buildAccountPayload(auth, request) {
  const appHandle = process.env.QST_SHOPIFY_APP_HANDLE || "qst-listing-workspace";
  const downloadUrl = process.env.QST_DESKTOP_DOWNLOAD_URL ? "/api/desktop/download" : null;
  const pricingPath = `/charges/${appHandle}/pricing_plans`;
  const storeHandle = storeHandleFromRequest(request, auth.shop);
  const shop = normalizeShopDomain(auth.shop) || normalizeShopDomain(request.query.shop) || normalizeShopDomain(storeHandle);
  const canExposeShopifySession = Boolean(shop && (auth.authenticated || !isProduction));
  const shopifySession = canExposeShopifySession ? await getShopifySession(shop) : null;
  const shopifyReauthorizeUrl = shop
    ? `/auth/shopify/install?shop=${encodeURIComponent(shop)}`
    : null;
  const pricingUrl = storeHandle
    ? `https://admin.shopify.com/store/${encodeURIComponent(storeHandle)}${pricingPath}`
    : null;

  return {
    appName: process.env.QST_APP_NAME || "QST Listing Workspace",
    appHandle,
    mode: isProduction ? "production" : "development",
    authentication: {
      authenticated: auth.authenticated,
      reason: auth.reason,
      shop: auth.shop || shop || null,
      shopifySessionStored: Boolean(shopifySession?.accessToken),
      shopifyReauthorizeUrl
    },
    subscription: {
      provider: "shopify_app_pricing",
      status: process.env.QST_SUBSCRIPTION_STATUS || (isProduction ? "not_checked" : "development_preview"),
      planName: process.env.QST_PLAN_NAME || "Development preview",
      pricingPath,
      pricingUrl,
      managedBy: "Shopify"
    },
    desktop: {
      optional: true,
      platform: "Windows",
      version: process.env.QST_DESKTOP_VERSION || "Not configured",
      available: Boolean(downloadUrl),
      downloadUrl,
      pairingEnabled: desktopPairingEnabled,
      pairingTtlMinutes
    },
    marketplaces: {
      ebay: {
        dashboardMode: "export_preparation",
        webOauthEnabled: envFlag("QST_WEB_EBAY_OAUTH_ENABLED", false),
        hostedPublishingConfigured: Boolean(process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET),
        desktopPublishingOptional: true
      }
    },
    compliance: {
      customerDataStored: false,
      productScope: "read_products",
      webhookEndpoint: "/webhooks"
    },
    routes: {
      health: "/healthz",
      readiness: "/readyz",
      shopifyAuth: "/auth/shopify/install",
      ebayAuth: "/auth/ebay/callback",
      products: "/api/products",
      listingPreparation: "/api/listings/prepare",
      exports: "/api/exports/record",
      desktopPairing: "/api/desktop/pairing-code"
    }
  };
}

async function createOAuthState({ provider, shop, ttlMinutes = 10, metadata = {} }) {
  await cleanupExpiredOAuthStates();
  const now = new Date();
  const state = crypto.randomBytes(24).toString("hex");
  const record = {
    state,
    provider,
    shop,
    metadata,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + Math.max(Number(ttlMinutes), 1) * 60 * 1000).toISOString()
  };

  if (!dbReady) {
    oauthStates.set(state, record);
    return record;
  }

  await db.query(
    `
      insert into qst_oauth_states (state, provider, shop, metadata, created_at, expires_at)
      values ($1, $2, $3, $4::jsonb, $5, $6)
    `,
    [record.state, record.provider, record.shop, JSON.stringify(record.metadata), record.createdAt, record.expiresAt]
  );
  return record;
}

async function consumeOAuthState(state, provider) {
  await cleanupExpiredOAuthStates();
  const normalizedState = safeString(state);
  if (!normalizedState) {
    return null;
  }

  if (!dbReady) {
    const record = oauthStates.get(normalizedState);
    if (!record || record.provider !== provider) {
      return null;
    }
    oauthStates.delete(normalizedState);
    return Date.parse(record.expiresAt) > Date.now() ? record : null;
  }

  const result = await db.query(
    `
      update qst_oauth_states
      set used_at = now()
      where state = $1
        and provider = $2
        and used_at is null
        and expires_at > now()
      returning state, provider, shop, metadata, created_at, expires_at
    `,
    [normalizedState, provider]
  );
  const row = result.rows[0];
  return row
    ? {
        state: row.state,
        provider: row.provider,
        shop: row.shop,
        metadata: row.metadata || {},
        createdAt: row.created_at?.toISOString?.() || row.created_at,
        expiresAt: row.expires_at?.toISOString?.() || row.expires_at
      }
    : null;
}

async function cleanupExpiredOAuthStates() {
  if (dbReady) {
    await db.query("delete from qst_oauth_states where expires_at <= now() or used_at is not null");
    return;
  }

  const now = Date.now();
  for (const [state, record] of oauthStates.entries()) {
    if (Date.parse(record.expiresAt) <= now) {
      oauthStates.delete(state);
    }
  }
}

async function saveShopifySession(shop, payload) {
  const accessToken = safeString(payload.access_token);
  if (!accessToken) {
    throw new Error("Shopify OAuth response did not include an access token.");
  }

  const record = {
    shop,
    accessToken,
    scope: safeString(payload.scope || shopifyScopes()),
    installedAt: new Date().toISOString()
  };

  if (!dbReady) {
    shopifySessions.set(shop, record);
    return record;
  }

  await db.query(
    `
      insert into qst_shopify_sessions (shop, access_token_ciphertext, scopes, installed_at, updated_at, uninstalled_at)
      values ($1, $2, $3, now(), now(), null)
      on conflict (shop)
      do update set
        access_token_ciphertext = excluded.access_token_ciphertext,
        scopes = excluded.scopes,
        updated_at = now(),
        uninstalled_at = null
    `,
    [shop, encryptSecret(accessToken), record.scope]
  );
  return record;
}

async function getShopifySession(shop) {
  if (!dbReady) {
    return shopifySessions.get(shop) || null;
  }

  const result = await db.query(
    `
      select shop, access_token_ciphertext, scopes, installed_at, updated_at
      from qst_shopify_sessions
      where shop = $1
        and uninstalled_at is null
      limit 1
    `,
    [shop]
  );
  const row = result.rows[0];
  return row
    ? {
        shop: row.shop,
        accessToken: decryptSecret(row.access_token_ciphertext),
        scope: row.scopes,
        installedAt: row.installed_at?.toISOString?.() || row.installed_at,
        updatedAt: row.updated_at?.toISOString?.() || row.updated_at
      }
    : null;
}

async function clearShopData(shop) {
  const normalizedShop = normalizeShopDomain(shop);
  if (!normalizedShop) {
    return;
  }

  if (!dbReady) {
    shopifySessions.delete(normalizedShop);
    ebayConnections.delete(normalizedShop);
    marketplaceSettings.delete(marketplaceSettingsKey(normalizedShop, "ebay"));
    return;
  }

  await db.query("update qst_shopify_sessions set uninstalled_at = now(), updated_at = now() where shop = $1", [normalizedShop]);
  await db.query("delete from qst_pairing_codes where shop = $1", [normalizedShop]);
  await db.query("delete from qst_ebay_connections where shop = $1", [normalizedShop]);
  await db.query("delete from qst_marketplace_settings where shop = $1", [normalizedShop]);
}

function ebayOAuthConfig(request, forcedEnvironment = "") {
  const environment = ebayEnvironment(forcedEnvironment);
  const clientId = safeString(process.env.EBAY_CLIENT_ID);
  const clientSecret = safeString(process.env.EBAY_CLIENT_SECRET);
  const redirectUri = safeString(process.env.EBAY_REDIRECT_URI) || `${publicBaseUrl(request)}/auth/ebay/callback`;
  const scopes = safeString(process.env.EBAY_SCOPES) || [
    "https://api.ebay.com/oauth/api_scope",
    "https://api.ebay.com/oauth/api_scope/sell.inventory",
    "https://api.ebay.com/oauth/api_scope/sell.account"
  ].join(" ");

  if (!clientId || !clientSecret || !redirectUri) {
    return {
      ready: false,
      environment,
      clientId,
      clientSecret,
      redirectUri,
      scopes,
      error: "eBay OAuth is not configured. Set EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, and EBAY_REDIRECT_URI."
    };
  }

  return {
    ready: true,
    environment,
    clientId,
    clientSecret,
    redirectUri,
    scopes,
    authorizeBaseUrl: environment === "sandbox" ? "https://auth.sandbox.ebay.com/oauth2/authorize" : "https://auth.ebay.com/oauth2/authorize",
    apiBaseUrl: environment === "sandbox" ? "https://api.sandbox.ebay.com" : "https://api.ebay.com"
  };
}

function ebayEnvironment(forcedEnvironment = "") {
  const value = safeString(forcedEnvironment || process.env.EBAY_ENVIRONMENT || "sandbox").toLowerCase();
  return value === "production" ? "production" : "sandbox";
}

function ebayAuthorizeUrl(config, state) {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: config.scopes,
    state
  });
  return `${config.authorizeBaseUrl}?${params.toString()}`;
}

async function exchangeEbayCodeForTokens(config, code) {
  const response = await fetch(`${config.apiBaseUrl}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json"
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: config.redirectUri
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    const message = payload.error_description || payload.error || `eBay returned HTTP ${response.status}.`;
    const error = new Error(message);
    error.statusCode = response.status;
    throw error;
  }
  return payload;
}

async function refreshEbayTokenPayload(config, refreshToken, scope = "") {
  const response = await fetch(`${config.apiBaseUrl}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json"
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      scope: scope || config.scopes
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    const message = payload.error_description || payload.error || `eBay returned HTTP ${response.status}.`;
    const error = new Error(message);
    error.statusCode = response.status;
    throw error;
  }
  return payload;
}

async function refreshEbayTokens(connection) {
  if (!connection?.refreshToken) {
    return connection;
  }

  const now = Date.now();
  if (connection.expiresAt && Date.parse(connection.expiresAt) > now + 120000) {
    return connection;
  }

  const config = ebayOAuthConfig({ get: () => "", protocol: "https" }, connection.environment);
  if (!config.ready) {
    return connection;
  }

  const response = await fetch(`${config.apiBaseUrl}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json"
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: connection.refreshToken,
      scope: config.scopes
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    return connection;
  }

  const updated = {
    ...connection,
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token || connection.refreshToken,
    tokenType: payload.token_type || connection.tokenType,
    scopes: payload.scope || connection.scopes,
    expiresAt: secondsFromNow(payload.expires_in),
    refreshExpiresAt: payload.refresh_token_expires_in
      ? secondsFromNow(payload.refresh_token_expires_in)
      : connection.refreshExpiresAt
  };
  await saveEbayConnection(connection.shop, connection.environment, {
    access_token: updated.accessToken,
    refresh_token: updated.refreshToken,
    token_type: updated.tokenType,
    scope: updated.scopes,
    expires_in: payload.expires_in,
    refresh_token_expires_in: payload.refresh_token_expires_in
  });
  return updated;
}

async function saveEbayConnection(shop, environment, tokens) {
  const now = new Date().toISOString();
  const record = {
    shop,
    marketplace: "ebay",
    environment,
    accessToken: safeString(tokens.access_token),
    refreshToken: safeString(tokens.refresh_token),
    tokenType: safeString(tokens.token_type || "Bearer"),
    scopes: safeString(tokens.scope || process.env.EBAY_SCOPES),
    expiresAt: secondsFromNow(tokens.expires_in),
    refreshExpiresAt: tokens.refresh_token_expires_in ? secondsFromNow(tokens.refresh_token_expires_in) : null,
    account: {},
    updatedAt: now,
    connectedAt: now
  };

  if (!record.accessToken) {
    throw new Error("eBay OAuth response did not include an access token.");
  }

  if (!dbReady) {
    ebayConnections.set(shop, record);
    return record;
  }

  await db.query(
    `
      insert into qst_ebay_connections (
        shop,
        marketplace,
        environment,
        access_token_ciphertext,
        refresh_token_ciphertext,
        token_type,
        scopes,
        expires_at,
        refresh_expires_at,
        account,
        connected_at,
        updated_at
      )
      values ($1, 'ebay', $2, $3, $4, $5, $6, $7, $8, $9::jsonb, now(), now())
      on conflict (shop, marketplace)
      do update set
        environment = excluded.environment,
        access_token_ciphertext = excluded.access_token_ciphertext,
        refresh_token_ciphertext = excluded.refresh_token_ciphertext,
        token_type = excluded.token_type,
        scopes = excluded.scopes,
        expires_at = excluded.expires_at,
        refresh_expires_at = excluded.refresh_expires_at,
        account = excluded.account,
        updated_at = now()
    `,
    [
      shop,
      environment,
      encryptSecret(record.accessToken),
      record.refreshToken ? encryptSecret(record.refreshToken) : "",
      record.tokenType,
      record.scopes,
      record.expiresAt,
      record.refreshExpiresAt,
      JSON.stringify(record.account)
    ]
  );
  return record;
}

async function getEbayConnection(shop) {
  let connection;
  if (!dbReady) {
    connection = ebayConnections.get(shop) || null;
  } else {
    const result = await db.query(
      `
        select
          shop,
          marketplace,
          environment,
          access_token_ciphertext,
          refresh_token_ciphertext,
          token_type,
          scopes,
          expires_at,
          refresh_expires_at,
          account,
          connected_at,
          updated_at
        from qst_ebay_connections
        where shop = $1
          and marketplace = 'ebay'
        limit 1
      `,
      [shop]
    );
    const row = result.rows[0];
    connection = row
      ? {
          shop: row.shop,
          marketplace: row.marketplace,
          environment: row.environment,
          accessToken: decryptSecret(row.access_token_ciphertext),
          refreshToken: row.refresh_token_ciphertext ? decryptSecret(row.refresh_token_ciphertext) : "",
          tokenType: row.token_type,
          scopes: row.scopes,
          expiresAt: row.expires_at?.toISOString?.() || row.expires_at,
          refreshExpiresAt: row.refresh_expires_at?.toISOString?.() || row.refresh_expires_at,
          account: row.account || {},
          connectedAt: row.connected_at?.toISOString?.() || row.connected_at,
          updatedAt: row.updated_at?.toISOString?.() || row.updated_at
        }
      : null;
  }

  return connection ? refreshEbayTokens(connection) : null;
}

async function clearEbayConnection(shop) {
  if (!dbReady) {
    ebayConnections.delete(shop);
    return;
  }

  await db.query("delete from qst_ebay_connections where shop = $1 and marketplace = 'ebay'", [shop]);
}

async function createDesktopEbayOAuthRequest({ code, shop, slot, environment, expiresAt }) {
  await cleanupExpiredDesktopEbayOAuthRequests();
  const record = {
    code,
    shop,
    slot: Number(slot) || 1,
    environment,
    status: "pending",
    tokenPayloadCiphertext: "",
    error: "",
    createdAt: new Date().toISOString(),
    expiresAt,
    completedAt: null,
    consumedAt: null
  };

  if (!dbReady) {
    desktopEbayOAuthRequests.set(code, record);
    return record;
  }

  await db.query(
    `
      insert into qst_desktop_ebay_oauth (
        code,
        shop,
        slot,
        environment,
        status,
        token_payload_ciphertext,
        error,
        created_at,
        expires_at
      )
      values ($1, $2, $3, $4, 'pending', '', '', now(), $5)
    `,
    [record.code, record.shop, record.slot, record.environment, record.expiresAt]
  );
  return record;
}

async function getDesktopEbayOAuthRequest(code) {
  await cleanupExpiredDesktopEbayOAuthRequests();
  const normalizedCode = safeString(code);
  if (!normalizedCode) {
    return null;
  }

  if (!dbReady) {
    return desktopEbayOAuthRequests.get(normalizedCode) || null;
  }

  const result = await db.query(
    `
      select
        code,
        shop,
        slot,
        environment,
        status,
        token_payload_ciphertext,
        error,
        created_at,
        expires_at,
        completed_at,
        consumed_at
      from qst_desktop_ebay_oauth
      where code = $1
        and expires_at > now()
      limit 1
    `,
    [normalizedCode]
  );
  return result.rows[0] ? mapDesktopEbayOAuthRow(result.rows[0]) : null;
}

async function completeDesktopEbayOAuthRequest(code, tokenPayload, meta = {}) {
  const normalizedCode = safeString(code);
  if (!normalizedCode) {
    return null;
  }
  const payloadText = JSON.stringify({
    ...tokenPayload,
    meta: {
      ...(tokenPayload?.meta && typeof tokenPayload.meta === "object" ? tokenPayload.meta : {}),
      shop: safeString(meta.shop),
      slot: Number(meta.slot) || 1,
      environment: safeString(meta.environment)
    }
  });
  const completedAt = new Date().toISOString();

  if (!dbReady) {
    const current = desktopEbayOAuthRequests.get(normalizedCode);
    if (!current) {
      return null;
    }
    const updated = {
      ...current,
      status: "complete",
      tokenPayloadCiphertext: payloadText,
      error: "",
      completedAt
    };
    desktopEbayOAuthRequests.set(normalizedCode, updated);
    return updated;
  }

  const result = await db.query(
    `
      update qst_desktop_ebay_oauth
      set status = 'complete',
          token_payload_ciphertext = $2,
          error = '',
          completed_at = now()
      where code = $1
      returning code, shop, slot, environment, status, token_payload_ciphertext, error, created_at, expires_at, completed_at, consumed_at
    `,
    [normalizedCode, encryptSecret(payloadText)]
  );
  return result.rows[0] ? mapDesktopEbayOAuthRow(result.rows[0]) : null;
}

async function failDesktopEbayOAuthRequest(code, error) {
  const normalizedCode = safeString(code);
  if (!normalizedCode) {
    return null;
  }
  const message = safeString(error) || "eBay OAuth failed.";

  if (!dbReady) {
    const current = desktopEbayOAuthRequests.get(normalizedCode);
    if (!current) {
      return null;
    }
    const updated = { ...current, status: "error", error: message };
    desktopEbayOAuthRequests.set(normalizedCode, updated);
    return updated;
  }

  const result = await db.query(
    `
      update qst_desktop_ebay_oauth
      set status = 'error',
          error = $2,
          completed_at = now()
      where code = $1
      returning code, shop, slot, environment, status, token_payload_ciphertext, error, created_at, expires_at, completed_at, consumed_at
    `,
    [normalizedCode, message]
  );
  return result.rows[0] ? mapDesktopEbayOAuthRow(result.rows[0]) : null;
}

async function markDesktopEbayOAuthConsumed(code) {
  const normalizedCode = safeString(code);
  if (!normalizedCode) {
    return;
  }

  if (!dbReady) {
    const current = desktopEbayOAuthRequests.get(normalizedCode);
    if (current) {
      desktopEbayOAuthRequests.set(normalizedCode, { ...current, consumedAt: new Date().toISOString() });
    }
    return;
  }

  await db.query("update qst_desktop_ebay_oauth set consumed_at = now() where code = $1", [normalizedCode]);
}

async function readDesktopEbayTokenPayload(record) {
  const payloadText = dbReady ? decryptSecret(record.tokenPayloadCiphertext) : safeString(record.tokenPayloadCiphertext);
  if (!payloadText) {
    return {};
  }
  try {
    return JSON.parse(payloadText);
  } catch {
    return {};
  }
}

async function cleanupExpiredDesktopEbayOAuthRequests() {
  if (dbReady) {
    await db.query("delete from qst_desktop_ebay_oauth where expires_at <= now()");
    return;
  }

  const now = Date.now();
  for (const [code, record] of desktopEbayOAuthRequests.entries()) {
    if (Date.parse(record.expiresAt) <= now) {
      desktopEbayOAuthRequests.delete(code);
    }
  }
}

function mapDesktopEbayOAuthRow(row) {
  return {
    code: row.code,
    shop: row.shop,
    slot: Number(row.slot) || 1,
    environment: row.environment,
    status: row.status,
    tokenPayloadCiphertext: row.token_payload_ciphertext || "",
    error: row.error || "",
    createdAt: row.created_at?.toISOString?.() || row.created_at,
    expiresAt: row.expires_at?.toISOString?.() || row.expires_at,
    completedAt: row.completed_at?.toISOString?.() || row.completed_at,
    consumedAt: row.consumed_at?.toISOString?.() || row.consumed_at
  };
}

function desktopEbayOAuthMeta(record) {
  return {
    shop: record.shop,
    slot: record.slot,
    environment: record.environment,
    expiresAt: record.expiresAt,
    completedAt: record.completedAt || null,
    consumedAt: record.consumedAt || null
  };
}

function buildEbayConnectionPayload(shop, connection, request) {
  const config = ebayOAuthConfig(request, connection?.environment);
  const connected = Boolean(connection?.accessToken);
  const expiresSoon = connection?.expiresAt ? Date.parse(connection.expiresAt) <= Date.now() + 10 * 60 * 1000 : false;
  return {
    shop,
    marketplace: "ebay",
    environment: connection?.environment || config.environment,
    configured: config.ready,
    connected,
    status: !config.ready ? "not_configured" : connected ? (expiresSoon ? "refresh_needed" : "connected") : "disconnected",
    connectedAt: connection?.connectedAt || null,
    updatedAt: connection?.updatedAt || null,
    expiresAt: connection?.expiresAt || null,
    scopes: connection?.scopes || config.scopes,
    account: connection?.account || null,
    callbackPath: "/auth/ebay/callback",
    message: config.ready
      ? connected
        ? "eBay OAuth connection is stored for this Shopify shop."
        : "eBay OAuth is optional in Shopify Admin. Direct eBay publishing is handled by QST Desktop."
      : config.error
  };
}

function buildListingRecord(shop, marketplace, entry) {
  const product = entry.product || entry;
  const draft = entry.draft || {};
  const checks = Array.isArray(entry.checks) ? entry.checks : [];
  const validationErrors = validateListingEntry(product, draft, checks);
  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    shop,
    marketplace,
    productId: safeString(product.id),
    productTitle: safeString(product.title || draft.title),
    status: validationErrors.length ? "validation_failed" : "prepared",
    validationErrors,
    draft,
    productSnapshot: sanitizeProductSnapshot(product),
    externalStatus: "not_sent_to_marketplace",
    externalReference: null,
    createdAt: now,
    updatedAt: now
  };
}

function validateListingEntry(product, draft, checks) {
  const errors = [];
  if (!safeString(draft.title || product.title)) {
    errors.push("Missing listing title.");
  }
  if (!priceIsUsable(draft.price || product.variants?.[0]?.price)) {
    errors.push("Missing usable price.");
  }
  if (!safeString(draft.imageUrl || product.imageUrl) && !(product.images || []).some((image) => safeString(image.url))) {
    errors.push("No usable image URL.");
  }
  for (const check of checks) {
    if (check && check.ok === false && check.label) {
      errors.push(`${check.label}: ${check.detail || "Needs review."}`);
    }
  }
  return [...new Set(errors)];
}

function sanitizeProductSnapshot(product = {}) {
  return {
    id: safeString(product.id),
    title: safeString(product.title),
    handle: safeString(product.handle),
    status: safeString(product.status),
    vendor: safeString(product.vendor),
    productType: safeString(product.productType),
    tags: Array.isArray(product.tags) ? product.tags.map(safeString).slice(0, 50) : [],
    imageUrl: safeString(product.imageUrl),
    variants: Array.isArray(product.variants)
      ? product.variants.slice(0, 100).map((variant) => ({
          id: safeString(variant.id),
          title: safeString(variant.title),
          sku: safeString(variant.sku),
          price: safeString(variant.price),
          inventoryQuantity: variant.inventoryQuantity,
          selectedOptions: Array.isArray(variant.selectedOptions) ? variant.selectedOptions : []
        }))
      : []
  };
}

async function saveListingRecords(records) {
  if (!dbReady) {
    for (const record of records) {
      listingRecords.set(record.id, record);
    }
    return;
  }

  for (const record of records) {
    await db.query(
      `
        insert into qst_listing_records (
          id,
          shop,
          marketplace,
          product_id,
          product_title,
          status,
          validation_errors,
          draft,
          product_snapshot,
          external_status,
          external_reference,
          created_at,
          updated_at
        )
        values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10, $11::jsonb, $12, $13)
      `,
      [
        record.id,
        record.shop,
        record.marketplace,
        record.productId,
        record.productTitle,
        record.status,
        JSON.stringify(record.validationErrors),
        JSON.stringify(record.draft),
        JSON.stringify(record.productSnapshot),
        record.externalStatus,
        record.externalReference ? JSON.stringify(record.externalReference) : null,
        record.createdAt,
        record.updatedAt
      ]
    );
  }
}

async function getRecentListingRecords(shop, limit) {
  if (!dbReady) {
    return Array.from(listingRecords.values())
      .filter((record) => record.shop === shop)
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
      .slice(0, limit)
      .map(publicListingRecord);
  }

  const result = await db.query(
    `
      select id, shop, marketplace, product_id, product_title, status, validation_errors, external_status, external_reference, created_at, updated_at
      from qst_listing_records
      where shop = $1
      order by created_at desc
      limit $2
    `,
    [shop, limit]
  );
  return result.rows.map((row) => publicListingRecord({
    id: row.id,
    shop: row.shop,
    marketplace: row.marketplace,
    productId: row.product_id,
    productTitle: row.product_title,
    status: row.status,
    validationErrors: row.validation_errors || [],
    externalStatus: row.external_status,
    externalReference: row.external_reference,
    createdAt: row.created_at?.toISOString?.() || row.created_at,
    updatedAt: row.updated_at?.toISOString?.() || row.updated_at
  }));
}

function publicListingRecord(record) {
  return {
    id: record.id,
    marketplace: record.marketplace,
    productId: record.productId,
    productTitle: record.productTitle,
    status: record.status,
    validationErrors: record.validationErrors,
    externalStatus: record.externalStatus,
    externalReference: record.externalReference,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

function buildExportRecord(shop, input) {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    shop,
    marketplace: safeString(input.marketplace || "ebay").toLowerCase(),
    exportType: safeString(input.exportType || "listing_pack"),
    productCount: Math.max(Number(input.productCount || 0), 0),
    productIds: Array.isArray(input.productIds) ? input.productIds.map(safeString).filter(Boolean).slice(0, 100) : [],
    filename: safeString(input.filename).slice(0, 180),
    status: "generated",
    createdAt: now
  };
}

async function saveExportRecord(record) {
  if (!dbReady) {
    exportRecords.set(record.id, record);
    return;
  }

  await db.query(
    `
      insert into qst_export_records (
        id,
        shop,
        marketplace,
        export_type,
        product_count,
        product_ids,
        filename,
        status,
        created_at
      )
      values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)
    `,
    [
      record.id,
      record.shop,
      record.marketplace,
      record.exportType,
      record.productCount,
      JSON.stringify(record.productIds),
      record.filename,
      record.status,
      record.createdAt
    ]
  );
}

async function getRecentExportRecords(shop, limit) {
  if (!dbReady) {
    return Array.from(exportRecords.values())
      .filter((record) => record.shop === shop)
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
      .slice(0, limit)
      .map(publicExportRecord);
  }

  const result = await db.query(
    `
      select id, marketplace, export_type, product_count, product_ids, filename, status, created_at
      from qst_export_records
      where shop = $1
      order by created_at desc
      limit $2
    `,
    [shop, limit]
  );
  return result.rows.map((row) => publicExportRecord({
    id: row.id,
    marketplace: row.marketplace,
    exportType: row.export_type,
    productCount: row.product_count,
    productIds: row.product_ids || [],
    filename: row.filename,
    status: row.status,
    createdAt: row.created_at?.toISOString?.() || row.created_at
  }));
}

function publicExportRecord(record) {
  return {
    id: record.id,
    marketplace: record.marketplace,
    exportType: record.exportType,
    productCount: record.productCount,
    productIds: record.productIds,
    filename: record.filename,
    status: record.status,
    createdAt: record.createdAt
  };
}

function priceIsUsable(value) {
  const price = Number(String(value ?? "").replace(/[^0-9.]+/g, ""));
  return Number.isFinite(price) && price > 0;
}

function secondsFromNow(seconds) {
  const value = Number(seconds);
  return Number.isFinite(value) && value > 0
    ? new Date(Date.now() + value * 1000).toISOString()
    : null;
}

function shopForRequest(request, auth = {}) {
  if (isProduction) {
    return normalizeShopDomain(auth.shop);
  }

  return (
    normalizeShopDomain(auth.shop) ||
    normalizeShopDomain(request.body?.shop) ||
    normalizeShopDomain(request.query.shop) ||
    normalizeShopDomain(storeHandleFromRequest(request, auth.shop)) ||
    "local-preview"
  );
}

function storeHandleFromRequest(request, authenticatedShop = "") {
  const explicitHandle = safeString(request.query.store_handle);
  if (explicitHandle) {
    return explicitHandle;
  }

  const shopHandle = storeHandleFromShop(request.query.shop || authenticatedShop);
  if (shopHandle) {
    return shopHandle;
  }

  const hostHandle = storeHandleFromEncodedHost(request.query.host);
  if (hostHandle) {
    return hostHandle;
  }

  return isProduction ? "" : safeString(process.env.QST_DEV_STORE_HANDLE || process.env.VITE_QST_DEV_STORE_HANDLE);
}

function storeHandleFromShop(shop) {
  return safeString(shop)
    .replace(/^https?:\/\//, "")
    .split(/[/?#]/)[0]
    .replace(/\.myshopify\.com$/i, "");
}

function normalizeShopDomain(shop) {
  const value = safeString(shop)
    .replace(/^https?:\/\//, "")
    .split(/[/?#]/)[0]
    .toLowerCase();

  if (!value) {
    return "";
  }

  const domain = value.endsWith(".myshopify.com") ? value : `${value}.myshopify.com`;
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(domain) ? domain : "";
}

function shopifyApiKey() {
  const value = safeString(process.env.VITE_SHOPIFY_API_KEY || process.env.SHOPIFY_API_KEY);
  return value.startsWith("replace_with_") ? "" : value;
}

function shopifyScopes() {
  return safeString(process.env.SHOPIFY_SCOPES || "read_products");
}

function shopifyAdminAppUrl(shop) {
  const appHandle = process.env.QST_SHOPIFY_APP_HANDLE || process.env.VITE_QST_SHOPIFY_APP_HANDLE || "qst-listing-workspace";
  return `https://admin.shopify.com/store/${encodeURIComponent(storeHandleFromShop(shop))}/apps/${encodeURIComponent(appHandle)}`;
}

function verifyShopifyCallbackHmac(query) {
  const secret = shopifySecret();
  if (!secret) {
    return !isProduction;
  }

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query || {})) {
    if (key === "hmac" || key === "signature") {
      continue;
    }

    const values = Array.isArray(value) ? value : [value];
    for (const entry of values) {
      params.append(key, safeString(entry));
    }
  }

  const message = Array.from(params.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  const digest = crypto.createHmac("sha256", secret).update(message).digest("hex");
  return timingSafeEqual(safeString(query.hmac), digest);
}

function storeHandleFromEncodedHost(host) {
  const value = safeString(host);
  if (!value) {
    return "";
  }

  try {
    const decoded = Buffer.from(normalizeBase64(value), "base64").toString("utf8");
    const storeMatch = decoded.match(/\/store\/([^/]+)/);
    if (storeMatch?.[1]) {
      return storeMatch[1];
    }

    return storeHandleFromShop(decoded);
  } catch {
    return "";
  }
}

function normalizeBase64(value) {
  const base = safeString(value).replace(/-/g, "+").replace(/_/g, "/");
  return base.padEnd(base.length + ((4 - (base.length % 4)) % 4), "=");
}

function authenticateAppBridgeRequest(request) {
  const token = bearerToken(request);
  if (!token) {
    return { authenticated: false, reason: "missing_token", claims: null, shop: null };
  }

  const secret = shopifySecret();
  if (!secret) {
    const claims = decodeJwtPayload(token);
    return {
      authenticated: !isProduction,
      reason: isProduction ? "missing_secret" : "missing_secret_dev_preview",
      claims,
      shop: shopFromClaims(claims)
    };
  }

  const result = verifyJwtHs256(token, secret);
  if (!result.valid) {
    return { authenticated: false, reason: result.reason, claims: result.claims || null, shop: null };
  }

  const claims = result.claims;
  const expectedAudience = shopifyApiKey();
  if (expectedAudience && !audienceMatches(claims?.aud, expectedAudience)) {
    return { authenticated: false, reason: "audience_mismatch", claims, shop: null };
  }

  const now = Math.floor(Date.now() / 1000);
  if (claims?.exp && Number(claims.exp) < now) {
    return { authenticated: false, reason: "token_expired", claims, shop: null };
  }

  return {
    authenticated: true,
    reason: "verified",
    claims,
    shop: shopFromClaims(claims)
  };
}

function verifyWebhookHmac(request) {
  const secret = shopifySecret();
  if (!secret) {
    return !isProduction;
  }

  const header = safeString(request.get("x-shopify-hmac-sha256"));
  if (!header || !Buffer.isBuffer(request.body)) {
    return false;
  }

  const digest = crypto.createHmac("sha256", secret).update(request.body).digest("base64");
  return timingSafeEqual(header, digest);
}

function verifyJwtHs256(token, secret) {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return { valid: false, reason: "invalid_token_shape" };
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = parseBase64UrlJson(encodedHeader);
  const claims = parseBase64UrlJson(encodedPayload);
  if (!header || !claims) {
    return { valid: false, reason: "invalid_token_payload" };
  }

  if (header.alg !== "HS256") {
    return { valid: false, reason: "unsupported_token_algorithm", claims };
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest("base64url");

  return timingSafeEqual(encodedSignature, expected)
    ? { valid: true, reason: "verified", claims }
    : { valid: false, reason: "signature_mismatch", claims };
}

function shopifySecret() {
  const value = safeString(process.env.SHOPIFY_API_SECRET || process.env.SHOPIFY_CLIENT_SECRET);
  return value.startsWith("replace_with_") ? "" : value;
}

function encryptSecret(value) {
  const text = safeString(value);
  if (!text) {
    return "";
  }

  const key = tokenEncryptionKey();
  if (!key) {
    throw new Error("QST_TOKEN_ENCRYPTION_KEY is required before storing OAuth tokens.");
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(":");
}

function decryptSecret(value) {
  const text = safeString(value);
  if (!text) {
    return "";
  }

  const [version, ivText, tagText, ciphertextText] = text.split(":");
  if (version !== "v1" || !ivText || !tagText || !ciphertextText) {
    if (isProduction) {
      throw new Error("Stored token is not encrypted with the expected QST format.");
    }
    return text;
  }

  const key = tokenEncryptionKey();
  if (!key) {
    throw new Error("QST_TOKEN_ENCRYPTION_KEY is required before reading OAuth tokens.");
  }

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextText, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

function tokenEncryptionKey() {
  const configured = safeString(process.env.QST_TOKEN_ENCRYPTION_KEY);
  const fallback = !isProduction ? shopifySecret() || "qst-development-token-key" : "";
  const material = configured || fallback;
  return material ? crypto.createHash("sha256").update(material).digest() : null;
}

function decodeJwtPayload(token) {
  const payload = token.split(".")[1];
  return payload ? parseBase64UrlJson(payload) : null;
}

function parseBase64UrlJson(value) {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function bearerToken(request) {
  const header = safeString(request.get("authorization"));
  return header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
}

function audienceMatches(audience, expectedAudience) {
  return Array.isArray(audience) ? audience.includes(expectedAudience) : audience === expectedAudience;
}

function shopFromClaims(claims) {
  const value = claims?.dest || claims?.iss || claims?.shop || "";
  if (!value) {
    return "";
  }

  try {
    return new URL(value).hostname;
  } catch {
    return String(value).replace(/^https?:\/\//, "").split(/[/?#]/)[0];
  }
}

async function initializeStorage() {
  if (!db) {
    return;
  }

  await db.query(`
    create table if not exists qst_oauth_states (
      state text primary key,
      provider text not null,
      shop text not null,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null,
      expires_at timestamptz not null,
      used_at timestamptz
    )
  `);

  await db.query(`
    create table if not exists qst_shopify_sessions (
      shop text primary key,
      access_token_ciphertext text not null,
      scopes text not null,
      installed_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      uninstalled_at timestamptz
    )
  `);

  await db.query(`
    create table if not exists qst_pairing_codes (
      code text primary key,
      shop text not null,
      status text not null,
      user_subject text,
      desktop_token_hash text,
      created_at timestamptz not null,
      expires_at timestamptz not null,
      claimed_at timestamptz
    )
  `);

  await db.query(`
    create table if not exists qst_events (
      id bigserial primary key,
      type text not null,
      at timestamptz not null default now(),
      details jsonb not null default '{}'::jsonb
    )
  `);

  await db.query(`
    create table if not exists qst_marketplace_settings (
      shop text not null,
      marketplace text not null,
      settings jsonb not null default '{}'::jsonb,
      updated_at timestamptz not null default now(),
      primary key (shop, marketplace)
    )
  `);

  await db.query(`
    create table if not exists qst_ebay_connections (
      shop text not null,
      marketplace text not null default 'ebay',
      environment text not null,
      access_token_ciphertext text not null,
      refresh_token_ciphertext text,
      token_type text,
      scopes text,
      expires_at timestamptz,
      refresh_expires_at timestamptz,
      account jsonb not null default '{}'::jsonb,
      connected_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      primary key (shop, marketplace)
    )
  `);

  await db.query(`
    create table if not exists qst_desktop_ebay_oauth (
      code text primary key,
      shop text not null,
      slot integer not null default 1,
      environment text not null,
      status text not null,
      token_payload_ciphertext text,
      error text,
      created_at timestamptz not null,
      expires_at timestamptz not null,
      completed_at timestamptz,
      consumed_at timestamptz
    )
  `);

  await db.query(`
    create table if not exists qst_listing_records (
      id uuid primary key,
      shop text not null,
      marketplace text not null,
      product_id text not null,
      product_title text not null,
      status text not null,
      validation_errors jsonb not null default '[]'::jsonb,
      draft jsonb not null default '{}'::jsonb,
      product_snapshot jsonb not null default '{}'::jsonb,
      external_status text not null,
      external_reference jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);

  await db.query(`
    create table if not exists qst_export_records (
      id uuid primary key,
      shop text not null,
      marketplace text not null,
      export_type text not null,
      product_count integer not null default 0,
      product_ids jsonb not null default '[]'::jsonb,
      filename text,
      status text not null,
      created_at timestamptz not null default now()
    )
  `);
}

function storageHealth() {
  if (!db) {
    return {
      storage: "memory",
      storageReady: true,
      postgresReady: false,
      fallbackActive: false,
      retrying: false,
      storagePersistence: "ephemeral",
      storageWarning: null,
      storageError: null
    };
  }

  if (dbReady) {
    return {
      storage: "postgres",
      storageReady: true,
      postgresReady: true,
      fallbackActive: false,
      retrying: false,
      storagePersistence: "durable",
      storageWarning: null,
      storageError: null
    };
  }

  return {
    storage: "memory_fallback",
    storageReady: true,
    postgresReady: false,
    fallbackActive: true,
    retrying: true,
    storagePersistence: "ephemeral",
    storageWarning: "Postgres is not ready; using in-memory pairing codes while initialization retries.",
    storageError: dbInitError || null
  };
}

function startStorageInitialization() {
  if (!db) {
    dbReady = false;
    console.log("QST storage initialized with in-memory fallback.");
    return;
  }

  void attemptStorageInitialization();
  const retryTimer = setInterval(() => {
    if (dbReady) {
      clearInterval(retryTimer);
      return;
    }

    void attemptStorageInitialization();
  }, 15000);

  retryTimer.unref?.();
}

async function attemptStorageInitialization() {
  if (dbReady || dbInitInProgress) {
    return;
  }

  dbInitInProgress = true;
  try {
    await initializeStorage();
    dbReady = true;
    dbInitError = "";
    console.log("QST storage initialized with Postgres.");
  } catch (error) {
    dbInitError = error.message || "Database initialization failed.";
    console.error("QST storage initialization failed:", dbInitError);
  } finally {
    dbInitInProgress = false;
  }
}

async function savePairingRecord(record) {
  if (!dbReady) {
    pairingCodes.set(record.code, record);
    return;
  }

  await db.query(
    `
      insert into qst_pairing_codes (
        code,
        shop,
        status,
        user_subject,
        created_at,
        expires_at
      )
      values ($1, $2, $3, $4, $5, $6)
    `,
    [record.code, record.shop, record.status, record.user, record.createdAt, record.expiresAt]
  );
}

async function getPairingRecord(code) {
  await cleanupExpiredPairingCodes();
  const normalizedCode = normalizePairingCode(code);

  if (!dbReady) {
    return pairingCodes.get(normalizedCode) || null;
  }

  const result = await db.query(
    `
      select
        code,
        shop,
        status,
        user_subject,
        desktop_token_hash,
        created_at,
        expires_at,
        claimed_at
      from qst_pairing_codes
      where code = $1
        and expires_at > now()
      limit 1
    `,
    [normalizedCode]
  );

  return result.rows[0] ? mapPairingRow(result.rows[0]) : null;
}

async function getPairingRecordByDesktopTokenHash(desktopTokenHash) {
  const tokenHash = safeString(desktopTokenHash);
  if (!tokenHash) {
    return null;
  }

  if (!dbReady) {
    for (const record of pairingCodes.values()) {
      if (record.status === "claimed" && record.desktopTokenHash === tokenHash) {
        return record;
      }
    }
    return null;
  }

  const result = await db.query(
    `
      select
        code,
        shop,
        status,
        user_subject,
        desktop_token_hash,
        created_at,
        expires_at,
        claimed_at
      from qst_pairing_codes
      where desktop_token_hash = $1
        and status = 'claimed'
      limit 1
    `,
    [tokenHash]
  );

  return result.rows[0] ? mapPairingRow(result.rows[0]) : null;
}

async function claimPairingRecord(code, desktopTokenHash, claimedAt) {
  if (!dbReady) {
    const record = pairingCodes.get(code);
    record.status = "claimed";
    record.claimedAt = claimedAt;
    record.desktopTokenHash = desktopTokenHash;
    pairingCodes.set(code, record);
    return record;
  }

  const result = await db.query(
    `
      update qst_pairing_codes
      set
        status = 'claimed',
        claimed_at = $2,
        desktop_token_hash = $3
      where code = $1
        and status = 'pending'
        and expires_at > now()
      returning
        code,
        shop,
        status,
        user_subject,
        desktop_token_hash,
        created_at,
        expires_at,
        claimed_at
    `,
    [code, claimedAt, desktopTokenHash]
  );

  if (!result.rows[0]) {
    throw new Error("Pairing code could not be claimed.");
  }

  return mapPairingRow(result.rows[0]);
}

async function clearPairingRecords(shop = "") {
  if (!dbReady) {
    if (shop) {
      for (const [code, record] of pairingCodes.entries()) {
        if (record.shop === shop) {
          pairingCodes.delete(code);
        }
      }
    } else {
      pairingCodes.clear();
    }
    return;
  }

  if (shop) {
    await db.query("delete from qst_pairing_codes where shop = $1", [shop]);
  } else {
    await db.query("delete from qst_pairing_codes");
  }
}

async function getMarketplaceSettings(shop, marketplace) {
  const key = marketplaceSettingsKey(shop, marketplace);
  if (!dbReady) {
    return marketplaceSettings.get(key) || defaultEbaySettings();
  }

  const result = await db.query(
    `
      select settings
      from qst_marketplace_settings
      where shop = $1
        and marketplace = $2
      limit 1
    `,
    [shop, marketplace]
  );

  return normalizeEbaySettings(result.rows[0]?.settings || {});
}

async function saveMarketplaceSettings(shop, marketplace, settings) {
  const normalized = normalizeEbaySettings(settings);
  const key = marketplaceSettingsKey(shop, marketplace);

  if (!dbReady) {
    marketplaceSettings.set(key, normalized);
    return normalized;
  }

  await db.query(
    `
      insert into qst_marketplace_settings (shop, marketplace, settings, updated_at)
      values ($1, $2, $3::jsonb, now())
      on conflict (shop, marketplace)
      do update set
        settings = excluded.settings,
        updated_at = now()
    `,
    [shop, marketplace, JSON.stringify(normalized)]
  );

  return normalized;
}

function marketplaceSettingsKey(shop, marketplace) {
  return `${marketplace}:${shop}`;
}

function defaultEbaySettings() {
  return {
    sellerAccountConnected: false,
    businessPoliciesReady: false,
    dispatchLocationReady: false,
    defaultCategoryReady: false,
    defaultCategoryLabel: "",
    notes: "",
    updatedAt: null
  };
}

function normalizeEbaySettings(input) {
  const base = defaultEbaySettings();
  return {
    sellerAccountConnected: Boolean(input.sellerAccountConnected ?? base.sellerAccountConnected),
    businessPoliciesReady: Boolean(input.businessPoliciesReady ?? base.businessPoliciesReady),
    dispatchLocationReady: Boolean(input.dispatchLocationReady ?? base.dispatchLocationReady),
    defaultCategoryReady: Boolean(input.defaultCategoryReady ?? base.defaultCategoryReady),
    defaultCategoryLabel: safeString(input.defaultCategoryLabel).slice(0, 80),
    notes: safeString(input.notes).slice(0, 280),
    updatedAt: safeString(input.updatedAt) || new Date().toISOString()
  };
}

function ebaySettingsSummary(settings) {
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

async function cleanupExpiredPairingCodes() {
  if (dbReady) {
    await db.query("delete from qst_pairing_codes where status = 'pending' and expires_at <= now()");
    return;
  }

  const now = Date.now();
  for (const [code, record] of pairingCodes.entries()) {
    if (record.status === "pending" && Date.parse(record.expiresAt) <= now) {
      pairingCodes.delete(code);
    }
  }
}

function mapPairingRow(row) {
  return {
    code: row.code,
    shop: row.shop,
    status: row.status,
    user: row.user_subject,
    desktopTokenHash: row.desktop_token_hash,
    createdAt: row.created_at?.toISOString?.() || row.created_at,
    expiresAt: row.expires_at?.toISOString?.() || row.expires_at,
    claimedAt: row.claimed_at?.toISOString?.() || row.claimed_at || null
  };
}

function createPairingCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let raw = "";
  for (let index = 0; index < 8; index += 1) {
    raw += alphabet[crypto.randomInt(0, alphabet.length)];
  }
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

function normalizePairingCode(code) {
  const value = String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return value.length > 4 ? `${value.slice(0, 4)}-${value.slice(4, 8)}` : value;
}

function summarizeWebhookPayload(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    return { received: false };
  }

  try {
    const payload = JSON.parse(buffer.toString("utf8"));
    return {
      received: true,
      keys: Object.keys(payload).sort(),
      id: payload.id || payload.shop_id || payload.customer?.id || null
    };
  } catch {
    return { received: true, type: "non_json" };
  }
}

async function recordEvent(type, details) {
  if (dbReady) {
    await db.query(
      "insert into qst_events (type, details) values ($1, $2::jsonb)",
      [type, JSON.stringify(details)]
    );
    return;
  }

  await fsp.mkdir(dataDir, { recursive: true });
  await fsp.appendFile(
    path.join(dataDir, "events.jsonl"),
    `${JSON.stringify({ type, at: new Date().toISOString(), ...details })}\n`,
    "utf8"
  );
}

function topicFromPath(routePath) {
  return routePath.replace(/^\/webhooks\/?/, "").replace(/_/g, "/") || "unknown";
}

function publicBaseUrl(request) {
  const proto = request.get("x-forwarded-proto") || request.protocol;
  const hostHeader = request.get("x-forwarded-host") || request.get("host");
  return `${proto}://${hostHeader}`;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function authResultHtml(title, message) {
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${safeTitle}</title>
    <style>
      body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:0;background:#f6f6f7;color:#202223}
      main{max-width:680px;margin:12vh auto;padding:24px}
      section{border:1px solid #dcdfe4;border-radius:8px;background:#fff;padding:24px}
      h1{font-size:24px;margin:0 0 12px}
      p{line-height:1.5;margin:0;color:#5c5f62}
    </style>
  </head>
  <body>
    <main>
      <section>
        <h1>${safeTitle}</h1>
        <p>${safeMessage}</p>
      </section>
    </main>
  </body>
</html>`;
}

function redactError(error) {
  return safeString(error?.message || error || "Request failed.")
    .replace(/access_token=[^&\s]+/gi, "access_token=[redacted]")
    .replace(/refresh_token=[^&\s]+/gi, "refresh_token=[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{24,}/g, "[jwt redacted]");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function timingSafeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function safeString(value) {
  return String(value || "").trim();
}

function envFlag(key, defaultValue = false) {
  const value = safeString(process.env[key]).toLowerCase();
  if (!value) {
    return defaultValue;
  }

  return ["1", "true", "yes", "on"].includes(value);
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
