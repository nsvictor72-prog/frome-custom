# Builds the Shopify section from the prototype page: the generator runs in a same-origin iframe so the
# theme's styles and the generator's styles cannot interfere with each other.
import json, re
import os
HERE = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(HERE, 'src', 'generator.html')).read()
# The page carries its own copy of the shared renderer. Refresh it from shared/draw.js on every build so the
# preview and the server's files are always drawn by the same code.
_shared = open(os.path.join(HERE, '..', 'shared', 'draw.js')).read()
_a = src.index('/* Frome video palette renderer.'); _b = src.index('</script>', _a)
src = src[:_a] + _shared + src[_b:]

def sub1(h, old, new):
    assert h.count(old) == 1, old[:70]
    return h.replace(old, new)

h = src
h = sub1(h, '<title>Frome Video Palette</title>', '<title>Your Video Frome</title>')
h = sub1(h, '    <span class="tag">Prototype</span>\n', '')
h = sub1(h, 'Your video and photo stay on this device. Nothing is uploaded.</p>',
         'Your video never leaves this device. If you order, we receive only the colors and, if you add one, your photo.</p>')
# page fills the iframe and scrolls inside it, so the preview can stay pinned while the controls scroll
h = sub1(h, '  html, body { margin: 0; }', '  html, body { margin: 0; height: 100%; }')
h = sub1(h, '  @media (max-width: 880px) { .stage { position: static; } }',
         '  @media (max-width: 880px) { .stage { top: 0; z-index: 5; background: var(--room); padding: 8px 0; margin: -8px 0; } .wall { padding: 12px; } .meta span:last-child { display: none; } }')
h = sub1(h, '.btn.primary:hover { filter: brightness(1.06); }',
         '.btn.primary:hover { filter: brightness(1.06); }\n  .btn.buy { width: 100%; padding: 13px 14px; font-size: 16px; }\n  .offer { display: flex; flex-direction: column; gap: 6px; }\n  .offer[hidden] { display: none; }\n  .fine { color: var(--muted); font-size: 12px; margin: 0; }')
# finish card: buy button first, preview save second
h = sub1(h, '''        <div class="row">
          <button class="btn" type="button" id="save" hidden>Save preview image</button>
        </div>
        <p class="hint" id="saveStatus" role="status">The saved preview carries a watermark. The print file would be made at full size when the order is placed.</p>''',
'''        <div class="offer" id="canvasOffer">
          <button class="btn primary buy" type="button" id="buyCanvas" disabled>Order the framed canvas · __VF_CANVAS_PRICE__</button>
          <p class="fine">30 × 12 inches, printed on canvas and framed, made to order. Ships within the United States only. Made from your own video and photo, so it can&rsquo;t be returned; our 1-Year Guarantee covers damage and defects.</p>
        </div>
        <div class="offer">
          <button class="btn buy" type="button" id="buy" disabled>Buy the digital file · __VF_PRICE__</button>
          <p class="fine">A 9000 × 3600 pixel file, as a JPG and a PNG, with no watermark. The download link arrives in your order confirmation email, usually within a minute of payment. Digital files are non-refundable once delivered; if yours is faulty we re-render it free.</p>
        </div>
        <p class="status" id="buyStatus" role="status">Choose your own video to order.</p>
        <div class="row">
          <button class="btn" type="button" id="save">Save watermarked preview</button>
        </div>
        <p class="hint" id="saveStatus" role="status"></p>''')

# digital-first wording: nothing on the page describes a physical canvas unless the framed canvas offer is showing
h = sub1(h, '<span>Canvas shape 5 : 2, as in 30×12 in and 40×16 in</span>', '<span>Digital file · 9000 × 3600 pixels</span>')
h = sub1(h, 'aria-label="Preview of your video palette canvas"', 'aria-label="Preview of your Video Frome"')
h = sub1(h, '"No photo. The canvas shows color only."', '"No photo. Your Frome shows color only."')

# ---- script changes ----
h = sub1(h, 'var state = { colors: [], photo: null, photoIsSample: true, run: 0 };',
         'var state = { colors: [], photo: null, photoIsSample: true, videoIsSample: true, run: 0 };\n  var CFG = { api: "__VF_API__", variant: "__VF_VARIANT__", canvasVariant: "__VF_CANVAS_VARIANT__", cartAdd: "__VF_CART_ADD__", cart: "__VF_CART__" };\n  var SAMPLE_CAPTION = "Maya & Daniel · June 14, 2025";')
# a customer's own video clears the sample photo and sample caption, so nobody orders someone else's names
h = sub1(h, '<p class="status" id="photoStatus" role="status">Showing a sample photo.</p>', '<p class="status" id="photoStatus" role="status">Showing a sample photo.</p>\n        <p class="status" id="photoWarn" role="status" hidden></p>')
h = sub1(h, '    if (queued) return; queued = true;', '    photoWarn();\n    if (queued) return; queued = true;')
h = sub1(h, '''      state.colors = colors;
      $("bar").style.width = "100%";''',
'''      state.colors = colors; state.videoIsSample = false;
      if (state.photoIsSample) { state.photo = null; setStatus("photoStatus", "No photo yet. Add one if you like."); photoUi(); }
      if ($("caption").value === SAMPLE_CAPTION) $("caption").value = "";
      buyUi();
      $("bar").style.width = "100%";''')
h = sub1(h, '''    state.run++; state.colors = samplePalette();''', '''    state.run++; state.colors = samplePalette(); state.videoIsSample = true; buyUi();''')
h = sub1(h, '''  function photoUi() {''', '''  function buyUi() {
    $("buy").disabled = state.videoIsSample || buying;
    $("buyCanvas").disabled = state.videoIsSample || buying;
    $("canvasOffer").hidden = !/^[0-9]+$/.test(CFG.canvasVariant);
    if (!buying) setStatus("buyStatus", state.videoIsSample ? "Choose your own video to order." : "");
  }
  /* A 30 x 12 in print: the photo's own pixels spread over 12 inches of height times the zoom. */
  function photoWarn() {
    var el = $("photoWarn"), p = state.photo;
    /* Only relevant while the framed canvas is on sale; the digital file needs no print warning. */
    if (!p || state.photoIsSample || !/^[0-9]+$/.test(CFG.canvasVariant)) { el.hidden = true; return; }
    var ih = p.naturalHeight || p.height, dpi = ih / (12 * (+$("zoom").value / 100));
    el.hidden = dpi >= 100;
    el.textContent = dpi >= 100 ? "" : "This photo is small for a 30 inch print and may look soft on the framed canvas. A larger photo, or less zoom, prints sharper.";
  }
  function photoUi() {''')
a = h.index('  /* ---------- save (only where the viewer'); b = h.index('  /* ---------- start in a working state ---------- */')
h = h[:a] + r'''  /* ---------- save a watermarked preview ---------- */
  $("save").addEventListener("click", function () {
    var c = makeCanvas(3000, 1200); draw(c, true);
    c.toBlob(function (blob) {
      if (!blob) { setStatus("saveStatus", "Could not make the image. Try again.", true); return; }
      var a = document.createElement("a"), url = URL.createObjectURL(blob);
      a.href = url; a.download = "frome-video-palette-preview.jpg"; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      setStatus("saveStatus", "Preview saved with a watermark.");
    }, "image/jpeg", 0.9);
  });

  /* ---------- buy the digital file ---------- */
  var buying = false;
  function photoDataUrl() {
    if (!state.photo || state.photoIsSample) return null;
    var p = state.photo, iw = p.naturalWidth || p.width, ih = p.naturalHeight || p.height;
    /* Send as much of the photo as fits under the upload limit: try large first, then step down. */
    var sides = [4500, 3600, 3000, 2400], out = null;
    for (var i = 0; i < sides.length; i++) {
      var k = Math.min(1, sides[i] / Math.max(iw, ih)), c = makeCanvas(Math.round(iw * k), Math.round(ih * k));
      c.getContext("2d").drawImage(p, 0, 0, c.width, c.height);
      out = c.toDataURL("image/jpeg", 0.88);
      if (out.length < 5000000) break;
    }
    return out;
  }
  function startBuy(variant) {
    if (buying || state.videoIsSample) return;
    buying = true; buyUi(); setStatus("buyStatus", "Saving your design…");
    fetch(CFG.api + "/api/design", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ colors: state.colors, settings: settings(), photo: photoDataUrl() })
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (body) {
        if (!res.ok || !body.id) throw new Error(body.message || "We could not save your design. Please try again.");
        return body;
      });
    }).then(function (design) {
      setStatus("buyStatus", "Adding to your cart…");
      return fetch(CFG.cartAdd, {
        method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ items: [{ id: Number(variant), quantity: 1, properties: { _design_id: design.id, _design_token: design.token } }] })
      });
    }).then(function (add) {
      if (!add.ok) throw new Error("We could not add your Frome to the cart. Please try again.");
      setStatus("buyStatus", "Added. Taking you to your cart…");
      (window.top || window).location.href = CFG.cart;
    }).catch(function (err) {
      buying = false; buyUi();
      setStatus("buyStatus", (err && err.message) || "Something went wrong. Please try again.", true);
    });
  }
  $("buy").addEventListener("click", function () { startBuy(CFG.variant); });
  $("buyCanvas").addEventListener("click", function () { startBuy(CFG.canvasVariant); });

''' + h[b:]
h = sub1(h, '  photoUi();\n  draw(view, false);', '  photoUi(); buyUi();\n  draw(view, false);')
assert 'claude.use' not in h


doc_json = json.dumps(h).replace('</', '<\\/')
section = '''{%- comment -%}
  Your Video Frome: turns a customer's own video into a Frome and sells the digital file.
  The generator runs inside a same-origin iframe so theme styles and generator styles stay separate.
  Server: see the frome-custom repository (Netlify). Built from the prototype by theme-build/build.py.
{%- endcomment -%}
{%- assign vf_product = all_products[section.settings.product_handle] -%}
{%- assign vf_variant = vf_product.selected_or_first_available_variant | default: vf_product.variants.first -%}
{%- if vf_variant -%}{%- assign vf_price = vf_variant.price | money -%}{%- assign vf_variant_id = vf_variant.id -%}
{%- else -%}{%- assign vf_price = section.settings.price_text -%}{%- assign vf_variant_id = section.settings.variant_id -%}{%- endif -%}
{%- comment -%} The framed canvas button shows only when its product exists and is active. {%- endcomment -%}
{%- assign vf_canvas = all_products[section.settings.canvas_product_handle] -%}
{%- assign vf_canvas_variant = vf_canvas.selected_or_first_available_variant | default: vf_canvas.variants.first -%}
{%- if vf_canvas_variant -%}{%- assign vf_canvas_price = vf_canvas_variant.price | money -%}{%- assign vf_canvas_id = vf_canvas_variant.id -%}
{%- else -%}{%- assign vf_canvas_price = '' -%}{%- assign vf_canvas_id = '' -%}{%- endif -%}
<div class="video-frome-embed" id="vf-{{ section.id }}"
  data-api="{{ section.settings.api_url | escape }}" data-variant="{{ vf_variant_id }}"
  data-cart-add="{{ routes.cart_add_url }}.js" data-cart="{{ routes.cart_url }}" data-price="{{ vf_price | strip_html | escape }}"
  data-canvas-variant="{{ vf_canvas_id }}" data-canvas-price="{{ vf_canvas_price | strip_html | escape }}">
  <iframe title="Your Video Frome generator" loading="eager" style="display:block;width:100%;height:100vh;min-height:640px;border:0;background:#17151a"></iframe>
  <noscript><p style="padding:24px">This tool needs JavaScript turned on.</p></noscript>
</div>
<script type="application/json" id="vf-doc-{{ section.id }}">{% raw %}''' + doc_json + '''{% endraw %}</script>
<script>
(function () {
  var root = document.getElementById("vf-{{ section.id }}"), frame = root.querySelector("iframe");
  var html = JSON.parse(document.getElementById("vf-doc-{{ section.id }}").textContent);
  var d = root.dataset, origin = window.location.origin;
  var fill = { "__VF_API__": d.api.replace(/\\/+$/, ""), "__VF_VARIANT__": d.variant, "__VF_CART_ADD__": origin + d.cartAdd, "__VF_CART__": origin + d.cart, "__VF_PRICE__": d.price, "__VF_CANVAS_VARIANT__": d.canvasVariant || "", "__VF_CANVAS_PRICE__": d.canvasPrice || "" };
  Object.keys(fill).forEach(function (k) { html = html.split(k).join(String(fill[k]).replace(/[<>"\\\\]/g, "")); });
  frame.srcdoc = html;
})();
</script>
{% schema %}
{
  "name": "Video Frome generator",
  "settings": [
    { "type": "text", "id": "api_url", "label": "Server address", "default": "https://fromecustom.netlify.app" },
    { "type": "text", "id": "product_handle", "label": "Digital product handle", "default": "your-video-frome-digital-file" },
    { "type": "text", "id": "canvas_product_handle", "label": "Framed canvas product handle", "default": "your-video-frome-framed-canvas" },
    { "type": "text", "id": "variant_id", "label": "Variant ID (used if the product cannot be read)" },
    { "type": "text", "id": "price_text", "label": "Price text (used if the product cannot be read)", "default": "$29.99" }
  ],
  "presets": [{ "name": "Video Frome generator" }]
}
{% endschema %}
'''
out = os.path.join(HERE, '..', 'public', 'theme'); os.makedirs(out, exist_ok=True)
open(os.path.join(out, 'video-frome.liquid'), 'w').write(section)
print(len(section), 'bytes section;', '{%' in h, '{{' in h)
