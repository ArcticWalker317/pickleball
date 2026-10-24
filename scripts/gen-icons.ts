// Generates the PWA icons (a pickleball on a court-green tile) with no image dependencies.
// Run: node scripts/gen-icons.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const OUT = 'public/icons';
const SIZES: Record<string, number> = {
  'icon-192.png': 192,
  'icon-512.png': 512,
  'apple-touch-icon.png': 180,
};

const BG = [15, 26, 20];
const BALL = [212, 240, 58];
const HOLE = [150, 175, 30];

function pixel(u: number, v: number): number[] {
  // u, v in [-1, 1]
  const r = Math.hypot(u, v);
  if (r > 0.62) return BG;
  const holes = [
    [0, 0],
    [0.3, 0.1],
    [-0.3, -0.1],
    [0.1, -0.32],
    [-0.1, 0.32],
    [0.35, -0.3],
    [-0.35, 0.3],
  ];
  for (const [hx, hy] of holes) if (Math.hypot(u - hx!, v - hy!) < 0.07) return HOLE;
  return BALL;
}

function png(size: number): Buffer {
  const SS = 3; // supersampling for smooth edges
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const acc = [0, 0, 0];
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++) {
          const u = ((x + (sx + 0.5) / SS) / size) * 2 - 1;
          const v = ((y + (sy + 0.5) / SS) / size) * 2 - 1;
          pixel(u, v).forEach((c, i) => (acc[i]! += c));
        }
      acc.forEach((c, i) => (raw[y * (size * 3 + 1) + 1 + x * 3 + i] = Math.round(c / SS / SS)));
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

mkdirSync(OUT, { recursive: true });
for (const [name, size] of Object.entries(SIZES)) writeFileSync(`${OUT}/${name}`, png(size));
console.log(`wrote ${Object.keys(SIZES).length} icons to ${OUT}`);
