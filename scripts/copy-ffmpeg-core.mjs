// scripts/copy-ffmpeg-core.mjs
//
// Copies the single-threaded ffmpeg.wasm core (no SharedArrayBuffer / cross-
// origin-isolation headers required) from node_modules into /public/ffmpeg
// so lib/offline/watermark.ts can load it same-origin instead of depending
// on a third-party CDN for a feature that processes people's videos.
// Runs on `npm install` (see package.json postinstall); public/ffmpeg is
// gitignored since it's a build output, not source.

import { mkdirSync, copyFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const src = path.join(root, "node_modules/@ffmpeg/core/dist/umd");
const dest = path.join(root, "public/ffmpeg");

if (!existsSync(src)) {
  console.warn("[copy-ffmpeg-core] @ffmpeg/core not installed yet, skipping");
  process.exit(0);
}

mkdirSync(dest, { recursive: true });
for (const file of ["ffmpeg-core.js", "ffmpeg-core.wasm"]) {
  copyFileSync(path.join(src, file), path.join(dest, file));
}
console.log("[copy-ffmpeg-core] copied ffmpeg-core.js + .wasm to public/ffmpeg/");
