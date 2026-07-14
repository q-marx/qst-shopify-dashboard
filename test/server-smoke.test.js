import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fsp from "node:fs/promises";
import { after, before, test } from "node:test";

const port = 5197;
const baseUrl = `http://127.0.0.1:${port}`;
const apiKey = "test_api_key";
const apiSecret = "test_secret";
let server;
let serverOutput = "";

before(async () => {
  server = spawn(process.execPath, ["server/index.js"], {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(port),
      DATABASE_URL: "",
      VITE_SHOPIFY_API_KEY: apiKey,
      SHOPIFY_API_SECRET: apiSecret,
      QST_TOKEN_ENCRYPTION_KEY: "test_token_encryption_key",
      EBAY_CLIENT_ID: "test_ebay_client_id",
      EBAY_CLIENT_SECRET: "test_ebay_client_secret",
      EBAY_REDIRECT_URI: `${baseUrl}/auth/ebay/callback`,
      EBAY_ENVIRONMENT: "sandbox",
      VITE_QST_DEMO_MODE: "false"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  server.stdout.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });
  server.stderr.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });

  await waitForHealth();
});

after(() => {
  server?.kill();
});

test("health and readiness expose liveness separately from production storage readiness", async () => {
  const health = await getJson("/healthz");
  assert.equal(health.ok, true);

  const ready = await fetch(`${baseUrl}/readyz`);
  assert.equal(ready.status, 503);
  const payload = await ready.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.requiredStorage, "postgres");
});

test("authenticated API routes reject missing Shopify session tokens", async () => {
  const response = await fetch(`${baseUrl}/api/ebay/connection`);
  assert.equal(response.status, 401);
});

test("direct production visits cannot expose local screenshot or subscription fixtures", async () => {
  const response = await fetch(`${baseUrl}/?screenshot=1`);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Open QST in Shopify Admin/);
  assert.doesNotMatch(html, /app-bridge\.js|QST Full Access|screenshot-01/);
});

test("shop context comes from the verified session token, not spoofable request body data", async () => {
  const alphaToken = sessionToken("alpha-shop.myshopify.com");
  const betaToken = sessionToken("beta-shop.myshopify.com");

  const created = await postJson(
    "/api/exports/record",
    {
      shop: "spoofed-shop.myshopify.com",
      marketplace: "ebay",
      exportType: "copy_ready_listing_pack",
      productCount: 1,
      productIds: ["gid://shopify/Product/1"],
      filename: "pack.txt"
    },
    alphaToken
  );
  assert.equal(created.status, 201);
  assert.equal(created.body.shop, "alpha-shop.myshopify.com");

  const alphaRecent = await getJson("/api/exports/recent", alphaToken);
  const betaRecent = await getJson("/api/exports/recent", betaToken);
  assert.equal(alphaRecent.exports.length, 1);
  assert.equal(betaRecent.exports.length, 0);
});

test("listing preparation persists export-ready records without requiring eBay OAuth", async () => {
  const response = await postJson(
    "/api/listings/prepare",
    {
      marketplace: "ebay",
      products: [
        {
          product: {
            id: "gid://shopify/Product/2",
            title: "Test product",
            imageUrl: "https://example.test/image.jpg",
            variants: [{ id: "gid://shopify/ProductVariant/2", price: "12.50", sku: "SKU-2" }]
          },
          draft: {
            title: "Test product",
            price: "12.50",
            imageUrl: "https://example.test/image.jpg"
          },
          checks: []
        }
      ]
    },
    sessionToken("alpha-shop.myshopify.com")
  );

  assert.equal(response.status, 201);
  assert.equal(response.body.records[0].status, "prepared");
  assert.deepEqual(response.body.records[0].validationErrors, []);
});

test("desktop pairing codes are scoped to the verified shop and can only be redeemed once", async () => {
  const token = sessionToken("alpha-shop.myshopify.com");
  const created = await postJson("/api/desktop/pairing-code", { shop: "spoofed-shop.myshopify.com" }, token);
  assert.equal(created.status, 201);
  assert.equal(created.body.shop, "alpha-shop.myshopify.com");

  const redeemed = await postJson(`/api/desktop/pairing/${encodeURIComponent(created.body.code)}/redeem`, {});
  assert.equal(redeemed.status, 200);
  assert.equal(redeemed.body.shop, "alpha-shop.myshopify.com");
  assert.ok(redeemed.body.desktopToken);

  const desktopGraphql = await postJson(
    "/api/desktop/shopify/graphql",
    { query: "{ shop { name } }", variables: {} },
    redeemed.body.desktopToken
  );
  assert.equal(desktopGraphql.status, 409);
  assert.match(desktopGraphql.body.error, /server-side Shopify authorisation/);
  assert.match(desktopGraphql.body.reauthorizeUrl, /\/auth\/shopify\/install\?shop=alpha-shop\.myshopify\.com/);

  const desktopGraphqlLegacy = await postJson(
    "/desktop/shopify/graphql",
    { query: "{ shop { name } }", variables: {} },
    redeemed.body.desktopToken
  );
  assert.equal(desktopGraphqlLegacy.status, 409);
  assert.match(desktopGraphqlLegacy.body.error, /server-side Shopify authorisation/);

  const desktopEbayStart = await fetch(`${baseUrl}/ebay/start?slot=2`, {
    headers: { Authorization: `Bearer ${redeemed.body.desktopToken}` }
  });
  assert.equal(desktopEbayStart.status, 201);
  const desktopEbayStartBody = await desktopEbayStart.json();
  assert.equal(desktopEbayStartBody.status, "pending");
  assert.ok(desktopEbayStartBody.code);
  assert.match(desktopEbayStartBody.auth_url, /auth\.sandbox\.ebay\.com/);

  const desktopEbayPending = await getJson(
    `/ebay/status?code=${encodeURIComponent(desktopEbayStartBody.code)}&consume=0`,
    redeemed.body.desktopToken
  );
  assert.equal(desktopEbayPending.status, "pending");
  assert.equal(desktopEbayPending.meta.shop, "alpha-shop.myshopify.com");
  assert.equal(desktopEbayPending.meta.slot, 2);

  const secondRedeem = await postJson(`/api/desktop/pairing/${encodeURIComponent(created.body.code)}/redeem`, {});
  assert.equal(secondRedeem.status, 409);
});

test("Shopify install OAuth uses the whitelisted callback route", async () => {
  const response = await fetch(`${baseUrl}/auth/shopify/install?shop=alpha-shop.myshopify.com`, {
    redirect: "manual"
  });
  assert.equal(response.status, 302);

  const location = response.headers.get("location") || "";
  const authUrl = new URL(location);
  assert.equal(authUrl.hostname, "alpha-shop.myshopify.com");
  assert.equal(authUrl.pathname, "/admin/oauth/authorize");
  assert.equal(authUrl.searchParams.get("redirect_uri"), `${baseUrl}/auth/callback`);
});

test("OAuth callbacks reject missing or reused state", async () => {
  const response = await fetch(`${baseUrl}/auth/ebay/callback?code=test&state=missing`);
  assert.equal(response.status, 400);
});

test("privacy webhooks reject invalid HMAC signatures", async () => {
  const response = await sendShopifyWebhook({
    path: "/webhooks/shop/redact",
    topic: "shop/redact",
    shop: "invalid-signature-shop.myshopify.com",
    secret: "wrong-secret"
  });
  assert.equal(response.status, 401);
});

test("customer privacy webhooks do not retain customer identifiers", async () => {
  const customerId = "987654321012345";
  const response = await sendShopifyWebhook({
    path: "/webhooks/customers/redact",
    topic: "customers/redact",
    shop: "customer-redact-shop.myshopify.com",
    payload: {
      shop_id: 456,
      shop_domain: "customer-redact-shop.myshopify.com",
      customer: { id: customerId }
    }
  });
  assert.equal(response.status, 200);

  const eventLog = await fsp.readFile(new URL("../data/events.jsonl", import.meta.url), "utf8").catch(() => "");
  assert.doesNotMatch(eventLog, new RegExp(customerId));
});

test("shop redact permanently removes every shop-scoped workspace record", async () => {
  const shop = "redact-shop.myshopify.com";
  const token = sessionToken(shop);

  const listing = await postJson(
    "/api/listings/prepare",
    {
      marketplace: "ebay",
      products: [{
        product: {
          id: "gid://shopify/Product/redact",
          title: "Redaction test product",
          status: "ACTIVE",
          imageUrl: "https://example.test/redact.jpg",
          variants: [{ id: "gid://shopify/ProductVariant/redact", price: "14.00", sku: "REDACT-1" }]
        },
        draft: {
          title: "Redaction test product",
          price: "14.00",
          imageUrl: "https://example.test/redact.jpg"
        },
        checks: []
      }]
    },
    token
  );
  assert.equal(listing.status, 201);

  const exported = await postJson(
    "/api/exports/record",
    {
      marketplace: "ebay",
      exportType: "ebay_preparation_csv",
      productCount: 1,
      productIds: ["gid://shopify/Product/redact"],
      filename: "redact.csv"
    },
    token
  );
  assert.equal(exported.status, 201);

  const pairing = await postJson("/api/desktop/pairing-code", {}, token);
  assert.equal(pairing.status, 201);

  const savedSettings = await fetch(`${baseUrl}/api/marketplace-settings/ebay`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ notes: "This must be deleted." })
  });
  assert.equal(savedSettings.status, 200);

  const redacted = await sendShopifyWebhook({
    path: "/webhooks/shop/redact",
    topic: "shop/redact",
    shop
  });
  assert.equal(redacted.status, 200);

  const recentListings = await getJson("/api/listings/recent", token);
  const recentExports = await getJson("/api/exports/recent", token);
  const settings = await getJson("/api/marketplace-settings/ebay", token);
  assert.deepEqual(recentListings.listings, []);
  assert.deepEqual(recentExports.exports, []);
  assert.equal(settings.settings.notes, "");

  const oldPairing = await postJson(`/api/desktop/pairing/${encodeURIComponent(pairing.body.code)}/redeem`, {});
  assert.equal(oldPairing.status, 404);
});

async function waitForHealth() {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/healthz`);
      if (response.ok) {
        return;
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  throw new Error(`Server did not become healthy. Output:\n${serverOutput}`);
}

async function getJson(path, token = "") {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  const text = await response.text();
  assert.equal(response.ok, true, `${path} returned ${response.status}: ${text}`);
  return JSON.parse(text);
}

async function postJson(path, body, token = "") {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
  });

  const payload = await response.json().catch(() => ({}));
  return {
    status: response.status,
    body: payload
  };
}

function sessionToken(shop) {
  const header = base64UrlJson({ alg: "HS256", typ: "JWT" });
  const now = Math.floor(Date.now() / 1000);
  const payload = base64UrlJson({
    aud: apiKey,
    dest: `https://${shop}`,
    iss: `https://${shop}/admin`,
    sub: "user-1",
    exp: now + 600,
    nbf: now - 5,
    iat: now
  });
  const signature = crypto
    .createHmac("sha256", apiSecret)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${signature}`;
}

function sendShopifyWebhook({ path, topic, shop, secret = apiSecret, payload = null }) {
  const body = JSON.stringify(payload || { shop_id: 123, shop_domain: shop });
  const hmac = crypto.createHmac("sha256", secret).update(body).digest("base64");
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Topic": topic,
      "X-Shopify-Shop-Domain": shop,
      "X-Shopify-Hmac-Sha256": hmac,
      "X-Shopify-Webhook-Id": `test-${topic}`
    },
    body
  });
}

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}
