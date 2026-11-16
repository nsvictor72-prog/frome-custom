/* POST /api/render  (background)
   Renders the full-size file for a paid design and stores it. Called by the order-paid webhook and, as a
   retry, by the download page. Refuses to render anything that is not marked paid. */
import { openStore } from "../../lib/store.mjs";
import { renderDesign, renderPrint } from "../../lib/render.mjs";
import { env, keys, isDesignId, safeEqual, kindsOf } from "../../lib/common.mjs";
import { fulfilIfNeeded } from "../../lib/shopify.mjs";

export const config = { path: "/api/render", method: "POST", background: true };

export async function runRender(id) {
  const store = await openStore();
  const design = await store.getJSON(keys.design(id));
  if (!design || !design.paid || design.status === "ready") { console.log("render: skipped " + JSON.stringify({ found: !!design, paid: !!(design && design.paid), status: design && design.status })); return design && design.status; }
  console.log("render: started " + JSON.stringify({ order: design.orderName, kinds: kindsOf(design), attempt: (design.attempts || 0) + 1, hasPhoto: !!design.hasPhoto }));
  design.status = "rendering"; design.attempts = (design.attempts || 0) + 1; design.renderStartedAt = new Date().toISOString();
  await store.setJSON(keys.design(id), design);
  try {
    const photo = design.hasPhoto ? await store.getBuffer(keys.photo(id)) : null;
    const kinds = kindsOf(design), made = {};
    /* One at a time, so the two large canvases are never in memory together. */
    if (kinds.includes("digital") && !design.file) {
      const out = await renderDesign(design, photo);
      await store.setBuffer(keys.file(id, "jpg"), out.jpg);
      await store.setBuffer(keys.file(id, "png"), out.png);
      design.file = { width: out.width, height: out.height, jpgBytes: out.jpg.length, pngBytes: out.png.length };
      made.digital = design.file;
    }
    if (kinds.includes("canvas") && !design.print) {
      const out = await renderPrint(design, photo);
      await store.setBuffer(keys.print(id), out.jpg);
      design.print = { width: out.width, height: out.height, jpgBytes: out.jpg.length };
      made.canvas = design.print;
    }
    design.status = "ready"; design.readyAt = new Date().toISOString();
    delete design.error;
    console.log("render: finished " + JSON.stringify({ order: design.orderName, made }));
    /* The download is ready, so the digital line can leave the store's Unfulfilled list. */
    await fulfilIfNeeded(design, id);
  } catch (e) {
    design.status = "failed"; design.error = String((e && e.message) || e).slice(0, 300);
    console.log("render: FAILED " + JSON.stringify({ order: design.orderName, error: design.error }));
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
