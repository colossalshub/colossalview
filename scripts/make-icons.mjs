import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const letter = ['01110', '10001', '10000', '10000', '10000', '10001', '01110'];

function crc32(buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function png(size) {
  const scale = Math.floor(size / 16);
  const originX = Math.floor((size - 5 * scale) / 2);
  const originY = Math.floor((size - 7 * scale) / 2);
  const rows = [];
  for (let y = 0; y < size; y += 1) {
    const row = Buffer.alloc(1 + size * 3);
    for (let x = 0; x < size; x += 1) {
      const glyphX = Math.floor((x - originX) / scale);
      const glyphY = Math.floor((y - originY) / scale);
      const on = glyphY >= 0 && glyphY < 7 && glyphX >= 0 && glyphX < 5 && letter[glyphY]?.[glyphX] === '1';
      const index = 1 + x * 3;
      row[index] = on ? 0xe0 : 0x14;
      row[index + 1] = on ? 0x7a : 0x14;
      row[index + 2] = on ? 0x32 : 0x14;
    }
    rows.push(row);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const directory = path.resolve('public/icons');
fs.mkdirSync(directory, { recursive: true });
fs.writeFileSync(path.join(directory, 'icon-192.png'), png(192));
fs.writeFileSync(path.join(directory, 'icon-512.png'), png(512));
