import canvasPkg from "@napi-rs/canvas";
import FromeDraw from "../shared/draw.js";
import { LATIN, LATIN_EXT } from "./caption-font.mjs";
import { PRINT_W, PRINT_H } from "./common.mjs";

const { createCanvas, loadImage, GlobalFonts } = canvasPkg;
let fontsReady = false;
function ensureFonts() {
  if (fontsReady) return;
  GlobalFonts.register(Buffer.from(LATIN, "base64"), "Frome Caption");
  GlobalFonts.register(Buffer.from(LATIN_EXT, "base64"), "Frome Caption Ext");
  fontsReady = true;
}

/* Renders the clean, full-size file from a stored design. Returns { jpg, png } as Buffers. */
export async function renderDesign(design, photoBuffer, size) {
  ensureFonts();
  const W = (size && size.w) || PRINT_W, H = (size && size.h) || PRINT_H;
  const photo = photoBuffer ? await loadImage(photoBuffer) : null;
  const canvas = createCanvas(W, H);
  FromeDraw.render(canvas, { colors: design.colors, settings: design.settings }, photo, {
    makeCanvas: createCanvas, watermark: false, captionFont: "'Frome Caption', 'Frome Caption Ext'"
  });
  let jpg = await canvas.encode("jpeg", 95);
  if (jpg.length > 5.5 * 1024 * 1024) jpg = await canvas.encode("jpeg", 90);
  const png = await canvas.encode("png");
  return { jpg, png, width: W, height: H };
}
