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
  console.warn(
    [
      "Render app is live, but Postgres is not durable yet.",
      "Open the Render Blueprint and run Manual Sync.",
      "Expected database: qst-shopify-dashboard-db-frankfurt",
      `Current storage: ${health.storage}`,
      `Storage error: ${health.storageError || "none"}`
    ].join("\n")
  );
  process.exitCode = 2;
}
