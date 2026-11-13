// End-to-end test of the order flow with local storage and an in-process render.
import crypto from "node:crypto"; import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import assert from "node:assert/strict";
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "frome-"));
Object.assign(process.env, { FROME_LOCAL_STORE: dir, FROME_INLINE_RENDER: "1", FROME_DOWNLOAD_SECRET: "test-dl", SHOPIFY_WEBHOOK_SECRET: "test-hook",
  FROME_INTERNAL_KEY: "test-int", FROME_ALLOWED_ORIGINS: "https://frome.co", SHOPIFY_DIGITAL_VARIANT_IDS: "111" });
const save = (await import("../netlify/functions/save-design.mjs")).default;
const paid = (await import("../netlify/functions/order-paid.mjs")).default;
const download = (await import("../netlify/functions/download.mjs")).default;
const render = (await import("../netlify/functions/render-background.mjs")).default;
const { runCleanup } = await import("../netlify/functions/cleanup.mjs");
const canvasPkg = (await import("@napi-rs/canvas")).default;

const colors = Array.from({ length: 1500 }, (_, i) => [i % 256, (i * 3) % 256, 200 - (i % 200)]);
const pc = canvasPkg.createCanvas(1600, 1200), g = pc.getContext("2d"); g.fillStyle = "#ccc"; g.fillRect(0, 0, 1600, 1200); g.fillStyle = "#222"; g.beginPath(); g.arc(800, 500, 300, 0, 7); g.fill();
const photo = "data:image/jpeg;base64," + (await pc.encode("jpeg", 90)).toString("base64");
const post = (url, body, headers = {}) => new Request(url, { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers: { "Content-Type": "application/json", ...headers } });
const hook = (order, secret = "test-hook") => { const raw = JSON.stringify(order); return post("https://x.test/api/shopify/order-paid", raw, { "x-shopify-hmac-sha256": crypto.createHmac("sha256", secret).update(raw).digest("base64") }); };
const body = { colors, settings: { caption: "Zoë & Łukasz · June 14, 2025 <b>🎉</b>", strength: 5, blend: "evil" }, photo };
let n = 0; const ok = (m) => console.log("  ok " + (++n) + "  " + m);

let r = await save(post("https://x.test/api/design", body, { origin: "https://evil.example" })); assert.equal(r.status, 403); ok("save refused from another website");
r = await save(post("https://x.test/api/design", { colors: "x" }, { origin: "https://frome.co" })); assert.equal(r.status, 400); ok("save refuses bad colors");
r = await save(post("https://x.test/api/design", { ...body, photo: "data:text/html;base64,AAAA" }, { origin: "https://frome.co" })); assert.equal(r.status, 400); ok("save refuses a non-image photo");
r = await save(post("https://x.test/api/design", body, { origin: "https://frome.co" })); assert.equal(r.status, 200);
const { id, token } = await r.json(); ok("design saved");
const stored = JSON.parse(fs.readFileSync(path.join(dir, encodeURIComponent("design/" + id + ".json"))));
assert.equal(stored.settings.blend, "luminosity"); assert.equal(stored.settings.strength, 0.9); assert.equal(stored.settings.caption, "Zoë & Łukasz · June 14, 2025 <b></b>"); ok("settings clamped, caption limited to supported characters");

const dl = (extra = "", t = token, d = id) => download(new Request("https://x.test/download?d=" + d + "&t=" + t + extra), {});
r = await dl("", "0".repeat(40)); assert.equal(r.status, 404); ok("wrong token gets nothing");
r = await dl("&f=png"); assert.match(await r.text(), /waiting for your payment/); ok("unpaid design cannot be downloaded");
r = await render(post("https://x.test/api/render", { id }, { "x-frome-key": "test-int" })); r = await dl("&f=png"); assert.match(await r.text(), /waiting for your payment/); ok("render refuses an unpaid design");
r = await render(post("https://x.test/api/render", { id }, { "x-frome-key": "nope" })); assert.equal(r.status, 403); ok("render endpoint needs the internal key");

const line = (variant) => ({ variant_id: variant, properties: [{ name: "_design_id", value: id }] });
r = await paid(hook({ id: 1, name: "#1001", financial_status: "paid", line_items: [line(111)] }, "forged")); assert.equal(r.status, 401); ok("webhook with a forged signature rejected");
r = await paid(hook({ id: 1, name: "#1001", financial_status: "paid", line_items: [line(999)] })); assert.deepEqual((await r.json()).designs, []); r = await dl(); assert.match(await r.text(), /waiting for your payment/); ok("design attached to a different product does not unlock");
r = await paid(hook({ id: 1, name: "#1001", financial_status: "pending", line_items: [line(111)] })); assert.equal((await r.json()).skipped, "not_paid"); ok("unpaid order does not unlock");
const t0 = Date.now();
r = await paid(hook({ id: 1, name: "#1001", financial_status: "paid", line_items: [line(111)] })); assert.equal((await r.json()).designs[0].result, "render_started"); ok("paid order unlocks and renders (" + (Date.now() - t0) + " ms)");
r = await paid(hook({ id: 1, name: "#1001", financial_status: "paid", line_items: [line(111)] })); assert.equal((await r.json()).designs[0].result, "already_ready"); ok("repeat webhook is harmless");
r = await dl(); const html = await r.text(); assert.match(html, /Your Frome is ready/); assert.match(html, /#1001/); ok("download page shows the file");
for (const f of ["jpg", "png"]) {
  r = await dl("&f=" + f); const buf = Buffer.from(await r.arrayBuffer()); fs.writeFileSync("test/out-order." + f, buf);
  const img = await canvasPkg.loadImage(buf); assert.equal(img.width, 9000); assert.equal(img.height, 3600);
  assert.match(r.headers.get("content-disposition"), new RegExp("frome-video-palette-1001\\." + f));
  ok(f.toUpperCase() + " downloads at 9000 x 3600, " + (buf.length / 1048576).toFixed(1) + " MB");
}
r = await save(post("https://x.test/api/design", { colors }, { origin: "https://frome.co" })); const stale = (await r.json()).id;
assert.equal(await runCleanup(Date.now() + 8 * 86400000), 1); assert.equal(fs.existsSync(path.join(dir, encodeURIComponent("design/" + stale + ".json"))), false);
assert.equal(fs.existsSync(path.join(dir, encodeURIComponent("design/" + id + ".json"))), true); ok("cleanup removes unpaid designs and keeps paid ones");
console.log("all " + n + " checks passed");
