import { defineConfig, loadEnv } from "vite";

function hostnameFromUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  try {
    return new URL(raw).hostname;
  } catch {
    return raw.replace(/^https?:\/\//, "").split(/[/:]/)[0];
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const port = Number(env.FRONTEND_PORT || env.PORT || 5173);
  const host = env.HOST ? "0.0.0.0" : "127.0.0.1";
  const tunnelHost = hostnameFromUrl(env.HOST || env.APP_URL);
  const allowedHosts = [
    "localhost",
    "127.0.0.1",
    ".trycloudflare.com",
    tunnelHost
  ].filter(Boolean);

  return {
    plugins: [
      {
        name: "qst-shopify-api-key-html",
        transformIndexHtml(html) {
          return html.replace(
            /%VITE_SHOPIFY_API_KEY%/g,
            env.VITE_SHOPIFY_API_KEY || env.SHOPIFY_API_KEY || "replace_with_shopify_client_id"
          );
        }
      }
    ],
    server: {
      host,
      port,
      strictPort: true,
      allowedHosts
    },
    define: {
      "import.meta.env.VITE_SHOPIFY_API_KEY": JSON.stringify(
        env.VITE_SHOPIFY_API_KEY || env.SHOPIFY_API_KEY || "replace_with_shopify_client_id"
      )
    }
  };
});
