export function renderListingRescuePage({ contactEmail }) {
  const email = encodeURIComponent(contactEmail);
  const subject = encodeURIComponent("QST Listing Rescue request");
  const body = encodeURIComponent(
    [
      "Hi Mark,",
      "",
      "I'd like help preparing marketplace listings.",
      "",
      "Store/product links:",
      "",
      "Marketplace target: eBay / Etsy / Facebook / Vinted / Depop",
      "Package: Starter / Batch / Shop tidy",
      "",
      "Thanks"
    ].join("\n")
  );
  const contactHref = `mailto:${email}?subject=${subject}&body=${body}`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>QST Listing Rescue</title>
    <meta
      name="description"
      content="Done-for-you marketplace listing prep for Shopify, eBay, Etsy, Facebook Marketplace, Vinted, and Depop sellers."
    />
    <style>
      :root {
        color: #202223;
        background: #f6f6f7;
        font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-synthesis: none;
        text-rendering: optimizeLegibility;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-width: 320px;
        background:
          linear-gradient(135deg, rgba(0, 128, 96, 0.09), transparent 28rem),
          #f6f6f7;
      }

      a {
        color: inherit;
      }

      .shell {
        width: min(1120px, calc(100vw - 32px));
        margin: 0 auto;
      }

      .topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: 18px 0;
      }

      .brand {
        font-weight: 800;
        letter-spacing: 0;
      }

      .hero {
        display: grid;
        grid-template-columns: minmax(0, 1.25fr) minmax(280px, 0.75fr);
        gap: 28px;
        align-items: center;
        min-height: 68vh;
        padding: 34px 0 42px;
      }

      .eyebrow {
        margin: 0 0 10px;
        color: #007f5f;
        font-size: 13px;
        font-weight: 800;
        letter-spacing: 0;
        text-transform: uppercase;
      }

      h1 {
        max-width: 760px;
        margin: 0 0 16px;
        font-size: clamp(38px, 6vw, 72px);
        line-height: 0.98;
        letter-spacing: 0;
      }

      .lede {
        max-width: 680px;
        margin: 0 0 24px;
        color: #4a4d50;
        font-size: 19px;
        line-height: 1.55;
      }

      .actions,
      .mini-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        align-items: center;
      }

      .button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 44px;
        padding: 0 18px;
        border: 1px solid #007f5f;
        border-radius: 6px;
        background: #007f5f;
        color: #ffffff;
        font-weight: 800;
        text-decoration: none;
      }

      .button.secondary {
        border-color: #c9cccf;
        background: #ffffff;
        color: #202223;
      }

      .proof {
        border: 1px solid #dcdfe4;
        border-radius: 8px;
        background: #ffffff;
        box-shadow: 0 1px 0 rgba(31, 33, 36, 0.04);
        overflow: hidden;
      }

      .proof-header {
        padding: 18px;
        border-bottom: 1px solid #e4e5e7;
      }

      .proof-header strong {
        display: block;
        margin-bottom: 4px;
        font-size: 20px;
      }

      .proof-header span {
        color: #5c5f62;
      }

      .checks {
        display: grid;
        gap: 0;
        margin: 0;
        padding: 0;
        list-style: none;
      }

      .checks li {
        display: grid;
        grid-template-columns: 92px 1fr;
        gap: 14px;
        padding: 14px 18px;
        border-bottom: 1px solid #eceef0;
      }

      .checks li:last-child {
        border-bottom: 0;
      }

      .pill {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        height: 24px;
        border-radius: 999px;
        background: #d1fae5;
        color: #005c44;
        font-size: 12px;
        font-weight: 800;
      }

      .section {
        padding: 42px 0;
        border-top: 1px solid #e4e5e7;
      }

      .section h2 {
        margin: 0 0 18px;
        font-size: 28px;
      }

      .grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 14px;
      }

      .package {
        border: 1px solid #dcdfe4;
        border-radius: 8px;
        background: #ffffff;
        padding: 18px;
      }

      .package h3 {
        margin: 0 0 8px;
        font-size: 19px;
      }

      .price {
        display: block;
        margin-bottom: 10px;
        font-size: 30px;
        font-weight: 900;
      }

      .package p,
      .step p,
      .note {
        color: #5c5f62;
        line-height: 1.5;
      }

      .steps {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 14px;
      }

      .step {
        padding: 18px 0;
      }

      .step strong {
        display: block;
        margin-bottom: 8px;
        color: #007f5f;
      }

      .footer {
        padding: 34px 0 46px;
      }

      @media (max-width: 860px) {
        .hero,
        .grid,
        .steps {
          grid-template-columns: 1fr;
        }

        .hero {
          min-height: 0;
          padding-top: 18px;
        }
      }
    </style>
  </head>
  <body>
    <header class="shell topbar">
      <div class="brand">QST Listing Rescue</div>
      <a class="button secondary" href="${contactHref}">Request a slot</a>
    </header>

    <main class="shell">
      <section class="hero">
        <div>
          <p class="eyebrow">Done-for-you marketplace listing prep</p>
          <h1>Turn neglected product listings into copy-ready marketplace packs.</h1>
          <p class="lede">
            Send your Shopify products, Etsy drafts, eBay items, or a spreadsheet. I return improved titles,
            descriptions, tags, SKU notes, and export-ready copy for the marketplace you want to sell on.
          </p>
          <div class="actions">
            <a class="button" href="${contactHref}">Get a quote today</a>
            <a class="button secondary" href="#packages">See packages</a>
          </div>
        </div>

        <aside class="proof" aria-label="What you get">
          <div class="proof-header">
            <strong>What comes back</strong>
            <span>Practical listing copy you can paste, export, or hand to a VA.</span>
          </div>
          <ul class="checks">
            <li><span class="pill">Ready</span><span>Marketplace titles shaped for search and clarity</span></li>
            <li><span class="pill">Ready</span><span>Clean descriptions with useful buyer details</span></li>
            <li><span class="pill">Ready</span><span>Suggested tags, attributes, and missing info notes</span></li>
            <li><span class="pill">Ready</span><span>CSV or text pack for eBay, Etsy, Facebook, Vinted, Depop, or Gumtree</span></li>
          </ul>
        </aside>
      </section>

      <section class="section" id="packages">
        <h2>Quick packages</h2>
        <div class="grid">
          <article class="package">
            <h3>Starter Rescue</h3>
            <strong class="price">£29</strong>
            <p>Up to 5 products. Best for testing the process or fixing a small batch before listing.</p>
          </article>
          <article class="package">
            <h3>Listing Batch</h3>
            <strong class="price">£79</strong>
            <p>Up to 20 products. Good for a focused eBay, Etsy, or Facebook Marketplace push.</p>
          </article>
          <article class="package">
            <h3>Shop Tidy</h3>
            <strong class="price">£149</strong>
            <p>Up to 50 products with readiness notes and a cleaner export pack for your next marketplace run.</p>
          </article>
        </div>
      </section>

      <section class="section">
        <h2>How it works</h2>
        <div class="steps">
          <div class="step">
            <strong>1. Send products</strong>
            <p>Send product links, a Shopify export, or a spreadsheet.</p>
          </div>
          <div class="step">
            <strong>2. Pick marketplace</strong>
            <p>Choose eBay, Etsy, Facebook Marketplace, Vinted, Depop, or Gumtree.</p>
          </div>
          <div class="step">
            <strong>3. Review pack</strong>
            <p>You receive copy-ready titles, descriptions, tags, and missing-info notes.</p>
          </div>
          <div class="step">
            <strong>4. List faster</strong>
            <p>Paste the copy yourself, hand it to a VA, or request another batch.</p>
          </div>
        </div>
      </section>

      <section class="section footer">
        <h2>Need cashflow from existing products?</h2>
        <p class="note">
          This is a manual QST-assisted service while the full QST Shopify app is being prepared. No subscriptions,
          no long setup, and no software install required.
        </p>
        <div class="mini-actions">
          <a class="button" href="${contactHref}">Request a slot</a>
          <a class="button secondary" href="mailto:${email}">${contactEmail}</a>
        </div>
      </section>
    </main>
  </body>
</html>`;
}
