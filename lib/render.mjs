import canvasPkg from "@napi-rs/canvas";
import FromeDraw from "../shared/draw.js";
import { LATIN, LATIN_EXT } from "./caption-font.mjs";
import { PRINT_W, PRINT_H, WRAP } from "./common.mjs";

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

/* Renders the framed-canvas print file: the 30 x 12 in front face with 1.5 in of solid black wrap on every
   side, 9900 x 4500 px, as one JPG. Matches the catalog print files sent to Art Brand. */
export async function renderPrint(design, photoBuffer) {
  ensureFonts();
  const W = PRINT_W + 2 * WRAP, H = PRINT_H + 2 * WRAP;
  const photo = photoBuffer ? await loadImage(photoBuffer) : null;
  const canvas = createCanvas(W, H), ctx = canvas.getContext("2d");
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
  FromeDraw.render(canvas, { colors: design.colors, settings: design.settings }, photo, {
    makeCanvas: createCanvas, watermark: false, captionFont: "'Frome Caption', 'Frome Caption Ext'",
    area: { x: WRAP, y: WRAP, w: PRINT_W, h: PRINT_H }
  });
  const jpg = await canvas.encode("jpeg", 95);
  return { jpg, width: W, height: H };
}
