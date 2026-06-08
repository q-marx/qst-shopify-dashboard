const endpoint = process.argv[2] || "https://qst-shopify-dashboard.onrender.com/api/health";

const response = await fetch(endpoint, {
  headers: {
    accept: "application/json"
  }
});

if (!response.ok) {
  throw new Error(`Health check failed with HTTP ${response.status}`);
}

const health = await response.json();
console.log(JSON.stringify(health, null, 2));

if (!health.ok || health.storageReady !== true) {
  throw new Error("Render app is not reporting ready.");
}

if (health.postgresReady !== true) {
  const looksLikeInternalRenderHost = String(health.storageError || "").includes("ENOTFOUND dpg-");
  console.warn(
    [
      "Render app is live, but Postgres is not durable yet.",
      looksLikeInternalRenderHost
        ? "The app appears to be using an internal Render database URL that is not reachable from this web service region."
        : "Check the Render DATABASE_URL value and database status.",
      "Fast fix: set DATABASE_URL to the existing database's External Database URL, then redeploy.",
      "Clean fix: create/sync qst-shopify-dashboard-db-frankfurt in Frankfurt and use its Internal Database URL.",
      `Current storage: ${health.storage}`,
      `Storage error: ${health.storageError || "none"}`
    ].join("\n")
  );
  process.exitCode = 2;
}
