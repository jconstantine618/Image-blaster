import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { deflateSync } from "node:zlib";

const root = path.resolve(import.meta.dirname, "..");
const records = [];

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function hash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function splat(x, y, z, sx, sy, sz, r, g, b, a = 235) {
  const buf = Buffer.alloc(32);
  buf.writeFloatLE(x, 0);
  buf.writeFloatLE(y, 4);
  buf.writeFloatLE(z, 8);
  buf.writeFloatLE(Math.max(0.004, sx), 12);
  buf.writeFloatLE(Math.max(0.004, sy), 16);
  buf.writeFloatLE(Math.max(0.004, sz), 20);
  buf.writeUInt8(clampByte(r), 24);
  buf.writeUInt8(clampByte(g), 25);
  buf.writeUInt8(clampByte(b), 26);
  buf.writeUInt8(clampByte(a), 27);
  // Identity quaternion, antimatter layout: rot_0..3 = w, x, y, z.
  buf.writeUInt8(255, 28);
  buf.writeUInt8(128, 29);
  buf.writeUInt8(128, 30);
  buf.writeUInt8(128, 31);
  records.push(buf);
}

function vary(color, n, amount = 14) {
  const shift = (hash(n) - 0.5) * amount;
  return color.map((channel) => channel + shift);
}

function sheet({ x0, x1, y, z0, z1, step, color, thin = "y", alpha = 240 }) {
  let i = 0;
  for (let x = x0; x <= x1 + 1e-6; x += step) {
    for (let z = z0; z <= z1 + 1e-6; z += step) {
      i += 1;
      const n = hash(x * 19.1 + z * 7.7 + y);
      const [r, g, b] = vary(color, i + y * 10, 18);
      const jx = (n - 0.5) * step * 0.45;
      const jz = (hash(n + 2) - 0.5) * step * 0.45;
      const wide = step * 0.72;
      const flat = step * 0.22;
      const sx = thin === "x" ? flat : wide;
      const sy = thin === "y" ? flat : wide;
      const sz = thin === "z" ? flat : wide;
      splat(x + jx, y, z + jz, sx, sy, sz, r, g, b, alpha);
    }
  }
}

function wallX(x, y0, y1, z0, z1, step, color) {
  let i = 0;
  for (let y = y0; y <= y1; y += step) {
    for (let z = z0; z <= z1; z += step) {
      i += 1;
      const [r, g, b] = vary(color, i + x * 3, 16);
      const wide = step * 0.7;
      splat(x, y, z, step * 0.18, wide, wide, r, g, b, 245);
    }
  }
}

function wallZ(z, y0, y1, x0, x1, step, color, hole) {
  let i = 0;
  for (let y = y0; y <= y1; y += step) {
    for (let x = x0; x <= x1; x += step) {
      if (hole && x > hole.x0 && x < hole.x1 && y > hole.y0 && y < hole.y1) continue;
      i += 1;
      const [r, g, b] = vary(color, i + z, 16);
      const wide = step * 0.7;
      splat(x, y, z, wide, wide, step * 0.18, r, g, b, 245);
    }
  }
}

function column(x, z, radius, height, color) {
  for (let y = 0.05; y <= height; y += 0.11) {
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 5) {
      const [r, g, b] = vary(color, y * 10 + a, 12);
      splat(x + Math.cos(a) * radius, y, z + Math.sin(a) * radius, 0.06, 0.08, 0.06, r, g, b, 250);
    }
  }
}

function blob(cx, cy, cz, rx, ry, rz, count, color, alpha = 230) {
  for (let i = 0; i < count; i += 1) {
    const u = hash(i + cx);
    const v = hash(i + cy + 4);
    const w = hash(i + cz + 9);
    const theta = u * Math.PI * 2;
    const phi = Math.acos(2 * v - 1);
    const rad = Math.cbrt(w);
    const [r, g, b] = vary(color, i, 22);
    splat(
      cx + rad * rx * Math.sin(phi) * Math.cos(theta),
      cy + rad * ry * Math.cos(phi),
      cz + rad * rz * Math.sin(phi) * Math.sin(theta),
      rx * 0.22,
      ry * 0.22,
      rz * 0.22,
      r,
      g,
      b,
      alpha,
    );
  }
}

const plaster = [214, 198, 170];
const stone = [166, 148, 124];
const darkStone = [92, 78, 64];
const grass = [78, 118, 62];
const pathStone = [186, 156, 112];
const wood = [122, 78, 46];
const leaf = [46, 104, 58];
const sky = [156, 188, 214];

sheet({ x0: -2.3, x1: 2.3, y: 0.02, z0: -2.7, z1: 2.15, step: 0.13, color: stone });
sheet({ x0: -1.1, x1: 1.1, y: 0.045, z0: -0.2, z1: 1.5, step: 0.12, color: [122, 74, 62], alpha: 250 });
sheet({ x0: -2.3, x1: 2.3, y: 2.55, z0: -2.7, z1: 2.15, step: 0.18, color: [186, 170, 146], alpha: 220 });

wallZ(2.15, 0, 2.55, -2.3, 2.3, 0.13, plaster);
wallZ(-2.75, 0, 2.55, -2.3, 2.3, 0.12, plaster, { x0: -0.62, x1: 0.62, y0: -0.05, y1: 1.95 });
wallX(-2.3, 0, 2.55, -2.75, 2.15, 0.13, plaster);
wallX(2.3, 0, 2.55, -2.75, 2.15, 0.13, plaster, );

for (let y = 0.15; y <= 1.7; y += 0.16) {
  for (let x = -0.15; x <= 0.85; x += 0.16) {
    const [r, g, b] = vary([188, 214, 228], y * 8 + x, 10);
    splat(2.18, y, x, 0.05, 0.1, 0.1, r, g, b, 180);
  }
}

column(-1.55, -1.4, 0.16, 2.4, darkStone);
column(1.55, -1.4, 0.16, 2.4, darkStone);

blob(0.15, 0.42, 0.15, 0.55, 0.08, 0.34, 220, wood, 250);
for (const [x, z] of [[-0.28, -0.08], [0.55, -0.08], [-0.28, 0.38], [0.55, 0.38]]) {
  for (let y = 0.05; y <= 0.36; y += 0.08) splat(x, y, z, 0.035, 0.05, 0.035, 96, 64, 40, 250);
}

blob(-1.45, 0.55, 0.85, 0.28, 0.42, 0.28, 180, leaf, 240);
for (let y = 0.02; y <= 0.28; y += 0.06) splat(-1.45, y, 0.85, 0.05, 0.05, 0.05, 132, 108, 78, 250);
blob(-1.45, 0.08, 0.85, 0.22, 0.06, 0.22, 40, [150, 92, 64], 250);

blob(0, 1.85, 0.7, 0.12, 0.16, 0.12, 30, [255, 196, 92], 255);

sheet({ x0: -4.2, x1: 4.2, y: 0.01, z0: -7.2, z1: -2.85, step: 0.16, color: grass, alpha: 235 });
sheet({ x0: -0.55, x1: 0.55, y: 0.04, z0: -6.4, z1: -2.7, step: 0.13, color: pathStone, alpha: 250 });

for (let y = 0.05; y <= 1.35; y += 0.1) {
  splat(-1.7, y, -5.1, 0.07, 0.08, 0.07, 92, 62, 40, 250);
}
blob(-1.7, 2.05, -5.1, 0.85, 0.7, 0.85, 420, leaf, 230);
blob(2.4, 1.15, -5.6, 0.55, 0.45, 0.55, 160, [64, 112, 70], 220);

for (let i = 0; i < 80; i += 1) {
  const x = -4 + hash(i) * 8;
  const z = -7 + hash(i + 20) * 4;
  const y = 3.2 + hash(i + 40) * 2.2;
  splat(x, y, z, 0.9, 0.35, 0.9, sky[0], sky[1], sky[2], 70);
}

const bytes = Buffer.concat(records);
const splatPath = path.join(root, "public/mock/courtyard.splat");
await mkdir(path.dirname(splatPath), { recursive: true });
await writeFile(splatPath, bytes);
if (bytes.length % 32 !== 0) throw new Error("splat record size drifted");
console.log(`wrote ${records.length} splats (${bytes.length} bytes) to ${splatPath}`);

const pngPath = path.join(root, "public/samples/courtyard.png");
await mkdir(path.dirname(pngPath), { recursive: true });
await writeFile(pngPath, paintCourtyard(960, 640));
console.log(`wrote ${pngPath}`);

function paintCourtyard(width, height) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  const set = (x, y, r, g, b) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = y * (width * 3 + 1) + 1 + x * 3;
    raw[i] = r;
    raw[i + 1] = g;
    raw[i + 2] = b;
  };
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 3 + 1)] = 0;
    for (let x = 0; x < width; x += 1) {
      const nx = x / width;
      const ny = y / height;
      let r = 214;
      let g = 198;
      let b = 172;
      if (ny < 0.42) {
        const t = ny / 0.42;
        r = 168 + (214 - 168) * t;
        g = 196 + (186 - 196) * t;
        b = 214 + (150 - 214) * t;
      } else if (ny > 0.72) {
        r = 150;
        g = 132;
        b = 108;
      } else {
        const band = Math.floor(nx * 18 + ny * 4) % 2;
        r = band ? 176 : 160;
        g = band ? 156 : 142;
        b = band ? 132 : 118;
      }
      if (ny > 0.38 && ny < 0.78 && nx > 0.38 && nx < 0.62) {
        r = 92;
        g = 118;
        b = 86;
        if (nx > 0.46 && nx < 0.54) {
          r = 186;
          g = 156;
          b = 112;
        }
      }
      if (ny > 0.48 && ny < 0.7 && nx > 0.22 && nx < 0.4) {
        r = 46;
        g = 104;
        b = 58;
      }
      if (ny > 0.55 && ny < 0.72 && nx > 0.58 && nx < 0.78 && Math.abs(ny - 0.64) < 0.04) {
        r = 122;
        g = 78;
        b = 46;
      }
      set(x, y, r, g, b);
    }
  }
  return png(width, height, raw);
}

function png(width, height, raw) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

function chunk(type, data) {
  const tag = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([tag, data])) >>> 0, 0);
  return Buffer.concat([length, tag, data, crc]);
}

function crc32(buf) {
  let crc = ~0;
  for (const byte of buf) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc;
}
