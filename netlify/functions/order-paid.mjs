/* POST /api/shopify/order-paid
   Shopify "Order payment" webhook. This is the only thing that can mark a design as paid. It checks Shopify's
   signature on the raw body, then unlocks designs attached to the digital-file variant and starts the render. */
import { openStore } from "../../lib/store.mjs";
import { triggerRender } from "../../lib/trigger.mjs";
import { env, json, keys, isDesignId, shopifyHmacOk } from "../../lib/common.mjs";

export const config = { path: "/api/shopify/order-paid", method: "POST" };

export default async (req, context) => {
  const raw = await req.text();
  if (!shopifyHmacOk(raw, req.headers.get("x-shopify-hmac-sha256"))) return json({ error: "bad_signature" }, 401);
  let order;
  try { order = JSON.parse(raw); } catch (e) { return json({ error: "bad_json" }, 400); }
  if (order.financial_status !== "paid") return json({ ok: true, skipped: "not_paid" });

  const variantIds = env("SHOPIFY_DIGITAL_VARIANT_IDS").split(",").map((s) => s.trim());
  const origin = (context && context.site && context.site.url) || new URL(req.url).origin;
  const store = await openStore(), done = [];

  for (const line of order.line_items || []) {
    /* Only the digital-file product unlocks a download. A design id attached to anything else is ignored. */
    if (!variantIds.includes(String(line.variant_id))) continue;
    const prop = (line.properties || []).find((p) => p && p.name === "_design_id");
    const id = prop && String(prop.value);
    if (!isDesignId(id)) continue;
    const design = await store.getJSON(keys.design(id));
    if (!design) { done.push({ id, result: "unknown_design" }); continue; }
    if (design.status === "ready") { done.push({ id, result: "already_ready" }); continue; }
    design.paid = true;
    design.orderId = order.id; design.orderName = order.name || "";
    design.paidAt = design.paidAt || new Date().toISOString();
    design.status = "queued"; design.queuedAt = new Date().toISOString();
    await store.setJSON(keys.design(id), design);
    try { await triggerRender(id, origin); done.push({ id, result: "render_started" }); }
    catch (e) { done.push({ id, result: "render_trigger_failed" }); }   // the download page retries it
  }
  return json({ ok: true, designs: done });
};
