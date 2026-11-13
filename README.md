# Frome video palette: digital file server

Renders and delivers the $29.99 digital file automatically after payment. The customer's video never reaches
this server. It receives only the column colors, the settings and the optional photo.

## Status

Tested locally (`npm test`, 18 checks): saving a design, payment unlock, print-size render, download, cleanup,
and the refusals (forged webhook, wrong token, unpaid design, wrong product).

Not yet tested: a real Netlify deploy, a real Shopify webhook, the email snippet, the storefront buy button.

## How it works

1. `POST /api/design` (save-design): the generator page saves the design and gets back an id and a token.
2. The page adds the digital product to the cart with `_design_id` and `_design_token` as line item properties.
3. `POST /api/shopify/order-paid` (order-paid): Shopify's order payment webhook. It checks Shopify's signature,
   marks the design paid, and starts the render. Only the digital product's variant unlocks a design.
4. `POST /api/render` (render-background): draws the 9000 x 3600 file with the same code as the preview
   (`shared/draw.js`) and stores a JPG and a PNG.
5. `GET /download?d=...&t=...` (download): the link in the confirmation email. Shows a "preparing" page until
   the file is ready, and restarts a render that failed or stalled.
6. cleanup runs daily and deletes designs that were never paid for after 7 days.

## Setup

### 1. Shopify
- Create the digital product at $29.99. Untick "This is a physical product" so no shipping applies.
  Note its variant id.
- Settings > Notifications > Webhooks > Create webhook: event "Order payment", format JSON,
  URL `https://YOUR-SITE.netlify.app/api/shopify/order-paid`. The signing secret shown on that page goes into
  `SHOPIFY_WEBHOOK_SECRET`. No custom app is needed.
- Paste `storefront/order-confirmation-snippet.liquid` into the Order confirmation notification.
- Order Desk: exclude the digital product's SKU so it is never routed to a print vendor.

### 2. Netlify
Deploy this folder as a new site through Git or the Netlify CLI (a build is required so dependencies install;
drag-and-drop will not work). Set these environment variables:

| Variable | Value |
|---|---|
| `FROME_DOWNLOAD_SECRET` | a long random string; changing it later breaks every link already sent |
| `FROME_INTERNAL_KEY` | a different long random string |
| `FROME_ALLOWED_ORIGINS` | `https://frome.co` (comma-separate more if needed) |
| `SHOPIFY_WEBHOOK_SECRET` | from the Shopify webhooks page |
| `SHOPIFY_DIGITAL_VARIANT_IDS` | the digital product's variant id |

### 3. Storefront
`storefront/buy-button.js` is the purchase code to merge into the generator page once it is hosted on frome.co.

## Limits to know
- Netlify allows 6 MB per request, so photos are shrunk in the browser and capped at 4 MB here.
- Downloads are streamed, with a 20 MB ceiling. The largest PNG seen in testing was 14.7 MB (a deliberately
  noisy photo). The JPG is re-encoded at lower quality if it would exceed 5.5 MB.
- Rendering peaked near 600 MB of memory locally; Netlify functions have 1 GB.
- Captions keep Latin letters, digits and common punctuation only, so the preview and the file always match.
- Paid files are kept indefinitely. Nothing deletes them yet.
