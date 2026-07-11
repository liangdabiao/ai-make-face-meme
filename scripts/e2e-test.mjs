// End-to-end test: post one reference image to /api/stop-motion and verify:
//   1. The route returns a streaming response with frame events
//   2. The frame-store writes files to public/generated/
//   3. The returned URLs are publicly accessible
//
// Usage: node scripts/e2e-test.mjs [imagePath]

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { deflateSync, crc32 } from "node:zlib";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

function loadEnv() {
  const text = readFileSync(join(ROOT, ".env"), "utf8");
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadEnv();

const HOST = process.env.TEST_HOST || "http://localhost:3000";
const GENERATED = join(ROOT, "public", "generated");

function buildSolidPng(width, height, [r, g, b]) {
  // PNG: 8-byte signature, IHDR, IDAT, IEND, each prefixed with length+type+chunk-data+crc
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, "ascii");
    const crc = Buffer.alloc(4);
    // CRC32 over type+data; use the zlib helper if available, else fall back
    const crcValue = crc32(Buffer.concat([typeBuf, data]));
    crc.writeUInt32BE(crcValue >>> 0, 0);
    return Buffer.concat([len, typeBuf, data, crc]);
  }

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 2;   // color type = RGB
  ihdr[10] = 0;  // compression
  ihdr[11] = 0;  // filter
  ihdr[12] = 0;  // interlace

  // IDAT: each row prefixed with 0x00 (no filter)
  const rowLen = width * 3;
  const raw = Buffer.alloc(height * (rowLen + 1));
  for (let y = 0; y < height; y++) {
    const off = y * (rowLen + 1);
    raw[off] = 0;
    for (let x = 0; x < width; x++) {
      const p = off + 1 + x * 3;
      raw[p] = r; raw[p + 1] = g; raw[p + 2] = b;
    }
  }
  const idat = deflateSync(raw);

  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

const argImage = process.argv[2];
let imagePath, mime;
if (argImage) {
  imagePath = resolve(argImage);
  const buf = readFileSync(imagePath);
  mime = buf.slice(0, 4).toString("hex") === "89504e47" ? "image/png" : "image/jpeg";
} else {
  // Generate a 512x512 solid-color PNG using only Node built-ins.
  imagePath = join(__dirname, "_test.png");
  // Use a different color each run for variety.
  const colors = [
    [200, 100, 80],
    [80, 140, 200],
    [100, 180, 100],
  ];
  const colorIdx = (Date.now() / 1000 | 0) % colors.length;
  writeFileSync(imagePath, buildSolidPng(512, 512, colors[colorIdx]));
  mime = "image/png";
}
const buf = readFileSync(imagePath);
console.log(`→ image: ${imagePath}`);
console.log(`  size:  ${buf.length} bytes`);
console.log(`  mime:  ${mime}`);

console.log(`\n→ POST ${HOST}/api/stop-motion`);
const start = Date.now();
const form = new FormData();
form.append("image", new Blob([new Uint8Array(buf)], { type: mime }), "reference.png");

const resp = await fetch(`${HOST}/api/stop-motion`, { method: "POST", body: form });
if (!resp.ok) {
  console.error(`  status ${resp.status}`);
  console.error(`  body: ${(await resp.text()).slice(0, 300)}`);
  process.exit(1);
}

const reader = resp.body.getReader();
const decoder = new TextDecoder();
const SEP = "\n---CHUNK_END---\n";
let buffer = "";
const events = [];

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  const parts = buffer.split(SEP);
  buffer = parts.pop() ?? "";
  for (const part of parts) {
    const line = part.trim();
    if (!line) continue;
    try {
      const ev = JSON.parse(line);
      events.push(ev);
      if (ev.type === "frame") {
        console.log(`  ✓ frame ${ev.data.frameIndex}: ${ev.data.url}`);
      } else if (ev.type === "frame_error") {
        console.log(`  ✗ frame ${ev.data.frameIndex} failed: ${ev.data.error.slice(0, 200)}`);
      } else if (ev.type === "progress") {
        console.log(`  · ${ev.data}`);
      } else if (ev.type === "poses") {
        console.log(`  · poses generated (${JSON.parse(ev.data).poses.length} total)`);
      } else if (ev.type === "complete") {
        console.log(`  · complete`);
      } else if (ev.type === "error") {
        console.log(`  ✗ error: ${ev.data}`);
      }
    } catch {
      console.log(`  (raw) ${line.slice(0, 200)}`);
    }
  }
}

const elapsed = ((Date.now() - start) / 1000).toFixed(1);
const ok = events.filter((e) => e.type === "frame");
const errs = events.filter((e) => e.type === "frame_error");
console.log(`\n=== summary ===`);
console.log(`  elapsed:    ${elapsed}s`);
console.log(`  ok frames:  ${ok.length}`);
console.log(`  err frames: ${errs.length}`);

if (ok.length === 0) {
  console.log(`\n  no successful frames; skipping file/URL checks.`);
  process.exit(1);
}

console.log(`\n→ checking public/generated/`);
if (!existsSync(GENERATED)) {
  console.error(`  ✗ ${GENERATED} does not exist`);
  process.exit(1);
}
const files = readdirSync(GENERATED);
const recent = files
  .map((name) => ({ name, mtime: statSync(join(GENERATED, name)).mtimeMs }))
  .filter((f) => Date.now() - f.mtime < 5 * 60 * 1000)
  .sort((a, b) => b.mtime - a.mtime);
console.log(`  total files: ${files.length}`);
console.log(`  recent (<5min): ${recent.length}`);
recent.slice(0, 5).forEach((f) => console.log(`    ${f.name}`));

console.log(`\n→ verifying frame URLs are accessible`);
let allOk = true;
for (const ev of ok.slice(0, 3)) {
  const url = `${HOST}${ev.data.url}`;
  const r = await fetch(url);
  const ok2 = r.ok;
  const len = r.headers.get("content-length");
  console.log(`  ${ok2 ? "✓" : "✗"} ${url}  status=${r.status}  length=${len}`);
  if (!ok2) allOk = false;
}

process.exit(allOk ? 0 : 1);
