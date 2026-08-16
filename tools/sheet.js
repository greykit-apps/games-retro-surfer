#!/usr/bin/env node
/*
 * Contact sheet for the sprite data in retro-surfer.js — the art is
 * character grids, so the only way to know a sprite reads at a glance is to
 * look at it. Renders every sprite (or the ones you name) into one PNG at 4x
 * with its key underneath.
 *
 *   node tools/sheet.js out.png [key ...]
 *
 * Written straight to PNG with zlib so it needs no dependencies. Parses the
 * source rather than importing it, same as check-sprites.js.
 */
const fs = require("fs");
const zlib = require("zlib");
const path = require("path");

const SCALE = 4;
const PAD = 6;
const LABEL_H = 7;
const COLS = 8;
const BG = [16, 20, 34];
const INK = [200, 210, 235];

// 3x5 glyphs, enough for the keys underneath each tile
const FONT = {
  a: "111,101,111,101,101", b: "110,101,110,101,110", c: "111,100,100,100,111",
  d: "110,101,101,101,110", e: "111,100,111,100,111", f: "111,100,111,100,100",
  g: "111,100,101,101,111", h: "101,101,111,101,101", i: "111,010,010,010,111",
  j: "001,001,001,101,111", k: "101,101,110,101,101", l: "100,100,100,100,111",
  m: "101,111,111,101,101", n: "101,111,111,111,101", o: "111,101,101,101,111",
  p: "111,101,111,100,100", q: "111,101,101,111,001", r: "111,101,111,110,101",
  s: "111,100,111,001,111", t: "111,010,010,010,010", u: "101,101,101,101,111",
  v: "101,101,101,101,010", w: "101,101,111,111,101", x: "101,101,010,101,101",
  y: "101,101,010,010,010", z: "111,001,010,100,111",
  0: "111,101,101,101,111", 1: "010,110,010,010,111", 2: "111,001,111,100,111",
  3: "111,001,111,001,111", 4: "101,101,111,001,001", 5: "111,100,111,001,111",
  6: "111,100,111,101,111", 7: "111,001,001,001,001", 8: "111,101,111,101,111",
  9: "111,101,111,001,111"
};

function parseSprites(src) {
  const sprites = {};
  const blockRe = /^ {4}(\w+): \{\n([\s\S]*?)^ {4}\},?$/gm;
  let m;
  while ((m = blockRe.exec(src)) !== null) {
    const rows = [...m[2].matchAll(/^ {8}"(.*)"/gm)].map((r) => r[1]);
    const palette = {};
    const palRaw = /palette: \{([^}]*)\}/.exec(m[2]);
    if (palRaw) for (const p of palRaw[1].matchAll(/(\w+): "(#[0-9a-fA-F]{6})"/g)) palette[p[1]] = p[2];
    if (rows.length) sprites[m[1]] = { rows, palette };
  }
  return sprites;
}

function hex(h) {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

class Img {
  constructor(w, h, bg) {
    this.w = w; this.h = h;
    this.px = Buffer.alloc(w * h * 3);
    for (let i = 0; i < w * h; i++) {
      this.px[i * 3] = bg[0]; this.px[i * 3 + 1] = bg[1]; this.px[i * 3 + 2] = bg[2];
    }
  }
  set(x, y, c) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 3;
    this.px[i] = c[0]; this.px[i + 1] = c[1]; this.px[i + 2] = c[2];
  }
  rect(x, y, w, h, c) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }
  text(s, x, y, c) {
    s = String(s).toLowerCase();
    for (let i = 0; i < s.length; i++) {
      const g = FONT[s[i]];
      if (!g) continue;
      const rows = g.split(",");
      for (let r = 0; r < 5; r++) for (let col = 0; col < 3; col++) {
        if (rows[r][col] === "1") this.set(x + i * 4 + col, y + r, c);
      }
    }
  }
  png() {
    const raw = Buffer.alloc((this.w * 3 + 1) * this.h);
    for (let y = 0; y < this.h; y++) {
      raw[y * (this.w * 3 + 1)] = 0;
      this.px.copy(raw, y * (this.w * 3 + 1) + 1, y * this.w * 3, (y + 1) * this.w * 3);
    }
    const chunk = (type, data) => {
      const len = Buffer.alloc(4);
      len.writeUInt32BE(data.length);
      const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
      const crc = Buffer.alloc(4);
      crc.writeUInt32BE(crc32(body) >>> 0);
      return Buffer.concat([len, body, crc]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(this.w, 0);
    ihdr.writeUInt32BE(this.h, 4);
    ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", ihdr),
      chunk("IDAT", zlib.deflateSync(raw)),
      chunk("IEND", Buffer.alloc(0))
    ]);
  }
}

let _crcTable = null;
function crc32(buf) {
  if (!_crcTable) {
    _crcTable = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      _crcTable[n] = c;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = _crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ 0xffffffff;
}

const out = process.argv[2] || "sheet.png";
const src = fs.readFileSync(path.join(__dirname, "..", "retro-surfer.js"), "utf8");
const all = parseSprites(src);
let keys = process.argv.slice(3);
if (!keys.length) keys = Object.keys(all).filter((k) => !/^(pose|tuck)[1-9]$/.test(k));
keys = keys.filter((k) => {
  if (!all[k]) console.error(`no sprite named ${k}`);
  return all[k];
});

// tiles are sized to the widest/tallest sprite so the grid stays aligned
let tw = 0, th = 0;
keys.forEach((k) => {
  tw = Math.max(tw, all[k].rows[0].length);
  th = Math.max(th, all[k].rows.length);
});
const cellW = tw * SCALE + PAD * 2;
const cellH = th * SCALE + PAD * 2 + LABEL_H;
const cols = Math.min(COLS, keys.length);
const rows = Math.ceil(keys.length / cols);
const img = new Img(cols * cellW, rows * cellH, BG);

keys.forEach((k, i) => {
  const s = all[k];
  const ox = (i % cols) * cellW + PAD + ((tw - s.rows[0].length) * SCALE) / 2;
  const oy = Math.floor(i / cols) * cellH + PAD;
  for (let y = 0; y < s.rows.length; y++) {
    for (let x = 0; x < s.rows[y].length; x++) {
      const ch = s.rows[y][x];
      if (ch === ".") continue;
      const c = s.palette[ch];
      if (!c) continue;
      img.rect(Math.round(ox + x * SCALE), oy + y * SCALE, SCALE, SCALE, hex(c));
    }
  }
  img.text(k.slice(0, Math.floor(cellW / 4)), (i % cols) * cellW + PAD,
    Math.floor(i / cols) * cellH + PAD + th * SCALE + 2, INK);
});

fs.writeFileSync(out, img.png());
console.log(`${out} — ${keys.length} sprites, ${img.w}x${img.h}`);
