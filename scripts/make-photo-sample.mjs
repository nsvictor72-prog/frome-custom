// Renders the sample with a supplied photo. Usage: node scripts/make-photo-sample.mjs <photo> <tag> <blend> <strength> <zoom> <posX> <posY>
import fs from "node:fs";
import canvasPkg from "@napi-rs/canvas";
import { renderDesign } from "../lib/render.mjs";
const { createCanvas, loadImage } = canvasPkg;
const [photoPath, tag, blend, strength, zoom, posX, posY] = process.argv.slice(2);
function samplePalette(n) {
  const keys = [[0, [176, 190, 204]], [.1, [214, 208, 196]], [.22, [236, 226, 214]], [.32, [118, 142, 104]], [.44, [168, 176, 130]], [.55, [226, 196, 150]],
    [.66, [232, 160, 104]], [.75, [206, 112, 110]], [.84, [92, 70, 112]], [.92, [38, 40, 76]], [1, [150, 104, 62]]];
  let seed = 7; const r = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296; const out = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1); let k = 0; while (k < keys.length - 2 && t > keys[k + 1][0]) k++;
    const a = keys[k], b = keys[k + 1], f = (t - a[0]) / (b[0] - a[0]), scene = (Math.floor(i / 34) * 37 % 11) / 11 - 0.5;
    out.push([0, 1, 2].map((j) => Math.max(0, Math.min(255, Math.round(a[1][j] + (b[1][j] - a[1][j]) * f + scene * 34 + (r() - .5) * 16)))));
  }
  return out;
}
const design = { colors: samplePalette(1500), settings: { detail: 1500, blend, strength: +strength, zoom: +zoom, posX: +posX, posY: +posY, edgeFade: true, finish: true, caption: "Maya & Daniel · June 14, 2025" } };
const out = await renderDesign(design, fs.readFileSync(photoPath), { w: 3000, h: 1200 });
fs.writeFileSync(`out/sample-frome-${tag}.jpg`, out.jpg);
const S = 2000, p = createCanvas(S, S), g = p.getContext("2d");
const wall = g.createRadialGradient(S / 2, S * 0.38, 100, S / 2, S / 2, S * 0.85);
wall.addColorStop(0, "#3a3540"); wall.addColorStop(0.6, "#2b2731"); wall.addColorStop(1, "#1c1920");
g.fillStyle = wall; g.fillRect(0, 0, S, S);
const art = await loadImage(out.jpg), aw = 1700, ah = 680, ax = (S - aw) / 2, ay = (S - ah) / 2 - 40;
g.shadowColor = "rgba(0,0,0,.6)"; g.shadowBlur = 70; g.shadowOffsetY = 36; g.fillStyle = "#000"; g.fillRect(ax, ay, aw, ah);
g.shadowColor = "transparent"; g.shadowBlur = 0; g.shadowOffsetY = 0; g.drawImage(art, ax, ay, aw, ah);
fs.writeFileSync(`out/video-frome-product-image-${tag}.jpg`, await p.encode("jpeg", 92));
