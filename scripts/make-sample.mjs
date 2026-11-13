// Builds the sample product image: an illustrated couple (no real people) behind a sample wedding-day palette.
import fs from "node:fs";
import canvasPkg from "@napi-rs/canvas";
import { renderDesign } from "../lib/render.mjs";
const { createCanvas, loadImage } = canvasPkg;

function couplePhoto() {
  const W = 3000, H = 2250, c = createCanvas(W, H), g = c.getContext("2d");
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#6f7f95"); sky.addColorStop(0.45, "#c9b8a8"); sky.addColorStop(0.8, "#f7e6cc"); sky.addColorStop(1, "#e9c9a0");
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  const sun = g.createRadialGradient(1500, 1560, 30, 1500, 1560, 1150);
  sun.addColorStop(0, "rgba(255,252,240,1)"); sun.addColorStop(0.25, "rgba(255,244,220,.85)"); sun.addColorStop(1, "rgba(255,240,210,0)");
  g.fillStyle = sun; g.fillRect(0, 0, W, H);
  // distant hills, then the near ridge the couple stands on
  g.fillStyle = "rgba(90,80,80,.45)"; g.beginPath(); g.moveTo(0, 1760); g.bezierCurveTo(600, 1600, 1100, 1720, 1700, 1690); g.bezierCurveTo(2300, 1650, 2700, 1560, 3000, 1640); g.lineTo(3000, H); g.lineTo(0, H); g.fill();
  g.fillStyle = "#1d1a1b"; g.beginPath(); g.moveTo(0, 1980); g.quadraticCurveTo(1500, 1760, 3000, 1990); g.lineTo(3000, H); g.lineTo(0, H); g.fill();

  const dark = "#191617";
  // ---- groom ----
  g.fillStyle = dark;
  g.beginPath(); g.ellipse(1318, 1052, 58, 68, 0, 0, Math.PI * 2); g.fill();                    // head
  g.fillRect(1296, 1108, 44, 50);                                                             // neck
  g.beginPath();                                                                              // jacket
  g.moveTo(1200, 1190); g.quadraticCurveTo(1318, 1128, 1436, 1190);
  g.quadraticCurveTo(1452, 1340, 1422, 1520); g.lineTo(1216, 1520); g.quadraticCurveTo(1184, 1340, 1200, 1190); g.fill();
  g.beginPath(); g.moveTo(1222, 1500); g.lineTo(1316, 1500); g.lineTo(1300, 1872); g.lineTo(1232, 1872); g.fill();   // legs
  g.beginPath(); g.moveTo(1324, 1500); g.lineTo(1418, 1500); g.lineTo(1404, 1868); g.lineTo(1338, 1868); g.fill();
  g.beginPath(); g.ellipse(1262, 1876, 56, 16, 0, 0, Math.PI * 2); g.fill(); g.beginPath(); g.ellipse(1378, 1872, 56, 16, 0, 0, Math.PI * 2); g.fill();
  g.lineCap = "round"; g.strokeStyle = dark; g.lineWidth = 46;
  g.beginPath(); g.moveTo(1212, 1215); g.quadraticCurveTo(1176, 1380, 1196, 1530); g.stroke();   // far arm
  g.beginPath(); g.moveTo(1426, 1215); g.quadraticCurveTo(1470, 1370, 1518, 1492); g.stroke();   // arm to joined hands

  // ---- bride ----
  const gown = "#f4eee6", skin = "#3a3031";
  g.fillStyle = "rgba(246,240,232,.5)";                                                       // veil
  g.beginPath(); g.moveTo(1722, 1066); g.bezierCurveTo(1900, 1120, 2010, 1380, 2060, 1700); g.bezierCurveTo(1960, 1640, 1850, 1560, 1770, 1420); g.bezierCurveTo(1760, 1300, 1750, 1180, 1722, 1066); g.fill();
  g.fillStyle = gown;                                                                         // gown and train
  g.beginPath(); g.moveTo(1628, 1250); g.quadraticCurveTo(1690, 1230, 1752, 1250);
  g.quadraticCurveTo(1742, 1360, 1736, 1420);
  g.bezierCurveTo(1800, 1560, 1960, 1760, 2230, 1900); g.lineTo(1500, 1900);
  g.bezierCurveTo(1580, 1760, 1630, 1560, 1642, 1420); g.quadraticCurveTo(1636, 1350, 1628, 1250); g.fill();
  g.fillStyle = skin;
  g.beginPath(); g.ellipse(1690, 1108, 52, 62, 0, 0, Math.PI * 2); g.fill();                    // head
  g.beginPath(); g.arc(1736, 1066, 34, 0, Math.PI * 2); g.fill();                              // bun
  g.fillRect(1672, 1160, 36, 44);                                                             // neck
  g.beginPath(); g.moveTo(1612, 1232); g.quadraticCurveTo(1690, 1186, 1768, 1232); g.lineTo(1752, 1262); g.lineTo(1628, 1262); g.fill();   // shoulders
  g.strokeStyle = skin; g.lineWidth = 30;
  g.beginPath(); g.moveTo(1624, 1246); g.quadraticCurveTo(1572, 1380, 1518, 1492); g.stroke(); // arm to joined hands
  g.beginPath(); g.moveTo(1758, 1246); g.quadraticCurveTo(1790, 1350, 1776, 1440); g.stroke(); // far arm
  g.fillStyle = "#e9dccb"; g.beginPath(); g.arc(1778, 1462, 34, 0, Math.PI * 2); g.fill();     // bouquet
  return c;
}

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

const photo = couplePhoto();
fs.writeFileSync("out/couple-illustration.jpg", await photo.encode("jpeg", 90));
const design = { colors: samplePalette(1500), settings: { detail: 1500, blend: "luminosity", strength: 0.62, zoom: 1, posX: 0.5, posY: 0.5, edgeFade: true, finish: true, caption: "Maya & Daniel · June 14, 2025" } };
const out = await renderDesign(design, await photo.encode("png"), { w: 3000, h: 1200 });
fs.writeFileSync("out/sample-frome.jpg", out.jpg);

// Square product image: the piece hung on a dark wall.
const S = 2000, p = createCanvas(S, S), g = p.getContext("2d");
const wall = g.createRadialGradient(S / 2, S * 0.38, 100, S / 2, S / 2, S * 0.85);
wall.addColorStop(0, "#3a3540"); wall.addColorStop(0.6, "#2b2731"); wall.addColorStop(1, "#1c1920");
g.fillStyle = wall; g.fillRect(0, 0, S, S);
const art = await loadImage(out.jpg), aw = 1700, ah = 680, ax = (S - aw) / 2, ay = (S - ah) / 2 - 40;
g.shadowColor = "rgba(0,0,0,.6)"; g.shadowBlur = 70; g.shadowOffsetY = 36; g.fillStyle = "#000"; g.fillRect(ax, ay, aw, ah);
g.shadowColor = "transparent"; g.shadowBlur = 0; g.shadowOffsetY = 0; g.drawImage(art, ax, ay, aw, ah);
fs.writeFileSync("out/video-frome-product-image.jpg", await p.encode("jpeg", 92));
console.log("done");
