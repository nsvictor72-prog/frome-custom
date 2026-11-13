import { env } from "./common.mjs";

/* Starts the background render. In local tests (FROME_INLINE_RENDER=1) it runs the render in-process instead. */
export async function triggerRender(id, origin) {
  if (process.env.FROME_INLINE_RENDER === "1") {
    const { runRender } = await import("../netlify/functions/render-background.mjs");
    await runRender(id);
    return;
  }
  const res = await fetch(new URL("/api/render", origin), {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Frome-Key": env("FROME_INTERNAL_KEY") },
    body: JSON.stringify({ id })
  });
  if (res.status >= 300) throw new Error("render trigger returned " + res.status);
}
