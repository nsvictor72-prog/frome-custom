import crypto from "node:crypto";

export const PRINT_W = 9000, PRINT_H = 3600;          // 30x12 in at 300 dpi, the Frome 5:2 shape
export const MAX_COLORS = 1500;
export const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
export const MAX_BODY_BYTES = 5.8 * 1024 * 1024;       // under Netlify's 6 MB request limit
export const UNPAID_TTL_DAYS = 7;

export function env(name, required = true) {
  const v = process.env[name];
  if (required && !v) throw new Error("Missing environment variable " + name);
  return v || "";
}

export const isDesignId = (s) => typeof s === "string" && /^[a-f0-9]{32}$/.test(s);
export const newDesignId = () => crypto.randomBytes(16).toString("hex");

/* The download token is an HMAC of the design id. It cannot be guessed, and it only opens a design
   that the order-paid webhook has marked as paid. */
export function downloadToken(id) {
  return crypto.createHmac("sha256", env("FROME_DOWNLOAD_SECRET")).update("design:" + id).digest("hex").slice(0, 40);
}
export function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
export function shopifyHmacOk(rawBody, header) {
  if (!header) return false;
  const digest = crypto.createHmac("sha256", env("SHOPIFY_WEBHOOK_SECRET")).update(rawBody).digest("base64");
  return safeEqual(digest, header);
}

export function corsHeaders(req) {
  const allowed = env("FROME_ALLOWED_ORIGINS").split(",").map((s) => s.trim()).filter(Boolean);
  const origin = req.headers.get("origin") || "";
  const h = { "Vary": "Origin" };
  if (allowed.includes(origin)) {
    h["Access-Control-Allow-Origin"] = origin;
    h["Access-Control-Allow-Methods"] = "POST, OPTIONS";
    h["Access-Control-Allow-Headers"] = "Content-Type";
    h["Access-Control-Max-Age"] = "86400";
  }
  return h;
}
export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers } });
}
export const keys = {
  design: (id) => "design/" + id + ".json",
  photo: (id) => "photo/" + id,
  file: (id, ext) => "file/" + id + "." + ext
};
