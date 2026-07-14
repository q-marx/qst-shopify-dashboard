import assert from "node:assert/strict";
import { test } from "node:test";

import { collectConnectionPages } from "../src/shopify-api.js";

test("connection pagination collects every page in order", async () => {
  const calls = [];
  const pages = new Map([
    [null, { nodes: [1, 2], pageInfo: { hasNextPage: true, endCursor: "page-2" } }],
    ["page-2", { nodes: [3], pageInfo: { hasNextPage: true, endCursor: "page-3" } }],
    ["page-3", { nodes: [4, 5], pageInfo: { hasNextPage: false, endCursor: null } }]
  ]);

  const nodes = await collectConnectionPages(async (after) => {
    calls.push(after);
    return pages.get(after);
  });

  assert.deepEqual(calls, [null, "page-2", "page-3"]);
  assert.deepEqual(nodes, [1, 2, 3, 4, 5]);
});

test("variant pagination starts after variants already returned with the product", async () => {
  const calls = [];
  const nodes = await collectConnectionPages(async (after) => {
    calls.push(after);
    return { nodes: ["variant-251"], pageInfo: { hasNextPage: false, endCursor: null } };
  }, "variant-250");

  assert.deepEqual(calls, ["variant-250"]);
  assert.deepEqual(nodes, ["variant-251"]);
});

test("connection pagination rejects a repeated cursor instead of silently truncating", async () => {
  await assert.rejects(
    collectConnectionPages(async () => ({
      nodes: [],
      pageInfo: { hasNextPage: true, endCursor: "same-cursor" }
    }), "same-cursor"),
    /did not provide a new cursor/
  );
});
