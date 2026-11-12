// Tekent het logo van Singing Bowls Concert en schrijft icon.ico (16-256 px) en logo.png.
// Geen afhankelijkheden: eigen rasterizer met 4x4 supersampling en PNG-codering via zlib.

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

// Ontwerp in eenheden 0..1: donkere ronde tegel, gouden schaal op een rood kussen,
// erboven twee klankgolven.
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const inEll = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;

// Ontwerp in eenheden 0..1: donkere ronde tegel, drie gouden schalen op rode kussens
// (groot in het midden, twee kleinere opzij), erboven twee klankgolven.
const BOWLS = [
  { x: 0.25, y: 0.60, R: 0.14 },
  { x: 0.75, y: 0.60, R: 0.14 },
  { x: 0.50, y: 0.55, R: 0.21 },
];

function bowlColor(x, y, b) {
  const ry = b.R * 0.27, depth = b.R * 0.78;
  const inCushion = inEll(x, y, b.x, b.y + depth + b.R * 0.05, b.R * 0.8, b.R * 0.22);
  const inBody = y >= b.y && y <= b.y + depth && Math.abs(x - b.x) <= b.R * Math.sqrt(Math.max(0, 1 - ((y - b.y) / depth) ** 2));
  if (inBody || inEll(x, y, b.x, b.y, b.R, ry)) {
    const t = (x - (b.x - b.R)) / (2 * b.R);
    let c = t < 0.3 ? mix([0.36, 0.22, 0.1], [0.96, 0.8, 0.53], t / 0.3) : mix([0.96, 0.8, 0.53], [0.32, 0.19, 0.08], (t - 0.3) / 0.7);
    if (inEll(x, y, b.x, b.y, b.R * 0.9, ry * 0.8)) c = mix([0.3, 0.18, 0.08], [0.66, 0.45, 0.22], Math.abs(x - b.x) / (b.R * 0.9));
    return c;
  }
  if (inCushion) return mix([0.62, 0.16, 0.16], [0.35, 0.08, 0.08], (y - (b.y + depth - b.R * 0.17)) / (b.R * 0.44));
  return null;
}

function sample(x, y) {
  if (Math.hypot(x - 0.5, y - 0.5) > 0.49) return null;
  let c = mix([0.24, 0.17, 0.11], [0.08, 0.06, 0.04], Math.hypot(x - 0.5, y - 0.4) * 1.6);
  // Klankgolven boven de middelste schaal
  const d = Math.hypot(x - 0.5, (y - 0.5) * 1.15);
  for (const r of [0.27, 0.36]) {
    if (y < 0.42 && Math.abs(d - r) < 0.017) c = mix(c, [0.89, 0.71, 0.42], 0.85);
  }
  // Achterste schalen eerst, de grote middelste schaal eroverheen
  for (const b of BOWLS) { const bc = bowlColor(x, y, b); if (bc) c = bc; }
  return [...c, 1];
}

function render(size) {
  const ss = 4, px = Buffer.alloc(size * size * 4);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sj = 0; sj < ss; sj++) {
        for (let si = 0; si < ss; si++) {
          const s = sample((i + (si + 0.5) / ss) / size, (j + (sj + 0.5) / ss) / size);
          if (!s) continue;
          r += s[0] * s[3]; g += s[1] * s[3]; b += s[2] * s[3]; a += s[3];
        }
      }
      const o = (j * size + i) * 4, n = ss * ss;
      px[o] = a ? Math.round((r / a) * 255) : 0;
      px[o + 1] = a ? Math.round((g / a) * 255) : 0;
      px[o + 2] = a ? Math.round((b / a) * 255) : 0;
      px[o + 3] = Math.round((a / n) * 255);
    }
  }
  return px;
}

function png(size, rgba) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8 bit, RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ICO-bestand met ingebedde PNG's (ondersteund sinds Windows Vista)
function ico(images) {
  const head = Buffer.alloc(6 + images.length * 16);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(images.length, 4);
  let offset = head.length;
  images.forEach(({ size, data }, i) => {
    const e = 6 + i * 16;
    head[e] = size >= 256 ? 0 : size; head[e + 1] = size >= 256 ? 0 : size;
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(data.length, e + 8); head.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([head, ...images.map(x => x.data)]);
}

const images = [256, 64, 48, 32, 24, 16].map(size => ({ size, data: png(size, render(size)) }));
fs.writeFileSync(path.join(__dirname, 'icon.ico'), ico(images));
fs.writeFileSync(path.join(__dirname, 'logo.png'), images[0].data);
console.log('icon.ico en logo.png gemaakt');
