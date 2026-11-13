/* Runs daily. Deletes designs that were saved but never paid for, with their photos, after a week. */
import { openStore } from "../../lib/store.mjs";
import { keys, UNPAID_TTL_DAYS } from "../../lib/common.mjs";

export const config = { schedule: "@daily" };

export async function runCleanup(now = Date.now()) {
  const store = await openStore(), cutoff = now - UNPAID_TTL_DAYS * 86400000;
  let removed = 0;
  for (const key of await store.list("design/")) {
    const d = await store.getJSON(key);
    if (!d || d.paid || Date.parse(d.createdAt) > cutoff) continue;
    await store.remove(keys.photo(d.id)); await store.remove(key); removed++;
  }
  return removed;
}
export default async () => { await runCleanup(); return new Response("ok"); };
