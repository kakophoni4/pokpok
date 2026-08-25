/**
 * Renders the PWA / iOS home-screen icons.
 *
 * Done in code rather than committed binaries so the icon set can be
 * regenerated after a palette change, and so nobody has to hunt for the
 * "original" file. Pure Node: a small PNG encoder over the built-in zlib.
 *
 * Run with: node scripts/generate-icons.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const OUT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public/icons");

const BACKGROUND = [0x0b, 0x12, 0x10];
const FELT = [0x16, 0x24, 0x1f];
const GOLD = [0xd4, 0xa9, 0x4e];

// ─── PNG encoding ─────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(width, height, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: truecolour with alpha
  // 10..12 stay zero: deflate, adaptive filtering, no interlace.

  // Each scanline is prefixed with its filter type; 0 means "store as is".
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0;
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ─── Shapes ───────────────────────────────────────────────────────────────────

/** A spade, built the classical way: an upside-down heart plus a stem. */
function insideSpade(x, y) {
  const lobeRadius = 0.163;
  const lobeY = 0.545;

  const inLobe =
    distance(x, y, 0.5 - lobeRadius * 1.02, lobeY) <= lobeRadius ||
    distance(x, y, 0.5 + lobeRadius * 1.02, lobeY) <= lobeRadius;
  if (inLobe) return true;

  const inBlade = insideTriangle(x, y, 0.5, 0.175, 0.175, lobeY, 0.825, lobeY);
  if (inBlade) return true;

  // Stem: narrow at the blade, flaring towards the base.
  if (y >= lobeY - 0.01 && y <= 0.855) {
    const t = (y - (lobeY - 0.01)) / (0.855 - (lobeY - 0.01));
    const halfWidth = 0.028 + t * t * 0.115;
    if (Math.abs(x - 0.5) <= halfWidth) return true;
  }

  return false;
}

function distance(x, y, cx, cy) {
  return Math.hypot(x - cx, y - cy);
}

function insideTriangle(px, py, ax, ay, bx, by, cx, cy) {
  const sign = (x1, y1, x2, y2, x3, y3) => (x1 - x3) * (y2 - y3) - (x2 - x3) * (y1 - y3);
  const d1 = sign(px, py, ax, ay, bx, by);
  const d2 = sign(px, py, bx, by, cx, cy);
  const d3 = sign(px, py, cx, cy, ax, ay);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

function insideRoundedRect(x, y, inset, radius) {
  const min = inset;
  const max = 1 - inset;
  if (x < min || x > max || y < min || y > max) return false;

  const dx = Math.max(min + radius - x, 0, x - (max - radius));
  const dy = Math.max(min + radius - y, 0, y - (max - radius));
  return Math.hypot(dx, dy) <= radius;
}

// ─── Rendering ────────────────────────────────────────────────────────────────

/**
 * @param size pixel size of the square icon
 * @param maskable when true the artwork shrinks into the safe zone Android
 *        crops to, so the spade never loses its tip to a circular mask
 */
function render(size, maskable) {
  const rgba = Buffer.alloc(size * size * 4);
  const samples = 4; // 4x4 supersampling, enough for smooth curves at 192px
  const scale = maskable ? 0.62 : 0.82;
  const plateInset = maskable ? 0.0 : 0.0;

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let plateCoverage = 0;
      let spadeCoverage = 0;

      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const x = (px + (sx + 0.5) / samples) / size;
          const y = (py + (sy + 0.5) / samples) / size;

          if (insideRoundedRect(x, y, plateInset, 0.22)) plateCoverage += 1;

          // Map the pixel into the spade's own centred, scaled space.
          const localX = (x - 0.5) / scale + 0.5;
          const localY = (y - 0.5) / scale + 0.5;
          if (localX >= 0 && localX <= 1 && localY >= 0 && localY <= 1) {
            if (insideSpade(localX, localY)) spadeCoverage += 1;
          }
        }
      }

      const total = samples * samples;
      const plate = plateCoverage / total;
      const spade = spadeCoverage / total;

      const base = mix(BACKGROUND, FELT, plate * 0.55);
      const colour = mix(base, GOLD, spade);
      const alpha = Math.round(255 * Math.max(plate, spade));

      const offset = (py * size + px) * 4;
      rgba[offset] = colour[0];
      rgba[offset + 1] = colour[1];
      rgba[offset + 2] = colour[2];
      rgba[offset + 3] = maskable ? 255 : alpha;
    }
  }

  return encodePng(size, size, rgba);
}

function mix(a, b, t) {
  const clamped = Math.min(Math.max(t, 0), 1);
  return [
    Math.round(a[0] + (b[0] - a[0]) * clamped),
    Math.round(a[1] + (b[1] - a[1]) * clamped),
    Math.round(a[2] + (b[2] - a[2]) * clamped),
  ];
}

mkdirSync(OUT_DIR, { recursive: true });

const targets = [
  { file: "icon-192.png", size: 192, maskable: false },
  { file: "icon-512.png", size: 512, maskable: false },
  { file: "icon-512-maskable.png", size: 512, maskable: true },
];

for (const target of targets) {
  const png = render(target.size, target.maskable);
  writeFileSync(path.join(OUT_DIR, target.file), png);
  console.log(`${target.file.padEnd(24)} ${(png.length / 1024).toFixed(1)} KB`);
}

console.log(`\nIcons written to ${OUT_DIR}`);
