/* GET /admin/orders?k=<admin key>      a list of paid Video Frome orders with their files
   GET /admin/file?d=<id>&f=print|jpg|png&k=<admin key>   one file
   For the store owner only. The key is FROME_ADMIN_KEY; without it set, these pages do not exist.
   The framed-canvas print file is reachable only here, never through a customer's link. */
import { openStore } from "../../lib/store.mjs";
import { env, keys, isDesignId, safeEqual, kindsOf } from "../../lib/common.mjs";

export const config = {
  path: ["/admin/orders", "/admin/file"],
  method: "GET",
  rateLimit: { action: "rate_limit", aggregateBy: ["ip", "domain"], windowSize: 60, windowLimit: 30 }
};

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const gone = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
const mb = (n) => (n ? (n / 1048576).toFixed(1) + " MB" : "");

export default async (req) => {
  const url = new URL(req.url), key = env("FROME_ADMIN_KEY", false), given = url.searchParams.get("k") || "";
  if (!key || key.length < 16 || !safeEqual(given, key)) return gone();
  const store = await openStore(), k = encodeURIComponent(given);

  if (url.pathname.endsWith("/file")) {
    const id = url.searchParams.get("d") || "", f = url.searchParams.get("f") || "";
    if (!isDesignId(id) || !["print", "jpg", "png"].includes(f)) return gone();
    const design = await store.getJSON(keys.design(id));
    if (!design || !design.paid) return gone();
    const body = await store.getStream(f === "print" ? keys.print(id) : keys.file(id, f));
    if (!body) return gone();
    const order = (design.orderName || id.slice(0, 8)).replace(/[^A-Za-z0-9]/g, "");
    const name = "video-frome-" + order + (f === "print" ? "-print-33x15.jpg" : "." + f);
    return new Response(body, { headers: { "Content-Type": f === "png" ? "image/png" : "image/jpeg", "Content-Disposition": 'attachment; filename="' + name + '"', "Cache-Control": "private, no-store" } });
  }

  const designs = [];
  for (const dk of await store.list("design/")) { const d = await store.getJSON(dk); if (d && d.paid) designs.push(d); }
  designs.sort((a, b) => String(b.paidAt).localeCompare(String(a.paidAt)));
  const rows = designs.map((d) => {
    const kinds = kindsOf(d), link = (f, label) => '<a href="/admin/file?d=' + d.id + "&f=" + f + "&k=" + k + '">' + label + "</a>";
    const files = [];
    if (d.print) files.push(link("print", "Print file · 9900 × 4500 · " + mb(d.print.jpgBytes)));
    if (d.file) { files.push(link("jpg", "Digital JPG · " + mb(d.file.jpgBytes))); files.push(link("png", "Digital PNG · " + mb(d.file.pngBytes))); }
    const state = d.status === "ready" ? "Ready" : d.status === "failed" ? "Failed: " + esc(d.error || "") : "Rendering";
    return "<tr><td><strong>" + esc(d.orderName || "(no order name)") + "</strong></td><td>" + esc(String(d.paidAt || "").replace("T", " ").slice(0, 16)) + " UTC</td><td>" +
      esc(kinds.map((x) => (x === "canvas" ? "Framed canvas" : "Digital file")).join(" + ")) + "</td><td>" + esc(d.settings && d.settings.caption ? d.settings.caption : "") + (d.hasPhoto ? " · photo" : "") +
      "</td><td>" + state + "</td><td>" + (files.join("<br>") || "") + "</td></tr>";
  }).join("");
  return new Response(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Video Frome orders</title>
<style>body{margin:0;background:#17151a;color:#f1edf3;font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}main{max-width:70rem;margin:0 auto;padding:40px 20px}h1{font-size:1.5rem;margin:0 0 4px}p{color:#a9a2b3;margin:0 0 20px}
.wrap{overflow-x:auto}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:10px 12px;border-bottom:1px solid #3a3542;vertical-align:top}th{color:#a9a2b3;font-weight:600;font-size:13px}a{color:#f2b56b}</style></head>
<body><main><h1>Video Frome orders</h1><p>Paid orders, newest first. For a framed canvas, open the print file, check it, then send it to Art Brand. ${designs.length} order${designs.length === 1 ? "" : "s"}.</p>
<div class="wrap"><table><thead><tr><th>Order</th><th>Paid</th><th>Product</th><th>Caption</th><th>Status</th><th>Files</th></tr></thead><tbody>${rows || '<tr><td colspan="6">No paid orders yet.</td></tr>'}</tbody></table></div></main></body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex" } });
};
