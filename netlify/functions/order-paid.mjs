/* POST /api/shopify/order-paid
   Shopify "Order payment" webhook. This is the only thing that can mark a design as paid. It checks Shopify's
   signature on the raw body, then unlocks designs attached to the digital-file variant and starts the render. */
import { openStore } from "../../lib/store.mjs";
import { triggerRender } from "../../lib/trigger.mjs";
import { json, keys, isDesignId, shopifyHmacOk, listEnv } from "../../lib/common.mjs";

export const config = { path: "/api/shopify/order-paid", method: "POST" };

const IN_PROGRESS_MS = 3 * 60 * 1000;
/* Describes the stored secret without revealing it: its length, and whether it is all hex digits like Shopify's key. */
const secretShape = () => { const s = (process.env.SHOPIFY_WEBHOOK_SECRET || "").trim(); return { length: s.length, hex: /^[a-f0-9]+$/i.test(s) }; };
/* One plain line per notice in the function log. Never logs secrets, tokens or customer details. */
const log = (what, extra = {}) => console.log("order-paid: " + what + " " + JSON.stringify(extra));

export default async (req, context) => {
  const raw = await req.text();
  const topic = req.headers.get("x-shopify-topic") || "unknown";
  let signed;
  try { signed = shopifyHmacOk(raw, req.headers.get("x-shopify-hmac-sha256")); }
  catch (e) { log("SERVER NOT CONFIGURED", { topic, reason: String(e.message) }); return json({ error: "not_configured" }, 500); }
  if (!signed) {
    log("REJECTED bad signature: SHOPIFY_WEBHOOK_SECRET in Netlify does not match the signing secret on Shopify's Webhooks page", { topic, hasSignatureHeader: !!req.headers.get("x-shopify-hmac-sha256"), bodyBytes: raw.length, secretLength: secretShape().length, secretLooksLikeShopifyKey: secretShape().hex });
    return json({ error: "bad_signature" }, 401);
  }
  let order;
  try { order = JSON.parse(raw); } catch (e) { log("REJECTED unreadable body", { topic }); return json({ error: "bad_json" }, 400); }
  if (order.financial_status !== "paid") { log("ignored, order not paid", { topic, order: order.name, status: order.financial_status }); return json({ ok: true, skipped: "not_paid" }); }

  const digitalIds = listEnv("SHOPIFY_DIGITAL_VARIANT_IDS"), canvasIds = listEnv("SHOPIFY_CANVAS_VARIANT_IDS");
  const kindOf = (line) => (digitalIds.includes(String(line.variant_id)) ? "digital" : canvasIds.includes(String(line.variant_id)) ? "canvas" : null);
  const origin = (context && context.site && context.site.url) || new URL(req.url).origin;
  const store = await openStore(), done = [];

  for (const line of order.line_items || []) {
    /* Only the digital-file and framed-canvas products unlock a design. A design id attached to anything else is ignored. */
    const kind = kindOf(line);
    if (!kind) continue;
    const prop = (line.properties || []).find((p) => p && p.name === "_design_id");
    const id = prop && String(prop.value);
    if (!isDesignId(id)) continue;
    const design = await store.getJSON(keys.design(id));
    if (!design) { done.push({ id, result: "unknown_design" }); continue; }
    const had = !!design.paid && (design.kinds && design.kinds.length ? design.kinds : ["digital"]).includes(kind);
    if (design.status === "ready" && had) { done.push({ id, result: "already_ready" }); continue; }
    /* Several notices arrive for one order (created, paid, updated). Only the first starts a render. */
    const started = Date.parse(design.renderStartedAt || design.queuedAt || 0);
    if (had && (design.status === "queued" || design.status === "rendering") && Date.now() - started < IN_PROGRESS_MS) {
      done.push({ id, result: "already_in_progress" }); continue;
    }
    design.kinds = had ? design.kinds || ["digital"] : [...(design.paid ? design.kinds || ["digital"] : []), kind];
    design.paid = true;
    design.orderId = order.id; design.orderName = order.name || "";
    design.paidAt = design.paidAt || new Date().toISOString();
    design.status = "queued"; design.queuedAt = new Date().toISOString();
    await store.setJSON(keys.design(id), design);
    try { await triggerRender(id, origin); done.push({ id, result: "render_started", kind }); }
    catch (e) { done.push({ id, result: "render_trigger_failed" }); }   // the download page retries it
  }
  const videoLines = (order.line_items || []).filter((l) => kindOf(l)).length;
  log(done.length ? "handled" : "ignored, no video design on this order", { topic, order: order.name, videoLines, results: done.map((d) => d.result + (d.kind ? ":" + d.kind : "")) });
  return json({ ok: true, designs: done });
};
