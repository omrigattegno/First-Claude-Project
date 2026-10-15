#!/usr/bin/env node
/**
 * Icon generator: one geometry definition -> every icon the PWA ships.
 *
 *   public/icon.svg, public/favicon.svg        vector (identical art)
 *   public/icons/icon-192.png                   manifest, purpose "any": rounded square, transparent corners
 *   public/icons/icon-512.png                   manifest, purpose "any"
 *   public/icons/icon-512-maskable.png          manifest, purpose "maskable": art at 60% (20% safe padding), solid
 *   public/apple-touch-icon.png                 180x180, solid, no alpha (iOS rounds it itself)
 *
 * Re-run with `npm run icons`. Zero dependencies: the ImageMagick on the build box has no SVG delegate
 * (rsvg), so the PNGs are rasterised here (signed-distance coverage + 4x4 supersampling) and encoded with
 * node:zlib. Node >= 18.
 *
 * Motif: a bold yellow eye (the table watching for the bluffer) with a red pupil: the odd one out,
 * echoing the red dot in the in-app wordmark. Reads at 48px: lens 36px wide, pupil 8px.
 */
import { mkdirSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync, crc32 as zlibCrc32 } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');

const BG = '#0b0d12';
const YELLOW = '#ffd166';
const RED = '#ef476f';
const WHITE = '#ffffff';

// ---------------------------------------------------------------------------
// Geometry. Unit space: the icon spans -1..1 on both axes, y down, (0,0) is the centre.
// ---------------------------------------------------------------------------

/** Corner radius of the rounded-square variants (0.44 of the half-width = 22% of the width, iOS-like). */
const CORNER = 0.44;
/** Eye lens = intersection of two equal circles ("vesica"): half-width, half-height. */
const LENS_W = 0.76;
const LENS_H = 0.42;
const LENS_R = (LENS_W ** 2 + LENS_H ** 2) / (2 * LENS_H); // circle radius
const LENS_D = LENS_R - LENS_H; // circle centre offset from the axis

/** Art shapes, drawn bottom to top. These get scaled for the maskable variant; the background does not. */
const ART = [
  { kind: 'lens', fill: YELLOW },
  { kind: 'circle', cx: 0, cy: 0, r: 0.3, fill: BG }, // iris: a dark hole
  { kind: 'circle', cx: 0, cy: 0, r: 0.17, fill: RED }, // pupil: the odd one out
  { kind: 'circle', cx: -0.065, cy: -0.065, r: 0.055, fill: WHITE, alpha: 0.9 }, // glint
];

const VARIANTS = [
  { file: 'icons/icon-192.png', size: 192, rounded: true, alpha: true, art: 1 },
  { file: 'icons/icon-512.png', size: 512, rounded: true, alpha: true, art: 1 },
  // Maskable safe zone is the inner 80% circle; 20% padding per side keeps the art well inside it.
  { file: 'icons/icon-512-maskable.png', size: 512, rounded: false, alpha: false, art: 0.8 },
  { file: 'apple-touch-icon.png', size: 180, rounded: false, alpha: false, art: 1 },
];

// ---------------------------------------------------------------------------
// Signed distance functions (negative inside)
// ---------------------------------------------------------------------------

function sdCircle(x, y, cx, cy, r) {
  return Math.hypot(x - cx, y - cy) - r;
}

function sdRoundedSquare(x, y, half, r) {
  const qx = Math.abs(x) - half + r;
  const qy = Math.abs(y) - half + r;
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  return outside + Math.min(Math.max(qx, qy), 0) - r;
}

function sdShape(shape, x, y) {
  switch (shape.kind) {
    case 'lens':
      return Math.max(sdCircle(x, y, 0, LENS_D, LENS_R), sdCircle(x, y, 0, -LENS_D, LENS_R));
    case 'circle':
      return sdCircle(x, y, shape.cx, shape.cy, shape.r);
    default:
      throw new Error(`unknown shape ${shape.kind}`);
  }
}

// ---------------------------------------------------------------------------
// Rasteriser
// ---------------------------------------------------------------------------

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
}

/** Renders one variant to straight-alpha 8-bit RGBA (or RGB when `alpha` is false). */
function render({ size, rounded, alpha, art }) {
  const SS = 4; // supersamples per axis
  const subPx = 2 / (size * SS); // sub-pixel width in unit space
  const coverage = (sd) => Math.min(1, Math.max(0, 0.5 - sd / subPx));
  const bg = hexToRgb(BG);
  const shapes = ART.map((s) => ({ ...s, rgb: hexToRgb(s.fill), a: s.alpha ?? 1 }));
  const channels = alpha ? 4 : 3;
  const out = new Uint8Array(size * size * channels);

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      // Premultiplied accumulators over the SS*SS samples.
      let R = 0;
      let G = 0;
      let B = 0;
      let A = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = ((px + (sx + 0.5) / SS) / size) * 2 - 1;
          const y = ((py + (sy + 0.5) / SS) / size) * 2 - 1;
          // Background
          let r;
          let g;
          let b;
          let a;
          if (rounded) {
            const c = coverage(sdRoundedSquare(x, y, 1, CORNER));
            r = bg[0] * c;
            g = bg[1] * c;
            b = bg[2] * c;
            a = c;
          } else {
            [r, g, b] = bg;
            a = 1;
          }
          // Art (scaled about the centre)
          for (const s of shapes) {
            const c = coverage(sdShape(s, x / art, y / art) * art) * s.a;
            if (c <= 0) continue;
            r = s.rgb[0] * c + r * (1 - c);
            g = s.rgb[1] * c + g * (1 - c);
            b = s.rgb[2] * c + b * (1 - c);
            a = c + a * (1 - c);
          }
          R += r;
          G += g;
          B += b;
          A += a;
        }
      }
      const n = SS * SS;
      const a = A / n;
      const o = (py * size + px) * channels;
      // Un-premultiply for straight-alpha PNG output.
      const un = a > 0 ? 1 / a : 0;
      out[o] = Math.round(Math.min(1, (R / n) * un) * 255);
      out[o + 1] = Math.round(Math.min(1, (G / n) * un) * 255);
      out[o + 2] = Math.round(Math.min(1, (B / n) * un) * 255);
      if (alpha) out[o + 3] = Math.round(a * 255);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// PNG encoder (IHDR + one IDAT + IEND, filter 0 on every row)
// ---------------------------------------------------------------------------

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  if (typeof zlibCrc32 === 'function') return zlibCrc32(buf) >>> 0;
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([len, typeAndData, crc]);
}

function encodePng(size, pixels, alpha) {
  const channels = alpha ? 4 : 3;
  const stride = size * channels;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    raw.set(pixels.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = alpha ? 6 : 2; // colour type: RGBA / RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// SVG (same geometry, 64-unit viewBox)
// ---------------------------------------------------------------------------

function svgIcon() {
  const k = 32; // unit -> px
  const f = (v) => +(k + v * k).toFixed(2); // position
  const s = (v) => +(v * k).toFixed(2); // length
  const lens = [
    `M ${f(-LENS_W)} ${f(0)}`,
    `A ${s(LENS_R)} ${s(LENS_R)} 0 0 1 ${f(LENS_W)} ${f(0)}`,
    `A ${s(LENS_R)} ${s(LENS_R)} 0 0 1 ${f(-LENS_W)} ${f(0)}`,
    'Z',
  ].join(' ');
  const circles = ART.filter((a) => a.kind === 'circle')
    .map(
      (c) =>
        `  <circle cx="${f(c.cx)}" cy="${f(c.cy)}" r="${s(c.r)}" fill="${c.fill}"${
          c.alpha != null ? ` opacity="${c.alpha}"` : ''
        }/>`,
    )
    .join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <!-- Generated by scripts/make-icons.mjs; edit the geometry there, not here. -->
  <rect width="64" height="64" rx="${s(CORNER)}" fill="${BG}"/>
  <path d="${lens}" fill="${YELLOW}"/>
${circles}
</svg>
`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function write(rel, data) {
  const path = join(PUBLIC, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data);
  const bytes = statSync(path).size;
  console.log(`${rel.padEnd(32)} ${String(bytes).padStart(7)} B`);
}

const svg = svgIcon();
write('icon.svg', svg);
write('favicon.svg', svg);
for (const v of VARIANTS) {
  write(v.file, encodePng(v.size, render(v), v.alpha));
}
