/* Storage behind a small interface: Netlify Blobs in production, a folder on disk for local tests
   (set FROME_LOCAL_STORE to a directory). */
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";

const toArrayBuffer = (buf) => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

async function blobStore() {
  const { getStore } = await import("@netlify/blobs");
  const s = getStore("frome-video-palette");
  /* Strong consistency so a download that follows a webhook by a second still sees the paid flag. */
  const read = async (key, type) => {
    try { return await s.get(key, { type, consistency: "strong" }); }
    catch (e) { return await s.get(key, { type }); }
  };
  return {
    getJSON: (k) => read(k, "json"),
    setJSON: (k, v) => s.setJSON(k, v),
    getBuffer: async (k) => { const a = await read(k, "arrayBuffer"); return a ? Buffer.from(a) : null; },
    getStream: (k) => read(k, "stream"),
    setBuffer: (k, buf) => s.set(k, toArrayBuffer(buf)),
    remove: (k) => s.delete(k),
    list: async (prefix) => (await s.list({ prefix })).blobs.map((b) => b.key)
  };
}

function fileStore(dir) {
  const p = (k) => path.join(dir, encodeURIComponent(k));
  const readOrNull = async (k) => { try { return await fs.readFile(p(k)); } catch (e) { if (e.code === "ENOENT") return null; throw e; } };
  return {
    getJSON: async (k) => { const b = await readOrNull(k); return b ? JSON.parse(b.toString("utf8")) : null; },
    setJSON: async (k, v) => { await fs.mkdir(dir, { recursive: true }); await fs.writeFile(p(k), JSON.stringify(v)); },
    getBuffer: readOrNull,
    getStream: async (k) => { try { await fs.access(p(k)); } catch (e) { return null; } return Readable.toWeb(createReadStream(p(k))); },
    setBuffer: async (k, buf) => { await fs.mkdir(dir, { recursive: true }); await fs.writeFile(p(k), buf); },
    remove: async (k) => { await fs.rm(p(k), { force: true }); },
    list: async (prefix) => { try { return (await fs.readdir(dir)).map(decodeURIComponent).filter((k) => k.startsWith(prefix)); } catch (e) { return []; } }
  };
}

export async function openStore() {
  return process.env.FROME_LOCAL_STORE ? fileStore(process.env.FROME_LOCAL_STORE) : blobStore();
}
