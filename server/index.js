import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import pg from "pg";
import { renderListingRescuePage } from "./listing-rescue-page.js";

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
const pairingCodes = new Map();
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

app.get("/api/health", (_request, response) => {
  const storage = storageHealth();

  response.json({
    ok: true,
    app: "QST Listing Workspace",
    mode: isProduction ? "production" : "development",
    ...storage,
    time: new Date().toISOString()
  });
});

app.get("/api/account", (request, response) => {
  response.json(buildAccountPayload(authenticateAppBridgeRequest(request), request));
});

app.post("/api/desktop/pairing-code", async (request, response) => {
  const auth = authenticateAppBridgeRequest(request);
  if (isProduction && !auth.authenticated) {
    response.status(401).json({ error: "A valid Shopify App Bridge ID token is required." });
    return;
  }

  await cleanupExpiredPairingCodes();

  const now = new Date();
  const expiresAt = new Date(now.getTime() + pairingTtlMinutes * 60 * 1000);
  const shop = auth.shop || safeString(request.body?.shop) || "local-preview";
  const code = createPairingCode();
  const record = {
    code,
    shop,
    status: "pending",
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    user: auth.claims?.sub || null
  };

  await savePairingRecord(record);
  await recordEvent("desktop_pairing_created", {
    code,
    shop,
    expiresAt: record.expiresAt,
    authenticated: auth.authenticated
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

app.get("/auth/callback", (_request, response) => {
  response.redirect(302, "/");
});

app.get("/listing-rescue", (_request, response) => {
  response
    .type("html")
    .send(renderListingRescuePage({ contactEmail: leadContactEmail() }));
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
  }

  response.status(200).json({ ok: true });
}

function buildAccountPayload(auth, request) {
  const appHandle = process.env.QST_SHOPIFY_APP_HANDLE || "qst-listing-workspace";
  const downloadUrl = process.env.QST_DESKTOP_DOWNLOAD_URL ? "/api/desktop/download" : null;
  const pricingPath = `/charges/${appHandle}/pricing_plans`;
  const storeHandle = storeHandleFromRequest(request, auth.shop);
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
      shop: auth.shop || null
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
      pairingTtlMinutes
    },
    compliance: {
      customerDataStored: false,
      productScope: "read_products",
      webhookEndpoint: "/webhooks"
    }
  };
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
  const expectedAudience = process.env.VITE_SHOPIFY_API_KEY || process.env.SHOPIFY_API_KEY;
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

function leadContactEmail() {
  return safeString(process.env.QST_LEADS_EMAIL) || "qmarx.producer@gmail.com";
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

async function cleanupExpiredPairingCodes() {
  if (dbReady) {
    await db.query("delete from qst_pairing_codes where expires_at <= now()");
    return;
  }

  const now = Date.now();
  for (const [code, record] of pairingCodes.entries()) {
    if (Date.parse(record.expiresAt) <= now) {
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
