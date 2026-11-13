# Builds the Shopify section from the prototype page: the generator runs in a same-origin iframe so the
# theme's styles and the generator's styles cannot interfere with each other.
import json, re
import os
HERE = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(HERE, 'src', 'generator.html')).read()

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
         '.btn.primary:hover { filter: brightness(1.06); }\n  .btn.buy { width: 100%; padding: 13px 14px; font-size: 16px; }\n  .fine { color: var(--muted); font-size: 12px; margin: 0; }')
# finish card: buy button first, preview save second
h = sub1(h, '''        <div class="row">
          <button class="btn" type="button" id="save" hidden>Save preview image</button>
        </div>
        <p class="hint" id="saveStatus" role="status">The saved preview carries a watermark. The print file would be made at full size when the order is placed.</p>''',
'''        <button class="btn primary buy" type="button" id="buy" disabled>Buy the digital file · __VF_PRICE__</button>
        <p class="status" id="buyStatus" role="status">Choose your own video to order.</p>
        <p class="fine">You get a 9000 × 3600 pixel file, as a JPG and a PNG, with no watermark. The download link arrives in your order confirmation email, usually within a minute of payment. Digital files are non-refundable once delivered; if yours is faulty we re-render it free.</p>
        <div class="row">
          <button class="btn" type="button" id="save">Save watermarked preview</button>
        </div>
        <p class="hint" id="saveStatus" role="status"></p>''')

# ---- script changes ----
h = sub1(h, 'var state = { colors: [], photo: null, photoIsSample: true, run: 0 };',
         'var state = { colors: [], photo: null, photoIsSample: true, videoIsSample: true, run: 0 };\n  var CFG = { api: "__VF_API__", variant: "__VF_VARIANT__", cartAdd: "__VF_CART_ADD__", cart: "__VF_CART__" };\n  var SAMPLE_CAPTION = "Maya & Daniel · June 14, 2025";')
# a customer's own video clears the sample photo and sample caption, so nobody orders someone else's names
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
    if (!buying) setStatus("buyStatus", state.videoIsSample ? "Choose your own video to order." : "");
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
    var k = Math.min(1, 3000 / Math.max(iw, ih)), c = makeCanvas(Math.round(iw * k), Math.round(ih * k));
    c.getContext("2d").drawImage(p, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.9);
  }
  $("buy").addEventListener("click", function () {
    if (buying || state.videoIsSample) return;
    buying = true; $("buy").disabled = true; setStatus("buyStatus", "Saving your design…");
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
        body: JSON.stringify({ items: [{ id: Number(CFG.variant), quantity: 1, properties: { _design_id: design.id, _design_token: design.token } }] })
      });
    }).then(function (add) {
      if (!add.ok) throw new Error("We could not add your Frome to the cart. Please try again.");
      setStatus("buyStatus", "Added. Taking you to your cart…");
      (window.top || window).location.href = CFG.cart;
    }).catch(function (err) {
      buying = false; buyUi();
      setStatus("buyStatus", (err && err.message) || "Something went wrong. Please try again.", true);
    });
  });

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
<div class="video-frome-embed" id="vf-{{ section.id }}"
  data-api="{{ section.settings.api_url | escape }}" data-variant="{{ vf_variant_id }}"
  data-cart-add="{{ routes.cart_add_url }}.js" data-cart="{{ routes.cart_url }}" data-price="{{ vf_price | strip_html | escape }}">
  <iframe title="Your Video Frome generator" loading="eager" style="display:block;width:100%;height:100vh;min-height:640px;border:0;background:#17151a"></iframe>
  <noscript><p style="padding:24px">This tool needs JavaScript turned on.</p></noscript>
</div>
<script type="application/json" id="vf-doc-{{ section.id }}">{% raw %}''' + doc_json + '''{% endraw %}</script>
<script>
(function () {
  var root = document.getElementById("vf-{{ section.id }}"), frame = root.querySelector("iframe");
  var html = JSON.parse(document.getElementById("vf-doc-{{ section.id }}").textContent);
  var d = root.dataset, origin = window.location.origin;
  var fill = { "__VF_API__": d.api.replace(/\\/+$/, ""), "__VF_VARIANT__": d.variant, "__VF_CART_ADD__": origin + d.cartAdd, "__VF_CART__": origin + d.cart, "__VF_PRICE__": d.price };
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
