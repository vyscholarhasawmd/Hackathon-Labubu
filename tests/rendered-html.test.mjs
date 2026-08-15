import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
}

test("server-renders the Re-Sort product experience", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /Re-Sort/);
  assert.match(html, /Good morning, Emma/);
  assert.match(html, /Scan an item/);
  assert.match(html, /Demo AI/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("keeps required product copy and privacy disclosures in source", async () => {
  const [app, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/resort-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.match(app, /If the product has a recycling or disposal symbol/);
  assert.match(app, /Your feedback has been received/);
  assert.match(app, /Connect with your Re-Sort Bin/);
  assert.match(app, /Estimated disposal footprint/);
  assert.match(app, /DE-FEDERAL-2026\.08/);
  assert.match(app, /No card number, CVV or expiry is sent or stored/);
  assert.match(layout, /Waste intelligence for Germany/);
  assert.match(layout, /og\.png/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});
