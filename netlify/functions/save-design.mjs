/* POST /api/design
   The generator page calls this when a customer clicks Buy. It stores the design (column colors, settings,
   optional photo) and returns the id and download token that ride along on the cart line item. The video
   itself is never sent. */
import FromeDraw from "../../shared/draw.js";
import { openStore } from "../../lib/store.mjs";
import { corsHeaders, json, keys, newDesignId, downloadToken, MAX_COLORS, MAX_PHOTO_BYTES, MAX_BODY_BYTES } from "../../lib/common.mjs";

export const config = {
  path: "/api/design",
  method: ["POST", "OPTIONS"],
  rateLimit: { action: "rate_limit", aggregateBy: ["ip", "domain"], windowSize: 60, windowLimit: 12 }
};

const PHOTO_TYPES = { "image/jpeg": 1, "image/png": 1, "image/webp": 1 };

export default async (req) => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (!cors["Access-Control-Allow-Origin"]) return json({ error: "origin_not_allowed" }, 403, cors);

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return json({ error: "too_large", message: "That photo is too large. Try a smaller one." }, 413, cors);
  let body;
  try { body = JSON.parse(raw); } catch (e) { return json({ error: "bad_json" }, 400, cors); }

  const colors = FromeDraw.cleanColors(body && body.colors, MAX_COLORS);
  if (!colors || colors.length < 40) return json({ error: "bad_colors" }, 400, cors);
  const settings = FromeDraw.cleanSettings(body.settings);

  let photo = null, photoType = null;
  if (body.photo) {
    const m = /^data:(image\/[a-z]+);base64,([A-Za-z0-9+/=]+)$/.exec(String(body.photo));
    if (!m || !PHOTO_TYPES[m[1]]) return json({ error: "bad_photo", message: "The photo must be a JPG, PNG or WebP image." }, 400, cors);
    photo = Buffer.from(m[2], "base64"); photoType = m[1];
    if (!photo.length || photo.length > MAX_PHOTO_BYTES) return json({ error: "too_large", message: "That photo is too large. Try a smaller one." }, 413, cors);
  }

  const id = newDesignId(), store = await openStore();
  if (photo) await store.setBuffer(keys.photo(id), photo);
  await store.setJSON(keys.design(id), {
    id, colors, settings, hasPhoto: !!photo, photoType,
    createdAt: new Date().toISOString(), paid: false, status: "saved", attempts: 0
  });
  return json({ id, token: downloadToken(id) }, 200, cors);
};
