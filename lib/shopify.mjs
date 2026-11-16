/* Marks the digital line of a paid order as fulfilled in Shopify once its file is ready, so digital orders do not
   sit in the store's Unfulfilled list. Optional: with no Shopify app credentials set, it does nothing.
   The customer is never notified by this step (no "your order has shipped" email for a download). */
import { env, listEnv } from "./common.mjs";

const API_VERSION = "2026-10";
const log = (what, extra = {}) => console.log("fulfil: " + what + " " + JSON.stringify(extra));

/* A plain shop domain like example.myshopify.com, whatever was pasted (https://, trailing slash, capitals). */
export function shopDomain() {
  const s = env("SHOPIFY_SHOP", false).toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(s) ? s : "";
}
export const shopifyConfigured = () => !!(shopDomain() && env("SHOPIFY_CLIENT_ID", false) && env("SHOPIFY_CLIENT_SECRET", false));

/* A short-lived Admin API token from the app's client id and secret (client credentials grant). */
async function adminToken() {
  const res = await fetch("https://" + shopDomain() + "/admin/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: env("SHOPIFY_CLIENT_ID"), client_secret: env("SHOPIFY_CLIENT_SECRET") }).toString()
  });
  if (!res.ok) throw new Error("token request returned " + res.status);
  const body = await res.json();
  if (!body || !body.access_token) throw new Error("token request returned no token");
  return body.access_token;
}
async function gql(token, query, variables) {
  const res = await fetch("https://" + shopDomain() + "/admin/api/" + API_VERSION + "/graphql.json", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ query, variables })
  });
  if (!res.ok) throw new Error("Shopify returned " + res.status);
  const body = await res.json();
  if (body.errors && body.errors.length) throw new Error("Shopify error: " + String(body.errors[0].message).slice(0, 200));
  return body.data;
}

const ORDER_QUERY = `query($id: ID!) { order(id: $id) { fulfillmentOrders(first: 20) { nodes { id status supportedActions { action }
  lineItems(first: 50) { nodes { id remainingQuantity lineItem { variant { id } customAttributes { key value } } } } } } } }`;
const FULFIL = `mutation($fulfillment: FulfillmentInput!) { fulfillmentCreate(fulfillment: $fulfillment) { fulfillment { id } userErrors { message } } }`;

/* Fulfils only the order line that carries this design, and only what is still unfulfilled on it.
   Returns "fulfilled", "nothing_to_fulfil" or "not_configured". Throws if Shopify refuses. */
export async function fulfilDesignLine(orderId, designId) {
  if (!shopifyConfigured()) return "not_configured";
  if (!/^[0-9]+$/.test(String(orderId))) throw new Error("no order id on this design");
  const token = await adminToken();
  const data = await gql(token, ORDER_QUERY, { id: "gid://shopify/Order/" + orderId });
  /* Only the digital-file product: a framed canvas made from the same design is a physical item and stays open. */
  const digitalIds = listEnv("SHOPIFY_DIGITAL_VARIANT_IDS");
  const isDigital = (l) => { const v = l.lineItem && l.lineItem.variant && l.lineItem.variant.id; return !!v && digitalIds.includes(String(v).split("/").pop()); };
  const groups = [];
  for (const fo of (data.order && data.order.fulfillmentOrders.nodes) || []) {
    if (!fo.supportedActions.some((a) => a.action === "CREATE_FULFILLMENT")) continue;
    const lines = fo.lineItems.nodes.filter((l) => l.remainingQuantity > 0 && isDigital(l) &&
      (l.lineItem.customAttributes || []).some((a) => a.key === "_design_id" && a.value === designId));
    if (lines.length) groups.push({ fulfillmentOrderId: fo.id, fulfillmentOrderLineItems: lines.map((l) => ({ id: l.id, quantity: l.remainingQuantity })) });
  }
  if (!groups.length) return "nothing_to_fulfil";
  /* One fulfillment per fulfillment order: Shopify requires each to cover a single location. */
  for (const g of groups) {
    const out = await gql(token, FULFIL, { fulfillment: { notifyCustomer: false, lineItemsByFulfillmentOrder: [g] } });
    const errs = out.fulfillmentCreate.userErrors || [];
    if (errs.length) throw new Error("Shopify refused: " + String(errs[0].message).slice(0, 200));
  }
  return "fulfilled";
}

/* Called after a digital file is ready. Never throws: a Shopify problem must not undo a finished file.
   Records the outcome on the design so it is tried again on a later notice if it failed. */
export async function fulfilIfNeeded(design, designId) {
  if (!design || design.fulfilledAt || !design.file || !shopifyConfigured()) return false;
  try {
    const result = await fulfilDesignLine(design.orderId, designId);
    design.fulfilledAt = new Date().toISOString(); delete design.fulfilError;
    log(result, { order: design.orderName });
    return true;
  } catch (e) {
    design.fulfilError = String((e && e.message) || e).slice(0, 200);
    log("FAILED", { order: design.orderName, error: design.fulfilError });
    return true;   // the design changed (error recorded), so it still needs saving
  }
}
