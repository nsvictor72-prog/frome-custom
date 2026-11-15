/* Frome video palette renderer.
   One drawing routine for both the browser preview and the server's print-size file, so the two always match.
   Everything is sized relative to the canvas, so the same design renders at 1500x600 or 9000x3600.

   design = {
     colors:   [[r,g,b], ...]   one per time slice, first frame to last
     settings: { detail, smooth, blend, strength, zoom, posX, posY, edgeFade, finish, caption }
   }
   photo  = anything drawImage accepts (HTMLImageElement, canvas, napi Image), or null
   opts   = { makeCanvas(w,h), watermark:boolean, captionFont:string } */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.FromeDraw = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var BLENDS = { "luminosity": 1, "source-over": 1, "soft-light": 1 };

  function clamp(v, lo, hi, dflt) { v = Number(v); if (!isFinite(v)) return dflt; return Math.max(lo, Math.min(hi, v)); }

  /* Accept only known fields in known ranges. The server runs this on whatever the browser sends. */
  function cleanSettings(s) {
    s = s || {};
    return {
      detail: Math.round(clamp(s.detail, 60, 1500, 1500)),
      smooth: !!s.smooth,
      blend: BLENDS[s.blend] ? s.blend : "luminosity",
      strength: clamp(s.strength, 0.05, 0.9, 0.45),
      zoom: clamp(s.zoom, 0.6, 3, 1),
      posX: clamp(s.posX, 0, 1, 0.5),
      posY: clamp(s.posY, 0, 1, 0.5),
      edgeFade: s.edgeFade !== false,
      finish: s.finish !== false,
      /* Captions keep Latin letters, digits and common punctuation: the characters the embedded caption font
         carries, so the preview and the delivered file can never differ. */
      caption: String(s.caption == null ? "" : s.caption).replace(/[\u0000-\u001f]/g, " ")
        .replace(/[^\u0020-\u007e\u00a0-\u024f\u2013\u2014\u2018\u2019\u201c\u201d\u2022]/g, "").trim().slice(0, 60)
    };
  }
  function cleanColors(colors, max) {
    if (!Array.isArray(colors) || colors.length < 1 || colors.length > (max || 1500)) return null;
    var out = [];
    for (var i = 0; i < colors.length; i++) {
      var c = colors[i];
      if (!Array.isArray(c) || c.length !== 3) return null;
      out.push([Math.round(clamp(c[0], 0, 255, 0)), Math.round(clamp(c[1], 0, 255, 0)), Math.round(clamp(c[2], 0, 255, 0))]);
    }
    return out;
  }

  function bucket(colors, n) {
    var L = colors.length; if (n >= L) return colors;
    var out = [];
    for (var g = 0; g < n; g++) {
      var s = Math.floor(g * L / n), e = Math.max(s + 1, Math.floor((g + 1) * L / n)), r = 0, gg = 0, b = 0;
      for (var i = s; i < e; i++) { r += colors[i][0]; gg += colors[i][1]; b += colors[i][2]; }
      var m = e - s; out.push([Math.round(r / m), Math.round(gg / m), Math.round(b / m)]);
    }
    return out;
  }

  function render(canvas, design, photo, opts) {
    opts = opts || {};
    /* opts.area = { x, y, w, h } draws the design into part of a larger canvas (the print file's front face,
       inside its wrap border). Without it the design fills the canvas. */
    var area = opts.area || { x: 0, y: 0, w: canvas.width, h: canvas.height };
    var W = area.w, H = area.h, ctx = canvas.getContext("2d"), s = cleanSettings(design.settings);
    ctx.save(); ctx.translate(area.x, area.y); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
    var cols = bucket(design.colors || [], s.detail), n = cols.length;
    var captionFont = opts.captionFont || "'IBM Plex Sans', 'Segoe UI', sans-serif";

    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);

    if (n) {
      if (s.smooth) {
        var grad = ctx.createLinearGradient(0, 0, W, 0);
        for (var i = 0; i < n; i++) grad.addColorStop((i + 0.5) / n, "rgb(" + cols[i].join(",") + ")");
        ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
      } else {
        for (var k = 0; k < n; k++) {
          var x0 = Math.round(k * W / n), x1 = Math.round((k + 1) * W / n);
          ctx.fillStyle = "rgb(" + cols[k].join(",") + ")"; ctx.fillRect(x0, 0, x1 - x0, H);
        }
      }
    }

    if (photo) {
      var iw = photo.naturalWidth || photo.width, ih = photo.naturalHeight || photo.height;
      var layer = opts.makeCanvas(W, H), lc = layer.getContext("2d");
      /* Photo fills the canvas height at zoom 1. Position moves its center, with travel at every zoom. */
      var sc = (H / ih) * s.zoom, dw = iw * sc, dh = ih * sc;
      var rx = Math.abs(W - dw) / 2 + W * 0.25, ry = Math.abs(H - dh) / 2 + H * 0.25;
      var dx = W / 2 + (s.posX - 0.5) * 2 * rx - dw / 2, dy = H / 2 + (s.posY - 0.5) * 2 * ry - dh / 2;
      lc.drawImage(photo, dx, dy, dw, dh);
      if (s.edgeFade) {
        var m = lc.createLinearGradient(dx, 0, dx + dw, 0);
        m.addColorStop(0, "rgba(0,0,0,0)"); m.addColorStop(0.22, "rgba(0,0,0,1)");
        m.addColorStop(0.78, "rgba(0,0,0,1)"); m.addColorStop(1, "rgba(0,0,0,0)");
        lc.globalCompositeOperation = "destination-in"; lc.fillStyle = m; lc.fillRect(0, 0, W, H);
        /* Same at the photo's own top and bottom, so a photo moved or shrunk inside the canvas never shows a hard edge. */
        var mv = lc.createLinearGradient(0, dy, 0, dy + dh);
        mv.addColorStop(0, "rgba(0,0,0,0)"); mv.addColorStop(0.14, "rgba(0,0,0,1)");
        mv.addColorStop(0.86, "rgba(0,0,0,1)"); mv.addColorStop(1, "rgba(0,0,0,0)");
        lc.fillStyle = mv; lc.fillRect(0, 0, W, H);
      }
      ctx.globalAlpha = s.strength; ctx.globalCompositeOperation = s.blend;
      ctx.drawImage(layer, 0, 0);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
    }

    if (s.finish) {
      /* Frome finish: stripes glow in the middle and fall away toward the top and bottom. The curve is measured
         from a catalog print file (2963-52): brightness is about a third of the middle at the very edge. */
      var f = ctx.createLinearGradient(0, 0, 0, H);
      [[0, .66], [.02, .58], [.05, .53], [.1, .44], [.2, .25], [.3, .11], [.4, .03], [.5, 0],
       [.6, .03], [.7, .11], [.8, .25], [.9, .44], [.95, .53], [.98, .58], [1, .66]].forEach(function (st) {
        f.addColorStop(st[0], "rgba(0,0,0," + st[1] + ")");
      });
      ctx.fillStyle = f; ctx.fillRect(0, 0, W, H);
    }

    if (s.caption) {
      var size = Math.round(H * 0.042), text = s.caption.toUpperCase(), gap = size * 0.22;
      ctx.font = "600 " + size + "px " + captionFont;
      ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
      ctx.shadowColor = "rgba(0,0,0,.55)"; ctx.shadowBlur = size * 0.6;
      ctx.fillStyle = "rgba(255,255,255,.94)";
      /* Letter spacing is laid out by hand so every browser and the server space the caption identically. */
      var chars = Array.from(text), widths = [], total = 0, c;
      for (c = 0; c < chars.length; c++) { widths[c] = ctx.measureText(chars[c]).width; total += widths[c]; }
      total += gap * Math.max(0, chars.length - 1);
      var x = (W - total) / 2, y = H - size * 1.5;
      for (c = 0; c < chars.length; c++) { ctx.fillText(chars[c], x, y); x += widths[c] + gap; }
      ctx.shadowBlur = 0; ctx.shadowColor = "transparent";
    }

    if (opts.watermark) {
      ctx.save();
      ctx.translate(W / 2, H / 2); ctx.rotate(-Math.PI / 9);
      ctx.font = "700 " + Math.round(H * 0.09) + "px " + (opts.watermarkFont || "'Bricolage Grotesque', sans-serif");
      ctx.textAlign = "center"; ctx.fillStyle = "rgba(255,255,255,.22)";
      for (var wy = -2; wy <= 2; wy++) for (var wx = -2; wx <= 2; wx++) ctx.fillText("FROME PREVIEW", wx * W * 0.42, wy * H * 0.34);
      ctx.restore();
    }
    ctx.restore();
    return canvas;
  }

  return { render: render, cleanSettings: cleanSettings, cleanColors: cleanColors, bucket: bucket };
});
