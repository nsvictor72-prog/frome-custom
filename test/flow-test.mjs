// End-to-end test of the order flow with local storage and an in-process render.
import crypto from "node:crypto"; import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import assert from "node:assert/strict";
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "frome-"));
Object.assign(process.env, { FROME_LOCAL_STORE: dir, FROME_INLINE_RENDER: "1", FROME_DOWNLOAD_SECRET: "test-dl", SHOPIFY_WEBHOOK_SECRET: "test-hook",
  FROME_INTERNAL_KEY: "test-int", FROME_ALLOWED_ORIGINS: "https://frome.co", SHOPIFY_DIGITAL_VARIANT_IDS: "111", SHOPIFY_CANVAS_VARIANT_IDS: "222", FROME_ADMIN_KEY: "test-admin-key-0123456789" });
const admin = (await import("../netlify/functions/admin.mjs")).default;
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
{ // a second notice while the first render is still running must not start another
  const r2 = await save(post("https://x.test/api/design", { colors }, { origin: "https://frome.co" })); const id2 = (await r2.json()).id;
  const f = path.join(dir, encodeURIComponent("design/" + id2 + ".json")); const d = JSON.parse(fs.readFileSync(f));
  Object.assign(d, { paid: true, status: "rendering", renderStartedAt: new Date().toISOString() }); fs.writeFileSync(f, JSON.stringify(d));
  const r3 = await paid(hook({ id: 2, name: "#1002", financial_status: "paid", line_items: [{ variant_id: 111, properties: [{ name: "_design_id", value: id2 }] }] }));
  assert.equal((await r3.json()).designs[0].result, "already_in_progress"); fs.rmSync(f); ok("a notice during a running render does not start a second one");
}
process.env.SHOPIFY_WEBHOOK_SECRET = "  test-hook\n"; r = await paid(hook({ id: 3, name: "#1003", financial_status: "pending", line_items: [] })); assert.equal(r.status, 200); process.env.SHOPIFY_WEBHOOK_SECRET = "test-hook"; ok("a secret pasted with stray spaces still verifies");
r = await dl(); const html = await r.text(); assert.match(html, /Your Frome is ready/); assert.match(html, /#1001/); ok("download page shows the file");
for (const f of ["jpg", "png"]) {
  r = await dl("&f=" + f); const buf = Buffer.from(await r.arrayBuffer()); fs.writeFileSync("test/out-order." + f, buf);
  const img = await canvasPkg.loadImage(buf); assert.equal(img.width, 9000); assert.equal(img.height, 3600);
  assert.match(r.headers.get("content-disposition"), new RegExp("frome-video-palette-1001\\." + f));
  ok(f.toUpperCase() + " downloads at 9000 x 3600, " + (buf.length / 1048576).toFixed(1) + " MB");
}
{ // framed canvas order: print file with wrap, reachable only through the owner page
  const rc = await save(post("https://x.test/api/design", body, { origin: "https://frome.co" })); const c = await rc.json();
  const t1 = Date.now();
  r = await paid(hook({ id: 9, name: "#2001", financial_status: "paid", line_items: [{ variant_id: 222, properties: [{ name: "_design_id", value: c.id }] }] }));
  assert.equal((await r.json()).designs[0].kind, "canvas"); ok("framed canvas order unlocks and renders the print file (" + (Date.now() - t1) + " ms)");
  r = await dl("", c.token, c.id); assert.match(await r.text(), /This order is a framed canvas/);
  r = await dl("&f=jpg", c.token, c.id); assert.match(await r.text(), /This order is a framed canvas/); ok("canvas buyer gets no digital download");
  const adm = (q) => admin(new Request("https://x.test/admin/" + q));
  r = await adm("orders?k=wrong-key-0123456789abcdef"); assert.equal(r.status, 404);
  r = await adm("file?d=" + c.id + "&f=print&k=" + c.token); assert.equal(r.status, 404); ok("owner pages refuse a wrong key, including a customer's token");
  r = await adm("orders?k=test-admin-key-0123456789"); const list = await r.text(); assert.match(list, /#2001/); assert.match(list, /#1001/); assert.match(list, /Print file/); ok("owner page lists paid orders with the print file link");
  r = await adm("file?d=" + c.id + "&f=print&k=test-admin-key-0123456789"); const pbuf = Buffer.from(await r.arrayBuffer()); fs.writeFileSync("test/out-order-print.jpg", pbuf);
  const pimg = await canvasPkg.loadImage(pbuf); assert.equal(pimg.width, 9900); assert.equal(pimg.height, 4500);
  const pc2 = canvasPkg.createCanvas(9900, 4500), g2 = pc2.getContext("2d"); g2.drawImage(pimg, 0, 0);
  const px = (x, y) => Array.from(g2.getImageData(x, y, 1, 1).data.slice(0, 3));
  for (const [x, y] of [[200, 2250], [9700, 2250], [4950, 200], [4950, 4300], [100, 100]]) assert.ok(px(x, y).every((v) => v < 6), "wrap must be black at " + x + "," + y);
  assert.ok(px(1000, 2250).some((v) => v > 30), "front face must carry the design");
  ok("print file is 9900 x 4500 with a black 450 px wrap on every side, " + (pbuf.length / 1048576).toFixed(1) + " MB");
}
r = await save(post("https://x.test/api/design", { colors }, { origin: "https://frome.co" })); const stale = (await r.json()).id;
assert.equal(await runCleanup(Date.now() + 8 * 86400000), 1); assert.equal(fs.existsSync(path.join(dir, encodeURIComponent("design/" + stale + ".json"))), false);
assert.equal(fs.existsSync(path.join(dir, encodeURIComponent("design/" + id + ".json"))), true); ok("cleanup removes unpaid designs and keeps paid ones");
console.log("all " + n + " checks passed");
