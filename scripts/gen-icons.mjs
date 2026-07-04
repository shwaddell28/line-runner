// Generates the PWA icons (script-lines glyph on a dark tile) as PNGs,
// with no image-library dependency — raw pixels + zlib + hand-rolled chunks.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
mkdirSync(outDir, { recursive: true });

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function png(size, pixelAt) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    raw[row] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixelAt(x / size, y / size);
      raw.writeUInt32BE(((r << 24) | (g << 16) | (b << 8) | a) >>> 0, row + 1 + x * 4);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

const BG = [20, 20, 28, 255];
const OTHER_LINE = [232, 232, 240, 255];
const MY_LINE = [255, 209, 102, 255];

// Three rounded "script line" bars; the middle one (your line) is gold.
const BARS = [
  { y0: 0.26, y1: 0.36, x0: 0.18, x1: 0.82, color: OTHER_LINE },
  { y0: 0.45, y1: 0.55, x0: 0.18, x1: 0.7, color: MY_LINE },
  { y0: 0.64, y1: 0.74, x0: 0.18, x1: 0.82, color: OTHER_LINE }
];

function insideBar(bar, u, v) {
  const r = (bar.y1 - bar.y0) / 2;
  const cx0 = bar.x0 + r;
  const cx1 = bar.x1 - r;
  const cy = (bar.y0 + bar.y1) / 2;
  if (v < bar.y0 || v > bar.y1) return false;
  if (u >= cx0 && u <= cx1) return true;
  const dx = u < cx0 ? u - cx0 : u - cx1;
  return dx * dx + (v - cy) * (v - cy) <= r * r;
}

function pixelAt(u, v) {
  for (const bar of BARS) if (insideBar(bar, u, v)) return bar.color;
  return BG;
}

for (const [file, size] of [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180]
]) {
  writeFileSync(join(outDir, file), png(size, pixelAt));
  console.log(`wrote public/${file}`);
}
