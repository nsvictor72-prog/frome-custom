/* GET /download?d=<design id>&t=<token>[&f=jpg|png]
   The link in the order confirmation email. Shows the file once the order is paid and rendered, a short
   "preparing" page until then, and restarts a render that stalled or failed. */
import { openStore } from "../../lib/store.mjs";
import { triggerRender } from "../../lib/trigger.mjs";
import { keys, isDesignId, downloadToken, safeEqual, kindsOf } from "../../lib/common.mjs";

export const config = {
  path: "/download",
  method: "GET",
  rateLimit: { action: "rate_limit", aggregateBy: ["ip", "domain"], windowSize: 60, windowLimit: 60 }
};

const STALL_MS = 3 * 60 * 1000, MAX_ATTEMPTS = 4;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function page(title, bodyHtml, opts = {}) {
  const refresh = opts.refresh ? '<meta http-equiv="refresh" content="' + opts.refresh + '">' : "";
  return new Response(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">${refresh}<title>${esc(title)}</title>
<style>
  body{margin:0;background:#17151a;color:#f1edf3;font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
  main{max-width:34rem;margin:0 auto;padding:64px 20px;display:flex;flex-direction:column;gap:16px}
  h1{font-size:1.6rem;line-height:1.2;margin:0} p{margin:0;color:#a9a2b3}
  .btns{display:flex;flex-wrap:wrap;gap:12px;margin-top:8px}
  a.btn{display:inline-block;padding:12px 18px;border-radius:8px;font-weight:600;text-decoration:none;border:1px solid #3a3542;color:#f1edf3}
  a.btn.primary{background:#f2b56b;border-color:#f2b56b;color:#2a1c08}
  a.btn:focus-visible{outline:2px solid #f2b56b;outline-offset:2px}
</style></head><body><main>${bodyHtml}</main></body></html>`,
    { status: opts.status || 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex" } });
}
const notFound = () => page("Link not recognized", "<h1>This download link is not valid</h1><p>Open the link from your Frome order confirmation email. If it still fails, reply to that email and we will help.</p>", { status: 404 });

export default async (req, context) => {
  const url = new URL(req.url), id = url.searchParams.get("d") || "", token = url.searchParams.get("t") || "", f = url.searchParams.get("f");
  if (!isDesignId(id) || !safeEqual(token, downloadToken(id))) return notFound();
  const store = await openStore();
  const design = await store.getJSON(keys.design(id));
  if (!design) return notFound();

  if (!design.paid) {
    return page("Waiting for payment", "<h1>We are waiting for your payment to confirm</h1><p>This usually takes a few seconds after checkout. This page refreshes on its own.</p>", { refresh: 6 });
  }

  /* A framed-canvas order does not include the digital file. The print file is only reachable by the store owner. */
  if (!kindsOf(design).includes("digital")) {
    return page("No download with this order", "<h1>This order is a framed canvas</h1><p>Your Frome is being printed and framed, and it ships to you. It does not include a digital download. Questions? Reply to your order confirmation email.</p>");
  }

  if (design.status === "ready") {
    if (f === "jpg" || f === "png") {
      const body = await store.getStream(keys.file(id, f));
      if (body) {
        const name = "frome-video-palette" + (design.orderName ? "-" + design.orderName.replace(/[^A-Za-z0-9]/g, "") : "") + "." + f;
        return new Response(body, { headers: {
          "Content-Type": f === "jpg" ? "image/jpeg" : "image/png",
          "Content-Disposition": 'attachment; filename="' + name + '"',
          "Cache-Control": "private, no-store"
        } });
      }
    }
    const q = "?d=" + id + "&t=" + token, mb = (n) => (n / 1048576).toFixed(1) + " MB", file = design.file || {};
    return page("Your Frome is ready",
      "<h1>Your Frome is ready</h1>" +
      "<p>" + esc(file.width || 9000) + " × " + esc(file.height || 3600) + " pixels, enough to print 30 × 12 inches at 300 dpi." + (design.orderName ? " Order " + esc(design.orderName) + "." : "") + "</p>" +
      '<div class="btns"><a class="btn primary" href="' + q + '&f=jpg">Download JPG' + (file.jpgBytes ? " · " + mb(file.jpgBytes) : "") + "</a>" +
      '<a class="btn" href="' + q + '&f=png">Download PNG' + (file.pngBytes ? " · " + mb(file.pngBytes) : "") + "</a></div>" +
      "<p>The JPG suits most uses. The PNG is lossless and larger. Keep this link: it keeps working.</p>");
  }

  /* Paid but not ready. Restart the render if it failed or has sat too long, up to a few attempts. */
  const since = Date.parse(design.renderStartedAt || design.queuedAt || design.paidAt || 0);
  const stalled = design.status === "failed" || Date.now() - since > STALL_MS;
  if (stalled && (design.attempts || 0) >= MAX_ATTEMPTS) {
    return page("We need to finish this by hand", "<h1>Your file is taking longer than it should</h1><p>Your payment went through" + (design.orderName ? " for order " + esc(design.orderName) : "") + ". Reply to your order confirmation email and we will send the file directly.</p>");
  }
  if (stalled) {
    design.status = "queued"; design.queuedAt = new Date().toISOString();
    await store.setJSON(keys.design(id), design);
    const origin = (context && context.site && context.site.url) || url.origin;
    try { await triggerRender(id, origin); } catch (e) { /* next refresh tries again */ }
  }
  return page("Preparing your Frome", "<h1>We are preparing your file</h1><p>This usually takes under a minute. This page refreshes on its own.</p>", { refresh: 5 });
};
