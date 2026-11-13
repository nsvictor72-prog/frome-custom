/* Storefront side of the purchase, to be merged into the generator page once it lives on frome.co.
   NOT YET TESTED against the live store. It needs the two values below filled in.

   Flow: save the design to the Frome server, then add the digital product to the Shopify cart with the
   design id and token as hidden line item properties (a leading underscore keeps them out of the cart display). */
var FROME_API = "https://YOUR-NETLIFY-SITE.netlify.app";   // the Netlify site address
var DIGITAL_VARIANT_ID = 0;                                 // variant id of the $29.99 digital product

/* Shrinks the customer's photo before sending: long side at most 3000 px, JPEG. Returns a data URL or null. */
function fromePhotoDataUrl(photo) {
  if (!photo) return null;
  var iw = photo.naturalWidth || photo.width, ih = photo.naturalHeight || photo.height;
  var k = Math.min(1, 3000 / Math.max(iw, ih)), c = document.createElement("canvas");
  c.width = Math.round(iw * k); c.height = Math.round(ih * k);
  c.getContext("2d").drawImage(photo, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.9);
}

/* colors: the array the generator produced; settings: the same settings object passed to FromeDraw.render;
   photo: the customer's image element, or null. Resolves when the item is in the cart. */
async function fromeBuyDigital(colors, settings, photo) {
  var res = await fetch(FROME_API + "/api/design", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ colors: colors, settings: settings, photo: fromePhotoDataUrl(photo) })
  });
  if (!res.ok) {
    var err = await res.json().catch(function () { return {}; });
    throw new Error(err.message || "We could not save your design. Please try again.");
  }
  var design = await res.json();
  var add = await fetch("/cart/add.js", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items: [{ id: DIGITAL_VARIANT_ID, quantity: 1, properties: { _design_id: design.id, _design_token: design.token } }] })
  });
  if (!add.ok) throw new Error("We could not add your Frome to the cart. Please try again.");
  window.location.href = "/cart";
}
