import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const NAVY = { r: 16, g: 47, b: 70 };
const GOLD = { r: 201, g: 162, b: 39 };
const CREAM = { r: 246, g: 237, b: 223 };

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc & 1) !== 0 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

function png(width, height, paint) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const color = paint(x, y, width, height);
      const i = row + 1 + x * 3;
      raw[i] = color.r;
      raw[i + 1] = color.g;
      raw[i + 2] = color.b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function solid(_x, _y) {
  return NAVY;
}

function logo(x, y, width, height) {
  if (y > height - Math.max(4, Math.round(height * 0.12))) {
    return GOLD;
  }
  if (x < Math.round(width * 0.08)) {
    return GOLD;
  }
  return NAVY;
}

function strip(x, y, width, height) {
  const band = Math.round(height * 0.18);
  if (y > height - band - 2 && y < height - 2) {
    return GOLD;
  }
  if (y < Math.round(height * 0.12)) {
    return CREAM;
  }
  if (x < Math.round(width * 0.03)) {
    return GOLD;
  }
  return NAVY;
}

const dir = path.resolve("templates", "hackuta.pass");
mkdirSync(dir, { recursive: true });

const files = {
  "icon.png": png(29, 29, solid),
  "icon@2x.png": png(58, 58, solid),
  "icon@3x.png": png(87, 87, solid),
  "logo.png": png(160, 50, logo),
  "logo@2x.png": png(320, 100, logo),
  "logo@3x.png": png(480, 150, logo),
  "strip.png": png(375, 98, strip),
  "strip@2x.png": png(750, 196, strip),
};

for (const [name, buffer] of Object.entries(files)) {
  writeFileSync(path.join(dir, name), buffer);
  console.log(`wrote ${name} (${buffer.length} bytes)`);
}
