export function renderListingGraderPage({ contactEmail }) {
  const email = encodeURIComponent(contactEmail);
  const rescueHref = "/listing-rescue";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Free Marketplace Listing Grader | QST</title>
    <meta
      name="description"
      content="Free marketplace listing grader for eBay, Etsy, Facebook Marketplace, Vinted, Depop, and Gumtree sellers."
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

      button,
      input,
      select,
      textarea {
        font: inherit;
      }

      button {
        cursor: pointer;
      }

      a {
        color: inherit;
      }

      .shell {
        width: min(1180px, calc(100vw - 32px));
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

      .nav {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        align-items: center;
      }

      .hero {
        padding: 34px 0 22px;
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
        max-width: 880px;
        margin: 0 0 14px;
        font-size: clamp(36px, 5.5vw, 66px);
        line-height: 1;
        letter-spacing: 0;
      }

      h2,
      h3,
      p {
        margin-top: 0;
      }

      .lede {
        max-width: 760px;
        margin-bottom: 0;
        color: #4a4d50;
        font-size: 19px;
        line-height: 1.55;
      }

      .workspace {
        display: grid;
        grid-template-columns: minmax(320px, 0.9fr) minmax(320px, 1.1fr);
        gap: 18px;
        align-items: start;
        padding: 24px 0 44px;
      }

      .panel,
      .result-card,
      .score-card,
      .cta-card {
        border: 1px solid #dcdfe4;
        border-radius: 8px;
        background: #ffffff;
        box-shadow: 0 1px 0 rgba(31, 33, 36, 0.04);
      }

      .panel {
        padding: 18px;
      }

      .field {
        display: grid;
        gap: 6px;
        margin-bottom: 14px;
      }

      .field span {
        color: #5c5f62;
        font-size: 13px;
        font-weight: 700;
      }

      input,
      select,
      textarea {
        width: 100%;
        border: 1px solid #babfc3;
        border-radius: 6px;
        background: #ffffff;
        color: #202223;
      }

      input,
      select {
        min-height: 42px;
        padding: 0 12px;
      }

      textarea {
        min-height: 150px;
        padding: 10px 12px;
        resize: vertical;
      }

      .row {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
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

      .result-grid {
        display: grid;
        gap: 14px;
      }

      .score-card {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 18px;
        align-items: center;
        padding: 20px;
      }

      .score {
        display: inline-grid;
        place-items: center;
        width: 104px;
        height: 104px;
        border-radius: 50%;
        background: #d1fae5;
        color: #005c44;
        font-size: 34px;
        font-weight: 900;
      }

      .score.low {
        background: #fed3d1;
        color: #8e1f0b;
      }

      .score.mid {
        background: #ffe8b5;
        color: #7a4a00;
      }

      .result-card,
      .cta-card {
        padding: 18px;
      }

      .result-card h3,
      .cta-card h3 {
        margin-bottom: 10px;
      }

      .list {
        display: grid;
        gap: 10px;
        margin: 0;
        padding: 0;
        list-style: none;
      }

      .list li {
        padding: 12px;
        border: 1px solid #eceef0;
        border-radius: 6px;
        background: #fafbfb;
        line-height: 1.45;
      }

      .muted {
        color: #5c5f62;
        line-height: 1.5;
      }

      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        align-items: center;
        margin-top: 14px;
      }

      @media (max-width: 900px) {
        .workspace,
        .row,
        .score-card {
          grid-template-columns: 1fr;
        }

        .hero {
          padding-top: 18px;
        }
      }
    </style>
  </head>
  <body>
    <header class="shell topbar">
      <div class="brand">QST Listing Grader</div>
      <nav class="nav" aria-label="QST tools">
        <a class="button secondary" href="${rescueHref}">Done-for-you help</a>
      </nav>
    </header>

    <main class="shell">
      <section class="hero">
        <p class="eyebrow">Free marketplace listing audit</p>
        <h1>Find what is holding back a product listing in under a minute.</h1>
        <p class="lede">
          Paste a product title and description. The grader checks search clarity, buyer detail, tags,
          price/SKU/photo completeness, and gives a practical fix list for eBay, Etsy, Facebook Marketplace,
          Vinted, Depop, or Gumtree.
        </p>
      </section>

      <section class="workspace">
        <form class="panel" id="grader-form">
          <label class="field">
            <span>Marketplace</span>
            <select id="marketplace">
              <option value="eBay">eBay</option>
              <option value="Etsy">Etsy</option>
              <option value="Facebook Marketplace">Facebook Marketplace</option>
              <option value="Vinted">Vinted</option>
              <option value="Depop">Depop</option>
              <option value="Gumtree">Gumtree</option>
            </select>
          </label>

          <label class="field">
            <span>Product title</span>
            <input id="title" maxlength="180" placeholder="Handmade Jesmonite heart sculpture, lilac and gold" />
          </label>

          <label class="field">
            <span>Description</span>
            <textarea id="description" placeholder="Paste the current product description..."></textarea>
          </label>

          <label class="field">
            <span>Tags or keywords</span>
            <input id="tags" placeholder="home decor, gift, handmade, jesmonite" />
          </label>

          <div class="row">
            <label class="field">
              <span>Price present?</span>
              <select id="has-price">
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </label>
            <label class="field">
              <span>SKU present?</span>
              <select id="has-sku">
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </label>
            <label class="field">
              <span>Photos</span>
              <input id="photo-count" type="number" min="0" max="30" value="1" />
            </label>
          </div>

          <button class="button" type="submit">Grade listing</button>
        </form>

        <div class="result-grid" id="results">
          <article class="score-card">
            <div class="score mid">--</div>
            <div>
              <h2>Your listing score will appear here</h2>
              <p class="muted">Use this as a quick pre-listing check before posting products to a marketplace.</p>
            </div>
          </article>
        </div>
      </section>
    </main>

    <script>
      const form = document.querySelector('#grader-form');
      const results = document.querySelector('#results');
      const contactEmail = '${email}';

      form.addEventListener('submit', function (event) {
        event.preventDefault();
        gradeListing();
      });

      function gradeListing() {
        const marketplace = valueOf('marketplace');
        const title = valueOf('title');
        const description = valueOf('description');
        const tags = valueOf('tags');
        const hasPrice = valueOf('has-price') === 'yes';
        const hasSku = valueOf('has-sku') === 'yes';
        const photoCount = Number(valueOf('photo-count')) || 0;
        const tagCount = tags ? tags.split(',').map(function (tag) { return tag.trim(); }).filter(Boolean).length : 0;
        const titleWords = words(title).length;
        const descriptionWords = words(description).length;
        const issues = [];
        const wins = [];
        let score = 0;

        if (titleWords >= 5 && title.length <= 90) {
          score += 18;
          wins.push('Title is a usable marketplace length.');
        } else if (titleWords > 0) {
          score += 8;
          issues.push('Make the title specific but not overstuffed. Aim for 5-12 useful words.');
        } else {
          issues.push('Add a clear product title.');
        }

        if (hasUsefulNouns(title)) {
          score += 12;
          wins.push('Title includes searchable product words.');
        } else {
          issues.push('Add buyer search terms such as material, item type, colour, style, size, or use case.');
        }

        if (descriptionWords >= 70) {
          score += 20;
          wins.push('Description has enough detail for buyer confidence.');
        } else if (descriptionWords >= 30) {
          score += 10;
          issues.push('Expand the description with dimensions, material, condition, use case, and what is included.');
        } else {
          issues.push('Description is too thin. Add buyer-facing detail before listing.');
        }

        if (tagCount >= 6) {
          score += 14;
          wins.push('Tags/keywords give the listing extra discovery signals.');
        } else if (tagCount >= 3) {
          score += 7;
          issues.push('Add more tags: item type, material, colour, recipient, occasion, style, and room/use.');
        } else {
          issues.push('Add at least 6 useful tags or keywords.');
        }

        if (hasPrice) {
          score += 10;
          wins.push('Price is present.');
        } else {
          issues.push('Add a price before export/listing.');
        }

        if (hasSku) {
          score += 8;
          wins.push('SKU is present for tracking.');
        } else {
          issues.push('Add a SKU or simple stock code if you manage multiple products.');
        }

        if (photoCount >= 4) {
          score += 12;
          wins.push('Photo count is strong for marketplace buyers.');
        } else if (photoCount >= 1) {
          score += 6;
          issues.push('Add more photos: front, back, scale, detail, and lifestyle/context shot.');
        } else {
          issues.push('Add product photos before listing.');
        }

        if (mentionsDetail(description)) {
          score += 6;
          wins.push('Description includes useful product detail.');
        } else {
          issues.push('Mention dimensions, material, condition, dispatch/collection notes, or care details.');
        }

        score = Math.min(100, score);
        renderResults({ marketplace, title, description, tags, score, issues, wins });
      }

      function renderResults(data) {
        const scoreClass = data.score < 50 ? 'low' : data.score < 75 ? 'mid' : '';
        const grade = data.score >= 75 ? 'Ready to refine' : data.score >= 50 ? 'Needs polish' : 'Needs work';
        const fixList = data.issues.length ? data.issues : ['This is in good shape. Review marketplace category and shipping/condition fields before posting.'];
        const winList = data.wins.length ? data.wins : ['You have a starting point. Tighten the basics above before listing.'];
        const mailBody = [
          'Hi Mark,',
          '',
          'I used the QST Listing Grader and would like help with this product.',
          '',
          'Marketplace: ' + data.marketplace,
          'Score: ' + data.score,
          'Title: ' + data.title,
          '',
          'Description:',
          data.description,
          '',
          'Tags:',
          data.tags
        ].join('\\n');
        const mailHref = 'mailto:' + contactEmail + '?subject=' + encodeURIComponent('QST Listing Grader follow-up') + '&body=' + encodeURIComponent(mailBody);

        results.innerHTML = ''
          + '<article class="score-card">'
          + '<div class="score ' + scoreClass + '">' + data.score + '</div>'
          + '<div><h2>' + escapeHtml(grade) + '</h2>'
          + '<p class="muted">Score for ' + escapeHtml(data.marketplace) + '. Use the fixes below before you list or relist this product.</p></div>'
          + '</article>'
          + '<article class="result-card"><h3>Fix these first</h3><ul class="list">'
          + fixList.map(function (item) { return '<li>' + escapeHtml(item) + '</li>'; }).join('')
          + '</ul></article>'
          + '<article class="result-card"><h3>What already helps</h3><ul class="list">'
          + winList.map(function (item) { return '<li>' + escapeHtml(item) + '</li>'; }).join('')
          + '</ul></article>'
          + '<article class="cta-card"><h3>Want this fixed for you?</h3>'
          + '<p class="muted">QST Listing Rescue starts at &pound;9 for 3 products. Send the result and product links, and I will return copy-ready listing text.</p>'
          + '<div class="actions"><a class="button" href="' + mailHref + '">Send this result</a>'
          + '<a class="button secondary" href="/listing-rescue">See packages</a></div></article>';
      }

      function valueOf(id) {
        return String(document.getElementById(id).value || '').trim();
      }

      function words(value) {
        return String(value || '').trim().split(/\\s+/).filter(Boolean);
      }

      function hasUsefulNouns(value) {
        return /handmade|vintage|decor|gift|set|bundle|ornament|sculpture|print|shirt|dress|jacket|toy|game|book|lamp|table|chair|silver|gold|wood|ceramic|resin|jesmonite|leather|cotton|wool|small|large/i.test(value);
      }

      function mentionsDetail(value) {
        return /cm|mm|inch|size|dimension|material|condition|used|new|handmade|dispatch|delivery|collection|care|weight|colour|color/i.test(value);
      }

      function escapeHtml(value) {
        return String(value || '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      }
    </script>
  </body>
</html>`;
}
