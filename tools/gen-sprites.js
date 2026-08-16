/*
 * Sprite generator for Retro Surfer '96.
 * Draws each 32x32 (and friends) sprite with primitives, then emits static
 * character-grid rows to paste into retro-surfer.js. Not shipped.
 */

const FONT = {
  A: "111,101,111,101,101", B: "110,101,110,101,110", C: "111,100,100,100,111",
  D: "110,101,101,101,110", E: "111,100,111,100,111", F: "111,100,111,100,100",
  G: "111,100,101,101,111", H: "101,101,111,101,101", I: "111,010,010,010,111",
  J: "001,001,001,101,111", K: "101,101,110,101,101", L: "100,100,100,100,111",
  M: "101,111,111,101,101", N: "101,111,111,111,101", O: "111,101,101,101,111",
  P: "111,101,111,100,100", Q: "111,101,101,111,001", R: "111,101,111,110,101",
  S: "111,100,111,001,111", T: "111,010,010,010,010", U: "101,101,101,101,111",
  V: "101,101,101,101,010", W: "101,101,111,111,101", X: "101,101,010,101,101",
  Y: "101,101,010,010,010", Z: "111,001,010,100,111",
  0: "111,101,101,101,111", 1: "010,110,010,010,111", 2: "111,001,111,100,111",
  3: "111,001,111,001,111", 4: "101,101,111,001,001", 5: "111,100,111,001,111",
  6: "111,100,111,101,111", 7: "111,001,001,001,001", 8: "111,101,111,101,111",
  9: "111,101,111,001,111", " ": "000,000,000,000,000", ":": "000,010,000,010,000",
  "!": "010,010,010,000,010", ".": "000,000,000,000,010", "-": "000,000,111,000,000"
};

class G {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.d = Array.from({ length: h }, () => Array(w).fill("."));
  }
  set(x, y, c) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.d[y][x] = c;
  }
  get(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return ".";
    return this.d[y][x];
  }
  rect(x, y, w, h, c) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }
  rrect(x, y, w, h, r, c) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const px = x + i, py = y + j;
      const dx = Math.max(x + r - px, px - (x + w - 1 - r), 0);
      const dy = Math.max(y + r - py, py - (y + h - 1 - r), 0);
      if (dx * dx + dy * dy <= r * r + r * 0.5) this.set(px, py, c);
    }
  }
  disc(cx, cy, r, c) {
    for (let y = Math.floor(cy - r); y <= cy + r; y++)
      for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        const dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy <= r * r + r * 0.2) this.set(x, y, c);
      }
  }
  ring(cx, cy, r, t, c) {
    for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++)
      for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d <= r + 0.3 && d >= r - t) this.set(x, y, c);
      }
  }
  line(x0, y0, x1, y1, t, c) {
    const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 3) + 1;
    for (let s = 0; s <= steps; s++) {
      const x = x0 + (x1 - x0) * s / steps, y = y0 + (y1 - y0) * s / steps;
      if (t <= 1) this.set(x, y, c);
      else this.disc(x, y, t / 2, c);
    }
  }
  // filled convex/concave polygon, even-odd
  poly(pts, c) {
    let minY = Infinity, maxY = -Infinity;
    pts.forEach(p => { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); });
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      const xs = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
          xs.push(a[0] + (y - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
        }
      }
      xs.sort((p, q) => p - q);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        for (let x = Math.round(xs[i]); x <= Math.round(xs[i + 1]); x++) this.set(x, y, c);
      }
    }
  }
  text(s, x, y, c, scale) {
    scale = scale || 1;
    s = String(s).toUpperCase();
    for (let i = 0; i < s.length; i++) {
      const g = FONT[s[i]];
      if (!g) continue;
      const rows = g.split(",");
      for (let r = 0; r < 5; r++) for (let col = 0; col < 3; col++) {
        if (rows[r][col] === "1") this.rect(x + (i * 4 + col) * scale, y + r * scale, scale, scale, c);
      }
    }
  }
  // dark outline around every filled region
  outline(c) {
    const add = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.get(x, y) !== ".") continue;
      if (this.get(x - 1, y) !== "." && this.get(x - 1, y) !== c) { add.push([x, y]); continue; }
      if (this.get(x + 1, y) !== "." && this.get(x + 1, y) !== c) { add.push([x, y]); continue; }
      if (this.get(x, y - 1) !== "." && this.get(x, y - 1) !== c) { add.push([x, y]); continue; }
      if (this.get(x, y + 1) !== "." && this.get(x, y + 1) !== c) { add.push([x, y]); continue; }
    }
    add.forEach(p => this.set(p[0], p[1], c));
  }
  rows() { return this.d.map(r => r.join("")); }
}

// ---------------------------------------------------------------- player ---
// A surfboard rotated by `ang` (radians, 0 = pointing down-screen) with an
// anthropomorphic puma riding it, leaning into the turn. `tuck` drops the
// same character into a crouch: knees bent, head down, arms swept back,
// tail streaming straight out behind — feet stay planted so it reads as a
// crouch rather than a smaller sprite.
function player(angDeg, tuck) {
  const g = new G(32, 32);
  const ang = angDeg * Math.PI / 180;
  const sin = Math.sin(ang), cos = Math.cos(ang);
  const cr = tuck ? 1 : 0;
  const cx = 16, cy = 22, halfL = 13, halfW = 4.0;
  // unit vectors: `back` points up-track, `side` is across the board
  const backX = -sin, backY = -cos;
  const sideX = cos, sideY = -sin;

  // Board carries the whole turn: rotate each pixel into board space and
  // taper toward the tips. +v is the nose (the way you're travelling).
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
    const v = dx * sin + dy * cos;
    const u = dx * cos - dy * sin;
    if (Math.abs(v) > halfL) continue;
    const prof = halfW * Math.pow(1 - Math.pow(v / halfL, 2), 0.40);
    if (Math.abs(u) > prof) continue;
    let c = "B";
    if (Math.abs(u) > prof - 1.2) c = "S";                          // rails
    else if (Math.abs(u) < 1.1 && Math.abs(v) < halfL - 3) c = "C"; // stripe
    g.set(x, y, c);
    if (Math.abs(v) > halfL - 3.5 && Math.abs(u) < prof - 0.8) g.set(x, y, "C"); // bright tips
  }

  // Rider stays upright; the lean is a lateral shift, and the arm bar takes
  // half the board's angle so the pose still reads as a carve.
  const lean = sin * 3.4;
  const bx = 16 + lean;

  // --- tail: fixed-length curve trailing up-track, held off to one side.
  // Held straight back it hides behind the rider and reads as a tuft on the
  // head, so it carries a constant bend, swung further by the lean. Bending
  // the heading rather than offsetting the tip keeps the length constant —
  // adding a perpendicular offset made it fan into a blob at part-lean.
  const tailDir = ang + Math.PI + (cr ? 0.45 : 0.5) - sin * 0.4;
  const tdx = Math.sin(tailDir), tdy = Math.cos(tailDir);
  const tpx = Math.cos(tailDir), tpy = -Math.sin(tailDir);
  const reach = cr ? 15 : 13.5;
  const curl = cr ? 1.8 : 3.4;
  const tailBaseX = bx - sin * 1.5 + backX * 1.5;
  const tailBaseY = 19 + cr * 2 - cos * 1.5 + backY * 1.5;
  const p1x = tailBaseX + tdx * reach * 0.55 + tpx * curl;
  const p1y = tailBaseY + tdy * reach * 0.55 + tpy * curl;
  const p2x = tailBaseX + tdx * reach + tpx * curl * 0.4;
  const p2y = tailBaseY + tdy * reach + tpy * curl * 0.4;
  for (let i = 0; i <= 26; i++) {
    const t = i / 26, it = 1 - t;
    const tx = it * it * tailBaseX + 2 * it * t * p1x + t * t * p2x;
    const ty = it * it * tailBaseY + 2 * it * t * p1y + t * t * p2y;
    g.disc(tx, ty, 2.1 - t * 1.2, t > 0.68 ? "N" : "H");   // dark tip
  }

  // boots planted on the board, spaced along its axis — these do NOT move
  // when tucking, which is what sells the crouch
  g.disc(bx - sin * 3.2, 20 - cos * 3.2, 2.3, "K");
  g.disc(bx + sin * 3.2, 20 + cos * 3.2, 2.3, "K");
  // lower body: bent knees when tucked
  g.poly([
    [bx - 3.4, 16 + cr * 3], [bx + 3.4, 16 + cr * 3],
    [bx + 3.8, 21 + cr], [bx - 3.8, 21 + cr]
  ], "P");
  // torso, compressed and pitched forward in the tuck
  const tTop = 11 + cr * 4.6, tBot = 17 + cr * 2.4;
  g.poly([[bx - 3.9, tTop], [bx + 3.9, tTop], [bx + 3.3, tBot], [bx - 3.3, tBot]], "T");
  g.poly([[bx + 1.2, tTop], [bx + 3.9, tTop], [bx + 3.3, tBot], [bx + 1.2, tBot]], "J");
  // arms: one bar through the shoulders, angled with the turn and swept
  // back over the board when tucked
  const phi = ang * 0.5, armL = 7.6 - cr * 1.5, sy = 12.5 + cr * 5;
  const abx = bx + backX * cr * 2.2, aby = sy + backY * cr * 2.2;
  const ax0 = abx - Math.cos(phi) * armL, ay0 = aby + Math.sin(phi) * armL;
  const ax1 = abx + Math.cos(phi) * armL, ay1 = aby - Math.sin(phi) * armL;
  g.line(ax0, ay0, ax1, ay1, 2.4, "T");
  g.disc(ax0, ay0, 1.7, "H");     // paws
  g.disc(ax1, ay1, 1.7, "H");

  // --- puma head: muzzle, nose, ears. Ducks down and forward in the tuck.
  const hx = bx + sin * (0.8 + cr * 1.6);
  const hy = 7 + cr * 5.2;
  g.poly([[hx - 3.9, hy - 2.2], [hx - 1.2, hy - 2.6], [hx - 2.6, hy - 5.6]], "H");  // ears
  g.poly([[hx + 3.9, hy - 2.2], [hx + 1.2, hy - 2.6], [hx + 2.6, hy - 5.6]], "H");
  g.set(hx - 2.6, hy - 3.9, "N"); g.set(hx + 2.6, hy - 3.9, "N");
  g.disc(hx, hy, 3.9, "H");                       // skull
  g.disc(hx, hy + 1.7, 2.5, "M");                 // muzzle
  g.set(hx, hy + 0.6, "N"); g.set(hx - 1, hy + 0.6, "N"); g.set(hx + 1, hy + 0.6, "N");
  g.set(hx, hy + 1.6, "N");                       // nose bridge down to mouth
  g.set(hx - 2, hy - 1.2, "K"); g.set(hx + 2, hy - 1.2, "K");   // eyes
  g.set(hx - 2, hy - 0.2, "K"); g.set(hx + 2, hy - 0.2, "K");

  g.outline("K");
  return {
    palette: {
      K: "#0a0d18", S: "#1b6fd0", B: "#3aa0ff", C: "#bfe9ff",
      H: "#d19a5c", M: "#f2d9b6", N: "#5c3416",
      T: "#28e0c0", J: "#14a08a", P: "#2b3550"
    },
    rows: g.rows()
  };
}

// ------------------------------------------------------------- obstacles ---
function netscape() {
  const g = new G(32, 32);
  g.rrect(0, 0, 32, 32, 5, "B");
  // horizon arc across the lower third, stars above it
  for (let x = 1; x < 31; x++) {
    const y = 29 - Math.round(6 * Math.sin(Math.PI * (x - 1) / 29));
    g.set(x, y, "A"); g.set(x, y + 1, "A"); g.set(x, y + 2, "A");
  }
  [[5, 5], [26, 7], [9, 9], [23, 4], [16, 3]].forEach(p => g.set(p[0], p[1], "W"));
  // big blocky N
  g.rect(6, 5, 4, 19, "W");
  g.rect(22, 5, 4, 19, "W");
  g.line(9, 6, 22, 22, 4.4, "W");
  g.outline("K");
  return { palette: { K: "#0a0d18", B: "#101b46", A: "#3f7ad6", W: "#e8ecff" }, rows: g.rows() };
}

function aol() {
  const g = new G(32, 32);
  g.disc(16, 16, 15, "S");        // silver disc
  g.ring(16, 16, 15, 1.5, "D");
  g.disc(16, 16, 12.5, "B");      // printed face
  g.text("AOL", 11, 5, "W", 1);
  g.text("FREE", 9, 22, "W", 1);
  g.disc(16, 16, 5.5, "S");       // hub
  g.ring(16, 16, 5.5, 1, "D");
  g.disc(16, 16, 3, ".");         // hole
  // sheen
  g.line(6, 12, 10, 7, 1, "W");
  g.line(8, 14, 12, 9, 1, "W");
  g.outline("K");
  return { palette: { K: "#0a0d18", S: "#c9d4e6", D: "#7a8299", B: "#2b6ef6", W: "#ffffff" }, rows: g.rows() };
}

// The ICQ flower, drawn in its OFFLINE red rather than its online green.
// Period-accurate — the flower went red the moment your contact vanished —
// and it keeps the sprite out of the reserved pickup green, which a solid
// green blob this size sat squarely inside.
function icq() {
  const g = new G(32, 32);
  // antenna
  g.line(16, 12, 16, 3, 1.6, "D");
  g.disc(16, 2.5, 2, "Y");
  // four petals
  [[10, 14], [22, 14], [10, 24], [22, 24]].forEach(p => g.disc(p[0], p[1], 5.6, "R"));
  g.disc(16, 19, 6.5, "R");
  g.disc(16, 19, 3, "W");
  g.disc(16, 19, 1.6, "D");
  g.outline("K");
  return { palette: { K: "#0a0d18", R: "#ef4136", D: "#8f1f18", W: "#ffe8e6", Y: "#ffcc33" }, rows: g.rows() };
}

function winamp() {
  const g = new G(32, 32);
  g.rrect(0, 4, 32, 24, 2, "D");
  g.rect(1, 5, 30, 4, "T");            // title bar
  g.rect(27, 6, 2, 2, "R");
  g.rect(24, 6, 2, 2, "Y");
  g.rect(2, 11, 13, 9, "L");           // LCD
  g.text("MP3", 3, 13, "Y", 1);
  // EQ bars, bottom-up green/amber/red the way the analyser actually ran —
  // the green is the dim base only, well clear of the pickup green
  const hts = [3, 6, 4, 8, 5, 7, 3, 6];
  hts.forEach((h, i) => {
    const x = 17 + i * 2;
    g.rect(x, 20 - h, 1, h, "Y");
    g.rect(x, 19, 1, 1, "E");
    if (h >= 6) g.rect(x, 20 - h, 1, 1, "R");
  });
  g.rect(2, 22, 28, 2, "S");           // seek bar
  g.rect(4, 21, 3, 4, "Y");
  g.outline("K");
  return { palette: { K: "#0a0d18", D: "#39405c", T: "#6a76a0", L: "#141008", E: "#186b25", Y: "#ffcc33", R: "#ff3355", S: "#20263a" }, rows: g.rows() };
}

// deterministic noise so regenerating the art doesn't reshuffle it
let _seed = 20250724;
function rnd() {
  _seed = (_seed * 1103515245 + 12345) & 0x7fffffff;
  return _seed / 0x7fffffff;
}

// one little Win95 popup, used to build the storm
function popupWin(g, x, y, w, h, v) {
  g.rect(x, y, w, h, "K");
  g.rect(x + 1, y + 1, w - 2, h - 2, "G");
  g.rect(x + 1, y + 1, w - 2, 5, "B");
  g.rect(x + w - 6, y + 2, 4, 3, "R");
  if (v === 0) {
    g.disc(x + 8, y + 14, 3.6, "R");
    g.rect(x + 5, y + 13, 2, 3, "W");
    g.rect(x + 15, y + 11, w - 20, 2, "D");
    g.rect(x + 15, y + 16, w - 24, 2, "D");
  } else if (v === 1) {
    g.rect(x + 4, y + 9, w - 8, 4, "Y");
    g.rect(x + 4, y + 16, w - 14, 2, "D");
    g.rect(x + w - 13, y + 15, 9, 5, "S");
  } else {
    g.rect(x + 4, y + 9, w - 8, 2, "D");
    g.rect(x + 4, y + 13, w - 12, 2, "D");
    g.rect(x + 4, y + 17, w - 9, 2, "D");
  }
}

function popupstorm() {
  const g = new G(104, 76);
  const wins = [[2, 2, 0], [66, 0, 2], [34, 14, 1], [0, 36, 2], [62, 30, 0], [28, 46, 1]];
  wins.forEach(p => popupWin(g, p[0], p[1], 38, 28, p[2]));
  return { palette: { K: "#0a0d18", G: "#c9d4e6", B: "#12245e", R: "#ff3355", W: "#ffffff", D: "#8b8fa8", Y: "#ffcc33", S: "#e8ecff" }, rows: g.rows() };
}

function glitch() {
  const g = new G(88, 60);
  for (let y = 0; y < 60;) {
    const bh = 2 + (rnd() * 5 | 0);
    for (let x = 0; x < 88;) {
      const bw = 4 + (rnd() * 20 | 0);
      const r = rnd();
      const c = r < 0.42 ? "D" : r < 0.52 ? "." : r < 0.67 ? "M"
        : r < 0.82 ? "C" : r < 0.9 ? "O" : "W";
      g.rect(x, y, bw, bh, c);
      x += bw;
    }
    y += bh;
  }
  // scan tears
  for (let i = 0; i < 5; i++) {
    g.rect(0, rnd() * 58 | 0, 88, 1 + (rnd() * 2 | 0), rnd() < 0.5 ? "W" : "K");
  }
  return { palette: { K: "#0a0d18", D: "#1c2450", M: "#ff3ce0", C: "#54f2ff", O: "#ff7a1c", W: "#e8ecff" }, rows: g.rows() };
}

function notfound() {
  const g = new G(32, 32);
  g.rect(3, 2, 26, 28, "W");           // page
  g.poly([[23, 2], [29, 2], [29, 8]], "D");  // folded corner
  g.text("404", 5, 9, "R", 2);
  g.rect(7, 22, 18, 2, "D");
  g.rect(7, 26, 12, 2, "D");
  g.outline("K");
  return { palette: { K: "#0a0d18", W: "#e8ecff", D: "#8b8fa8", R: "#ff3355" }, rows: g.rows() };
}

function construction() {
  const g = new G(96, 44);
  // striped plank on posts
  g.rect(10, 12, 4, 14, "P");
  g.rect(80, 12, 4, 14, "P");
  g.rect(2, 2, 92, 12, "Y");
  for (let y = 2; y < 14; y++) for (let x = 2; x < 94; x++) {
    if (((x + y) % 12) < 6) g.set(x, y, "K");
  }
  // dirt mound
  for (let x = 18; x < 78; x++) {
    const h = Math.round(9 * Math.sin(Math.PI * (x - 18) / 60));
    g.rect(x, 44 - h - 2, 1, h + 2, "E");
  }
  // cones
  [24, 48, 70].forEach(cx => {
    g.poly([[cx, 24], [cx + 5, 40], [cx - 5, 40]], "O");
    g.rect(cx - 3, 32, 7, 3, "W");
    g.rect(cx - 7, 39, 15, 3, "O");
  });
  g.outline("K");
  return { palette: { K: "#0a0d18", Y: "#ffcc33", P: "#8b8fa8", O: "#ff7a1c", W: "#ffffff", E: "#6b5a3a" }, rows: g.rows() };
}

function msn() {
  const g = new G(32, 32);
  // butterfly: two upper wings, two lower wings
  g.poly([[15, 15], [3, 4], [1, 12], [8, 18]], "B");
  g.poly([[17, 15], [29, 4], [31, 12], [24, 18]], "B");
  g.poly([[15, 16], [5, 22], [8, 29], [15, 25]], "C");
  g.poly([[17, 16], [27, 22], [24, 29], [17, 25]], "C");
  g.poly([[15, 13], [17, 13], [18, 24], [14, 24]], "D");   // body
  g.line(15, 12, 11, 5, 1, "D");                            // antennae
  g.line(17, 12, 21, 5, 1, "D");
  g.outline("K");
  return { palette: { K: "#0a0d18", B: "#2b9cf6", C: "#54f2ff", D: "#12245e" }, rows: g.rows() };
}

function ie() {
  const g = new G(32, 32);
  // gold orbit first, so the e sits over it
  for (let a = 0; a < 360; a += 2) {
    const r = a * Math.PI / 180;
    const x = 16 + Math.cos(r) * 14.5, y = 16 + Math.sin(r) * 7.5;
    g.set(x, y, "Y"); g.set(x, y + 1, "Y");
  }
  // lowercase e: an annulus with a mouth cut out of the lower right,
  // plus the crossbar
  const cx = 15, cy = 17, rOut = 11, rIn = 5.6;
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
    const d = Math.hypot(dx, dy);
    if (d > rOut || d < rIn) continue;
    const a = Math.atan2(dy, dx) * 180 / Math.PI;   // 0 = right, + = down
    if (a > 8 && a < 78) continue;                   // the mouth
    g.set(x, y, "B");
  }
  for (let x = cx - rOut + 1; x <= cx + rOut - 1; x++) {
    g.set(x, cy - 1, "B"); g.set(x, cy, "B"); g.set(x, cy + 1, "B");
  }
  g.outline("K");
  return { palette: { K: "#0a0d18", B: "#2b6ef6", Y: "#ffcc33" }, rows: g.rows() };
}

function bsod() {
  const g = new G(32, 32);
  g.rect(1, 2, 30, 28, "B");
  g.rect(10, 5, 12, 5, "W");          // inverted header block
  g.text("OS", 12, 6, "B", 1);
  const lines = [22, 26, 18, 24, 14, 20];
  lines.forEach((w, i) => g.rect(4, 13 + i * 3, w, 2, "W"));
  g.rect(4, 13 + 6 * 3, 3, 2, "C");   // cursor
  g.outline("K");
  return { palette: { K: "#0a0d18", B: "#1438a8", W: "#e8ecff", C: "#8fb4ff" }, rows: g.rows() };
}

function java() {
  const g = new G(32, 32);
  g.rrect(6, 14, 18, 15, 2, "W");     // cup
  g.rect(7, 15, 16, 3, "D");          // coffee
  g.ring(24, 20, 4, 2, "W");          // handle
  g.rect(4, 29, 22, 3, "S");          // saucer
  // steam
  [10, 15, 20].forEach((x, i) => {
    for (let y = 0; y < 11; y++) {
      g.set(x + Math.round(Math.sin((y + i * 2) / 2.2) * 2), 1 + y, "R");
    }
  });
  g.outline("K");
  return { palette: { K: "#0a0d18", W: "#e8ecff", D: "#4a2a10", S: "#8b8fa8", R: "#ff3355" }, rows: g.rows() };
}

function hitcounter() {
  const g = new G(32, 32);
  g.rrect(1, 6, 30, 20, 2, "K");
  g.rect(3, 9, 26, 14, "D");
  g.text("004201", 4, 13, "A", 1);     // amber odometer digits, not LED green
  g.rect(3, 9, 26, 1, "S");
  // dividers sit in the 1px gutter between glyphs, not through them
  for (let i = 0; i < 5; i++) g.rect(7 + i * 4, 9, 1, 14, "S");
  g.outline("K");
  return { palette: { K: "#0a0d18", D: "#141008", A: "#ffb000", S: "#2b3550" }, rows: g.rows() };
}

// --- 1994 DIAL-UP ----------------------------------------------------------

// External 56k modem: beige box, status LEDs, curly phone cord.
function modem() {
  const g = new G(32, 32);
  g.rrect(1, 11, 30, 14, 2, "T");
  g.rect(2, 12, 28, 2, "S");                 // top highlight
  g.rect(3, 21, 12, 2, "D");                 // brand strip
  // LED row — modems blinked amber and red, never green
  ["A", "R", "A", "A", "R"].forEach((c, i) => g.rect(4 + i * 5, 16, 3, 3, c));
  // curly cord out of the back
  for (let i = 0; i <= 22; i++) {
    const t = i / 22;
    g.set(24 + Math.sin(t * 9) * 3 + t * 5, 11 - t * 9, "D");
  }
  g.outline("K");
  return { palette: { K: "#0a0d18", T: "#d8c9a0", S: "#f0e6c8", D: "#8b8fa8", A: "#ffb000", R: "#ff3355" }, rows: g.rows() };
}

// The handset lifted mid-download. Sound arcs so it reads as ringing.
function phone() {
  const g = new G(32, 32);
  const bx = 4, by = 24, ex = 20, ey = 8;
  g.line(bx, by, ex, ey, 4.6, "D");          // handle
  g.disc(bx, by, 5, "D");                    // earpiece
  g.disc(ex, ey, 5, "D");                    // mouthpiece
  g.disc(bx, by, 2.4, "M");
  g.disc(ex, ey, 2.4, "M");
  // ring arcs off the mouthpiece
  for (let i = 1; i <= 3; i++) {
    for (let a = -50; a <= 30; a += 3) {
      const r = a * Math.PI / 180;
      g.set(ex + Math.cos(r) * (5 + i * 3), ey + Math.sin(r) * (5 + i * 3), "R");
    }
  }
  g.outline("K");
  return { palette: { K: "#0a0d18", D: "#39405c", M: "#8b8fa8", R: "#ff3355" }, rows: g.rows() };
}

// Open guestbook with a quill: sign it, or else.
function guestbook() {
  const g = new G(32, 32);
  g.poly([[1, 9], [15, 6], [15, 27], [1, 25]], "W");     // left page
  g.poly([[17, 6], [31, 9], [31, 25], [17, 27]], "W");   // right page
  g.rect(15, 6, 2, 22, "D");                             // spine
  for (let i = 0; i < 4; i++) {
    g.rect(3, 11 + i * 4, 10, 1, "D");
    g.rect(19, 11 + i * 4, 10, 1, "D");
  }
  g.line(21, 22, 29, 3, 1.8, "Y");                       // quill
  g.poly([[28, 2], [31, 5], [29, 7]], "S");              // feather
  g.outline("K");
  return { palette: { K: "#0a0d18", W: "#e8ecff", D: "#8b8fa8", Y: "#ffcc33", S: "#ffffff" }, rows: g.rows() };
}

// Ask Jeeves: the butler. Bald dome, bow tie, moustache.
function jeeves() {
  const g = new G(32, 32);
  g.poly([[3, 31], [10, 22], [22, 22], [29, 31]], "W");  // shoulders
  g.poly([[13, 22], [19, 22], [16, 28]], "K");           // lapel V
  g.poly([[12, 24], [16, 26], [20, 24], [20, 28], [16, 26], [12, 28]], "R");  // bow tie
  g.disc(16, 13, 8.5, "F");                              // head
  g.disc(9, 13, 2.6, "D"); g.disc(23, 13, 2.6, "D");     // side hair
  g.disc(13, 11, 1.4, "K"); g.disc(19, 11, 1.4, "K");    // eyes
  g.rect(12, 16, 9, 2, "D");                             // moustache
  g.outline("K");
  return { palette: { K: "#0a0d18", W: "#e8ecff", F: "#e8b58a", D: "#5a5f78", R: "#ff3355" }, rows: g.rows() };
}

// After Dark's flying toaster, wings and all.
function toaster() {
  const g = new G(32, 32);
  // Two wings, spread symmetrically. One wing plus a box reads as neither a
  // toaster nor a bird; the pair is what makes the joke land instantly.
  for (const s of [-1, 1]) {
    const ox = 16 + s * 7;
    for (let f = 0; f < 3; f++) {
      g.poly([
        [ox, 13 + f * 4], [ox + s * (11 - f * 2), 9 + f * 4],
        [ox + s * (11 - f * 2), 12 + f * 4], [ox, 16 + f * 4]
      ], "W");
      g.line(ox, 15 + f * 4, ox + s * (10 - f * 2), 11.5 + f * 4, 1, "D");
    }
  }
  g.rrect(12, 2, 9, 10, 2, "E");             // toast, mid-pop
  g.rect(12, 2, 9, 2, "A");                  // crust
  g.set(15, 7, "A"); g.set(18, 9, "A");
  g.rrect(9, 11, 15, 16, 2, "S");            // chrome body
  g.rect(10, 13, 12, 2, "W");                // highlight
  g.rect(11, 11, 11, 2, "K");                // slot the toast came out of
  g.rect(7, 15, 3, 4, "D");                  // lever, on the body's flank
  g.disc(16, 22, 2.6, "D");                  // browning dial
  g.disc(16, 22, 1, "S");
  g.outline("K");
  return { palette: { K: "#0a0d18", S: "#c9d4e6", W: "#ffffff", D: "#8b8fa8", E: "#b57a3a", A: "#ffb000" }, rows: g.rows() };
}

// --- 1997 MULTIMEDIA -------------------------------------------------------

// The hourglass cursor, still going.
function hourglass() {
  const g = new G(32, 32);
  g.rect(6, 3, 20, 3, "S");                  // caps
  g.rect(6, 26, 20, 3, "S");
  g.poly([[8, 6], [24, 6], [17, 16], [17, 17], [24, 26], [8, 26], [15, 17], [15, 16]], "W");
  g.poly([[10, 8], [22, 8], [17, 15], [15, 15]], "B");   // sand, top
  g.poly([[11, 25], [21, 25], [18, 21], [14, 21]], "B"); // sand, bottom
  g.rect(15, 15, 2, 6, "B");                             // trickle
  g.outline("K");
  return { palette: { K: "#0a0d18", W: "#e8ecff", S: "#8b8fa8", B: "#2b6ef6" }, rows: g.rows() };
}

// The button every Flash site made you hunt for.
function skipintro() {
  const g = new G(32, 32);
  g.rrect(1, 9, 30, 14, 1, "S");
  g.rect(2, 10, 28, 1, "W");                 // bevel, lit edge
  g.rect(2, 10, 1, 12, "W");
  g.rect(2, 21, 28, 1, "D");                 // bevel, shadow edge
  g.rect(29, 10, 1, 12, "D");
  g.text("SKIP", 7, 13, "K", 1);
  // cursor arrow, hovering over it
  g.poly([[21, 16], [21, 28], [24, 25], [26, 30], [28, 29], [26, 24], [30, 24]], "W");
  g.outline("K");
  return { palette: { K: "#0a0d18", S: "#c9d4e6", W: "#ffffff", D: "#7a8299" }, rows: g.rows() };
}

// Tamagotchi, X-eyed. You forgot to feed it.
function tamagotchi() {
  const g = new G(32, 32);
  g.disc(16, 17, 13, "P");                   // egg shell
  g.rect(3, 17, 26, 10, "P");
  g.disc(16, 22, 12, "P");
  g.ring(16, 4, 3, 1.6, "D");                // key ring
  g.rrect(7, 8, 18, 14, 2, "L");             // LCD
  // dead pet: X eyes over a flat mouth
  [[11, 12], [19, 12]].forEach(p => {
    g.line(p[0] - 2, p[1] - 2, p[0] + 2, p[1] + 2, 1, "M");
    g.line(p[0] + 2, p[1] - 2, p[0] - 2, p[1] + 2, 1, "M");
  });
  g.rect(12, 18, 8, 1, "M");
  [10, 16, 22].forEach(x => g.disc(x, 26, 2.2, "D"));    // buttons
  g.outline("K");
  return { palette: { K: "#0a0d18", P: "#ff6fae", L: "#8ea87a", M: "#1a2414", D: "#c9d4e6" }, rows: g.rows() };
}

// The MIDI that starts playing the second the page loads.
function midi() {
  const g = new G(32, 32);
  g.disc(9, 24, 5.4, "C");                   // note head
  g.rect(12, 6, 2.4, 18, "C");               // stem
  g.poly([[14, 6], [22, 10], [22, 16], [14, 12]], "C");  // flag
  for (let i = 1; i <= 3; i++) {             // sound arcs
    for (let a = -55; a <= 55; a += 4) {
      const r = a * Math.PI / 180;
      g.set(21 + Math.cos(r) * (i * 3.4), 12 + Math.sin(r) * (i * 3.4), "W");
    }
  }
  g.outline("K");
  return { palette: { K: "#0a0d18", C: "#54f2ff", W: "#e8ecff" }, rows: g.rows() };
}

// Hampster Dance. One of four frames, looping forever.
function hamster() {
  const g = new G(32, 32);
  g.disc(7, 9, 4.4, "T"); g.disc(25, 9, 4.4, "T");       // ears
  g.disc(7, 9, 2.2, "P"); g.disc(25, 9, 2.2, "P");
  g.disc(16, 17, 10.5, "T");                             // head
  g.disc(11, 22, 5, "W"); g.disc(21, 22, 5, "W");        // cheeks
  g.disc(16, 20, 3.2, "W");
  g.disc(16, 19, 1.8, "P");                              // nose
  g.rect(15, 21, 2, 3, "D");                             // mouth
  g.disc(11, 14, 2.4, "K"); g.disc(21, 14, 2.4, "K");    // eyes
  g.set(10, 13, "W"); g.set(20, 13, "W");
  g.disc(3, 24, 2.8, "T"); g.disc(29, 24, 2.8, "T");     // little arms, up
  g.outline("K");
  return { palette: { K: "#0a0d18", T: "#d8a860", W: "#f5e6c8", P: "#ff9fb8", D: "#8f6a33" }, rows: g.rows() };
}

// --- 1999 BROADBAND --------------------------------------------------------

// Napster's cat: a dark head silhouette in headphones on a blue disc, which
// is how the logo actually read. Drawn as a silhouette because a detailed
// face turns to mud once it is 32px wide and moving.
function napster() {
  const g = new G(32, 32);
  // Band goes down first so the ears and head paint over it — that overlap is
  // what makes it read as headphones worn behind the ears rather than a hoop.
  for (let a = 200; a <= 340; a += 2) {
    const r = a * Math.PI / 180;
    g.disc(16 + Math.cos(r) * 13, 20 + Math.sin(r) * 13, 1.8, "B");
  }
  g.poly([[6, 20], [8, 3], [17, 15]], "S");              // ears
  g.poly([[26, 20], [24, 3], [15, 15]], "S");
  g.poly([[9, 17], [10, 8], [15, 15]], "P");             // inner ears
  g.poly([[23, 17], [22, 8], [17, 15]], "P");
  g.disc(16, 20, 9, "S");                                // head
  g.disc(12, 18, 2, "K"); g.disc(20, 18, 2, "K");        // eyes
  g.set(11, 17, "W"); g.set(19, 17, "W");
  g.poly([[14, 23], [18, 23], [16, 25]], "P");           // nose
  g.rrect(1, 16, 7, 10, 2, "B");                         // ear cups
  g.rrect(24, 16, 7, 10, 2, "B");
  g.rect(3, 19, 3, 4, "D");
  g.rect(26, 19, 3, 4, "D");
  g.outline("K");
  return { palette: { K: "#0a0d18", B: "#2b6ef6", S: "#c9d4e6", P: "#ff9fb8", W: "#ffffff", D: "#12245e" }, rows: g.rows() };
}

// Y2K on a beige CRT, with the crack it never actually caused.
function y2k() {
  const g = new G(32, 32);
  g.rrect(1, 3, 30, 22, 2, "T");             // bezel
  g.rect(3, 5, 26, 16, "K");                 // screen
  g.text("Y2K", 5, 8, "R", 2);
  for (let y = 6; y < 20; y += 3) g.rect(4, y, 24, 1, "L");  // scanlines
  g.rect(12, 25, 8, 3, "T");                 // stand
  g.rect(7, 28, 18, 3, "S");
  g.outline("K");
  return { palette: { K: "#0a0d18", T: "#d8c9a0", S: "#b5a880", R: "#ff3355", L: "#2a1418" }, rows: g.rows() };
}

// Bondi blue iMac G3. The one that dropped the floppy drive.
function imac() {
  const g = new G(32, 32);
  g.rrect(3, 4, 26, 21, 6, "C");             // translucent shell
  g.rrect(4, 24, 24, 5, 2, "C");             // chin
  g.rect(6, 7, 20, 14, "L");                 // screen
  g.rect(7, 8, 18, 3, "B");                  // phosphor glow
  g.rrect(9, 26, 14, 2, 1, "S");             // slot
  g.rect(12, 29, 8, 3, "S");                 // foot
  g.rect(5, 5, 3, 2, "W");                   // highlight
  g.outline("K");
  return { palette: { K: "#0a0d18", C: "#3fb8c8", L: "#0e1a24", B: "#2b6ef6", S: "#c9d4e6", W: "#a8f4ff" }, rows: g.rows() };
}

// --- 2001 SPYWARE ----------------------------------------------------------

// The purple gorilla nobody installed on purpose.
function bonzi() {
  const g = new G(32, 32);
  g.disc(4, 12, 4, "P"); g.disc(28, 12, 4, "P");         // ears
  g.disc(4, 12, 2, "V"); g.disc(28, 12, 2, "V");
  g.disc(16, 14, 10.5, "P");                             // head
  g.disc(16, 21, 7.5, "V");                              // muzzle
  g.disc(11, 11, 3.2, "W"); g.disc(21, 11, 3.2, "W");    // eyes
  g.disc(11.6, 11.4, 1.5, "K"); g.disc(21.6, 11.4, 1.5, "K");
  g.rect(8, 7, 6, 2, "D"); g.rect(19, 7, 6, 2, "D");     // brow
  g.disc(14, 18, 1.2, "K"); g.disc(19, 18, 1.2, "K");    // nostrils
  g.poly([[10, 22], [22, 22], [19, 27], [13, 27]], "K"); // grin
  g.rect(11, 22, 10, 2, "W");                            // teeth
  g.outline("K");
  return { palette: { K: "#0a0d18", P: "#9b5de5", V: "#c9a0ff", W: "#ffffff", D: "#5a2a8f" }, rows: g.rows() };
}

// A browser that is 80% toolbar and 20% web.
function toolbars() {
  const g = new G(32, 32);
  g.rrect(0, 2, 32, 28, 1, "S");
  g.rect(1, 3, 30, 4, "B");                  // title bar
  g.rect(27, 4, 3, 2, "R");
  for (let i = 0; i < 6; i++) {              // six stacked toolbars
    const y = 8 + i * 3;
    g.rect(1, y, 30, 3, i % 2 ? "D" : "S");
    for (let b = 0; b < 5; b++) g.rect(2 + b * 6, y + 1, 3, 1, i % 2 ? "W" : "M");
  }
  g.rect(1, 26, 30, 3, "W");                 // what's left of the page
  g.rect(3, 27, 12, 1, "D");
  g.outline("K");
  return { palette: { K: "#0a0d18", S: "#c9d4e6", D: "#7a8299", W: "#e8ecff", M: "#5a5f78", B: "#2b6ef6", R: "#ff3355" }, rows: g.rows() };
}

// LOVE-LETTER-FOR-YOU.TXT.vbs
function iloveyou() {
  const g = new G(32, 32);
  g.rect(1, 7, 30, 19, "W");                 // envelope
  g.poly([[1, 7], [31, 7], [16, 19]], "S");  // flap
  g.line(1, 26, 12, 16, 1, "D");
  g.line(31, 26, 20, 16, 1, "D");
  g.disc(12, 20, 4.2, "R");                  // heart
  g.disc(20, 20, 4.2, "R");
  g.poly([[8, 21], [24, 21], [16, 30]], "R");
  g.outline("K");
  return { palette: { K: "#0a0d18", W: "#e8ecff", S: "#c9d4e6", D: "#8b8fa8", R: "#ff3355" }, rows: g.rows() };
}

// The Pets.com sock puppet, still holding the mic. Drawn face-on: the brown
// ears and the mic under the chin are what make it read, so they get the room.
function sockpuppet() {
  const g = new G(32, 32);
  g.poly([[3, 3], [11, 8], [9, 23], [1, 16]], "E");      // floppy ears
  g.poly([[27, 3], [30, 16], [22, 23], [20, 8]], "E");
  g.disc(15, 13, 9.5, "W");                              // sock head
  g.rect(6, 13, 19, 9, "W");
  g.disc(15, 21, 8, "W");                                // muzzle
  g.disc(11, 10, 2.6, "K");                              // eyes
  g.disc(19, 10, 2.6, "K");
  g.set(10, 9, "W"); g.set(18, 9, "W");                  // glints
  g.disc(15, 19, 2.8, "K");                              // nose
  g.rect(14, 21, 2, 4, "D");                             // mouth
  g.line(11, 25, 19, 25, 1.6, "D");
  g.line(22, 31, 25, 26, 2.4, "M");                      // mic on its stick
  g.disc(26, 24, 3.4, "S");
  g.disc(26, 24, 1.6, "M");
  g.outline("K");
  return { palette: { K: "#0a0d18", W: "#f0f2ff", E: "#a06a3a", S: "#8b8fa8", D: "#5a5f78", M: "#39405c" }, rows: g.rows() };
}

// --- sludge ----------------------------------------------------------------

// A frameset inside a frameset. Scrollbars all the way down.
function frames() {
  const g = new G(92, 60);
  // every pane: border, title strip, ruled text, scrollbar down the right
  function pane(x, y, w, h) {
    g.rect(x, y, w, h, "K");
    g.rect(x + 1, y + 1, w - 2, h - 2, "W");
    g.rect(x + 1, y + 1, w - 2, 3, "B");
    g.rect(x + w - 5, y + 4, 4, h - 5, "S");            // scrollbar trough
    g.rect(x + w - 5, y + 5, 4, 5, "D");                // thumb
    for (let i = 0; i * 4 + 8 < h; i++) {
      g.rect(x + 3, y + 7 + i * 4, w - 11 - (i % 3) * 4, 1, "D");
    }
  }
  pane(0, 0, 34, 60);
  pane(34, 0, 58, 22);
  pane(34, 22, 30, 38);
  pane(64, 22, 28, 20);
  pane(64, 42, 28, 18);
  return { palette: { K: "#0a0d18", W: "#e8ecff", S: "#c9d4e6", D: "#8b8fa8", B: "#2b6ef6" }, rows: g.rows() };
}

// -------------------------------------------------------------- powerups ---
function norton() {
  const g = new G(32, 32);
  g.poly([[4, 3], [28, 3], [28, 17], [16, 29], [4, 17]], "Y");   // shield
  g.poly([[7, 6], [25, 6], [25, 16], [16, 25], [7, 16]], "K");   // inner
  g.line(11, 14, 15, 19, 3, "Y");                                 // check
  g.line(15, 19, 22, 9, 3, "Y");
  g.outline("K");
  return { palette: { K: "#0a0d18", Y: "#ffcc33" }, rows: g.rows() };
}

function bolt() {
  const g = new G(32, 32);
  g.poly([[19, 2], [26, 2], [19, 13], [26, 13], [11, 30], [14, 17], [7, 17], [15, 2]], "C");
  g.poly([[19, 5], [23, 5], [17, 14], [22, 14], [13, 26], [16, 16], [10, 16], [16, 5]], "W");
  g.outline("K");
  return { palette: { K: "#0a0d18", C: "#2bb8d6", W: "#a8f4ff" }, rows: g.rows() };
}

function floppy() {
  const g = new G(32, 32);
  g.rect(2, 2, 28, 28, "B");
  g.poly([[24, 2], [30, 2], [30, 8]], "D");   // clipped corner
  g.rect(2, 2, 22, 6, "B");
  g.rect(10, 2, 12, 11, "M");                  // shutter
  g.rect(11, 3, 4, 9, "D");
  g.rect(6, 17, 20, 13, "W");                  // label
  g.rect(8, 19, 16, 2, "D");
  g.rect(8, 23, 11, 2, "D");
  g.outline("K");
  return { palette: { K: "#0a0d18", B: "#2b3550", D: "#8b8fa8", M: "#c9d4e6", W: "#e8ecff" }, rows: g.rows() };
}

// A single link in the chain you surf while airborne — two interlocking
// rings, small enough to read as a token rather than an obstacle.
function link() {
  const g = new G(24, 24);
  g.ring(8, 12, 6.4, 2.4, "C");
  g.ring(16, 12, 6.4, 2.4, "C");
  g.ring(8, 12, 6.4, 1, "W");
  g.ring(16, 12, 6.4, 1, "W");
  g.line(5, 8, 7, 6, 1, "W");
  g.line(13, 8, 15, 6, 1, "W");
  g.outline("K");
  return { palette: { K: "#0a0d18", C: "#2b6ef6", W: "#a8e8ff" }, rows: g.rows() };
}

function portal() {
  const g = new G(32, 32);
  g.disc(16, 16, 14, "P");
  g.ring(16, 16, 14, 3, "V");
  g.disc(16, 16, 8, "D");
  g.ring(16, 16, 8, 2, "C");
  // chevron
  g.line(16, 8, 9, 17, 2.6, "W");
  g.line(16, 8, 23, 17, 2.6, "W");
  g.line(16, 14, 9, 23, 2.6, "W");
  g.line(16, 14, 23, 23, 2.6, "W");
  g.outline("K");
  return { palette: { K: "#0a0d18", P: "#4a1f8a", V: "#b07cff", D: "#1a0a33", C: "#54f2ff", W: "#ffffff" }, rows: g.rows() };
}

// ---------------------------------------------------------------- chaser ---
// Clippy, at 40x40 and no longer trying to help. Same nested-U wire as the
// old hazard sprite, scaled up — the read comes from the face: heavy angry
// brows, blown-wide eyes and red pupils. Drawn last so the wire cuts below
// can't erase them.
// Clippy, the chaser. 64x64 — twice the player and the only sprite in the game
// off the 32px grid, because he has to read as a specific character rather
// than a category, and that needs detail the others don't.
//
// The proportions are the whole trick. A paperclip is roughly 1:2.5, narrow
// and tall; drawn wide it stops being a paperclip and becomes an owl, which is
// exactly what the first pass at 40px did. The eyes are deliberately wider
// than the wire and sit over the top bend — that overhang is the single most
// recognisable thing about him. Brows float free above, bent wire, angled
// down toward the middle for the menace.
function clippy() {
  const g = new G(64, 64);
  const T = 4;                               // wire gauge
  // Screen coords, so +90deg is down and -90deg is up.
  const arc = (cx, cy, r, a0, a1) => {
    const steps = Math.ceil(Math.abs(a1 - a0) * r / 40) + 10;
    for (let i = 0; i <= steps; i++) {
      const a = (a0 + (a1 - a0) * i / steps) * Math.PI / 180;
      g.disc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, T / 2, "M");
    }
  };
  // One continuous wire folded the way a real paperclip is: down the outside,
  // round the bottom, up the far side, over the top, back down inside, round
  // the small bottom loop and up to the free end. Folding it properly is what
  // stops it being two symmetric arches — the offset top loop is the whole
  // difference between "paperclip" and "owl".
  g.line(16, 18, 16, 40, T, "M");            // outer left leg
  arc(30, 40, 14, 180, 0);                   // outer bottom, through the base
  g.line(44, 40, 44, 14, T, "M");            // outer right leg
  arc(36, 14, 8, 0, -180);                   // top loop, offset right
  g.line(28, 14, 28, 36, T, "M");            // back down inside
  arc(33, 36, 5, 180, 0);                    // small inner bottom loop
  g.line(38, 36, 38, 22, T, "M");            // free end
  // Eyes are tall ovals, not circles, and both pupils cut to the same side in
  // a sidelong glance. Two symmetric circles staring straight out is an owl no
  // matter what you hang underneath them; breaking the symmetry is what makes
  // this read as a thing wearing eyes rather than a face.
  const eye = (cx, cy, rx, ry, c) => {
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++)
      for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
        const dx = (x - cx) / rx, dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1) g.set(x, y, c);
      }
  };
  eye(23, 18, 7.5, 9, "W"); eye(41, 18, 7.5, 9, "W");
  g.disc(20.5, 20, 3.8, "K"); g.disc(38.5, 20, 3.8, "K");
  g.set(19, 18, "W"); g.set(37, 18, "W");    // catchlights

  // Re-lay the outer wire over the eyes so it crosses in front of them: the
  // clip is the object and the eyes are stuck to it, not the other way round.
  g.line(16, 18, 16, 40, T, "M");
  arc(36, 14, 8, 0, -180);
  g.line(44, 14, 44, 26, T, "M");

  // shade the left of the wire so it reads as round rather than flat
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    if (g.get(x, y) === "M" && g.get(x - 1, y) === ".") g.set(x, y, "D");
  }
  // Brows: thin, short, and kept inside the eyes' own width. Sweep them up and
  // outward instead and they stop being brows and become ear tufts.
  g.line(18, 5, 28, 9, 2.5, "M");
  g.line(46, 5, 36, 9, 2.5, "M");
  g.outline("K");
  return { palette: { K: "#0a0d18", M: "#c9d4e6", D: "#7a8299", W: "#ffffff" }, rows: g.rows() };
}

// ------------------------------------------------------------- mini icons ---
function miniFloppy() {
  const g = new G(11, 11);
  g.rect(0, 0, 11, 11, "B");
  g.rect(3, 0, 5, 5, "M");
  g.rect(4, 1, 2, 3, "D");
  g.rect(2, 6, 7, 5, "W");
  g.rect(3, 7, 5, 1, "D");
  g.outline("K");
  return { palette: { K: "#0a0d18", B: "#2b3550", D: "#8b8fa8", M: "#c9d4e6", W: "#e8ecff" }, rows: g.rows() };
}

// -------------------------------------------------------------------------
// nine board angles, 15 degrees apart, pose4 = straight down; each also
// gets a crouched variant used while tucking
const POSES = {};
for (let i = 0; i < 9; i++) {
  POSES["pose" + i] = player(-60 + i * 15, false);
  POSES["tuck" + i] = player(-60 + i * 15, true);
}

const SPRITES = {
  ...POSES,
  // hazards: small, dead services and software — these cost you a life
  netscape: netscape(), aol: aol(), icq: icq(), winamp: winamp(),
  notfound: notfound(), msn: msn(), ie: ie(),
  bsod: bsod(), java: java(), hitcounter: hitcounter(),
  modem: modem(), phone: phone(), guestbook: guestbook(), jeeves: jeeves(),
  toaster: toaster(), hourglass: hourglass(), skipintro: skipintro(),
  tamagotchi: tamagotchi(), midi: midi(), hamster: hamster(),
  napster: napster(), y2k: y2k(), imac: imac(), bonzi: bonzi(),
  toolbars: toolbars(), iloveyou: iloveyou(), sockpuppet: sockpuppet(),
  // sludge: big, harmless, and it kills your speed
  popupstorm: popupstorm(), glitch: glitch(), construction: construction(),
  frames: frames(),
  // pickups + chaser
  norton: norton(), bolt: bolt(), floppy: floppy(), portal: portal(),
  link: link(), clippy: clippy(), life: miniFloppy()
};

const LABELS = {
  netscape: "NETSCAPE CRASH", aol: "AOL FREE TRIAL", icq: "UH OH!",
  winamp: "IT WHIPS THE LLAMA", notfound: "404 NOT FOUND",
 msn: "MSN MESSENGER",
  ie: "INTERNET EXPLORER", bsod: "BLUE SCREEN", java: "JAVA APPLET",
  hitcounter: "YOU ARE VISITOR 4201",
  modem: "NO CARRIER", phone: "MOM PICKED UP THE PHONE",
  guestbook: "SIGN MY GUESTBOOK", jeeves: "ASK JEEVES",
  toaster: "FLYING TOASTERS", hourglass: "STILL LOADING",
  skipintro: "SKIP INTRO", tamagotchi: "IT DIED",
  midi: "AUTOPLAYING MIDI", hamster: "HAMPSTER DANCE",
  napster: "SHARING IS CARING", y2k: "Y2K BUG", imac: "BONDI BLUE",
  bonzi: "BONZI BUDDY", toolbars: "SIX TOOLBARS", iloveyou: "ILOVEYOU",
  sockpuppet: "PETS.COM",
  popupstorm: "POPUP STORM", glitch: "SIGNAL CORRUPTED",
  construction: "UNDER CONSTRUCTION", frames: "NESTED FRAMESET",
  norton: "NORTON SHIELD", bolt: "BROADBAND", floppy: "SAVED",
  portal: "HYPERLINK JUMP", clippy: "CLIPPY"
};

let out = "  var SPRITES = {\n";
const keys = Object.keys(SPRITES);
keys.forEach((k, ki) => {
  const s = SPRITES[k];
  out += "    " + k + ": {\n";
  if (LABELS[k]) out += "      label: " + JSON.stringify(LABELS[k]) + ",\n";
  out += "      palette: { " + Object.keys(s.palette).map(c => c + ': "' + s.palette[c] + '"').join(", ") + " },\n";
  out += "      rows: [\n";
  out += s.rows.map(r => '        "' + r + '"').join(",\n") + "\n";
  out += "      ]\n";
  out += "    }" + (ki < keys.length - 1 ? "," : "") + "\n";
});
out += "  };\n";

require("fs").writeFileSync(process.argv[2] || "/dev/stdout", out);

// sanity: every row equal length, and report ink coverage
keys.forEach(k => {
  const rows = SPRITES[k].rows;
  const bad = rows.filter(r => r.length !== rows[0].length).length;
  const ink = rows.join("").split("").filter(c => c !== ".").length;
  console.error(k.padEnd(14), rows[0].length + "x" + rows.length,
    bad ? "BAD ROWS " + bad : "ok", "ink " + Math.round(100 * ink / (rows[0].length * rows.length)) + "%");
});
