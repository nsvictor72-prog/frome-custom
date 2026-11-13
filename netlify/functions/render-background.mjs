/* POST /api/render  (background)
   Renders the full-size file for a paid design and stores it. Called by the order-paid webhook and, as a
   retry, by the download page. Refuses to render anything that is not marked paid. */
import { openStore } from "../../lib/store.mjs";
import { renderDesign } from "../../lib/render.mjs";
import { env, keys, isDesignId, safeEqual } from "../../lib/common.mjs";

export const config = { path: "/api/render", method: "POST", background: true };

export async function runRender(id) {
  const store = await openStore();
  const design = await store.getJSON(keys.design(id));
  if (!design || !design.paid || design.status === "ready") return design && design.status;
  design.status = "rendering"; design.attempts = (design.attempts || 0) + 1; design.renderStartedAt = new Date().toISOString();
  await store.setJSON(keys.design(id), design);
  try {
    const photo = design.hasPhoto ? await store.getBuffer(keys.photo(id)) : null;
    const out = await renderDesign(design, photo);
    await store.setBuffer(keys.file(id, "jpg"), out.jpg);
    await store.setBuffer(keys.file(id, "png"), out.png);
    design.status = "ready"; design.readyAt = new Date().toISOString();
    design.file = { width: out.width, height: out.height, jpgBytes: out.jpg.length, pngBytes: out.png.length };
    delete design.error;
  } catch (e) {
    design.status = "failed"; design.error = String((e && e.message) || e).slice(0, 300);
  }
  await store.setJSON(keys.design(id), design);
  return design.status;
}

export default async (req) => {
  if (!safeEqual(req.headers.get("x-frome-key") || "", env("FROME_INTERNAL_KEY"))) return new Response("forbidden", { status: 403 });
  let id; try { id = (await req.json()).id; } catch (e) { id = null; }
  if (isDesignId(id)) await runRender(id);
  return new Response("ok");
};
