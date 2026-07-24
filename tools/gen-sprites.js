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

function icq() {
  const g = new G(32, 32);
  // antenna
  g.line(16, 12, 16, 3, 1.6, "G");
  g.disc(16, 2.5, 2, "R");
  // four petals
  [[10, 14], [22, 14], [10, 24], [22, 24]].forEach(p => g.disc(p[0], p[1], 5.6, "G"));
  g.disc(16, 19, 6.5, "G");
  g.disc(16, 19, 3, "W");
  g.disc(16, 19, 1.6, "D");
  g.outline("K");
  return { palette: { K: "#0a0d18", G: "#3ddc4a", D: "#1b7a2a", W: "#eafff0", R: "#ff3355" }, rows: g.rows() };
}

function winamp() {
  const g = new G(32, 32);
  g.rrect(0, 4, 32, 24, 2, "D");
  g.rect(1, 5, 30, 4, "T");            // title bar
  g.rect(27, 6, 2, 2, "R");
  g.rect(24, 6, 2, 2, "Y");
  g.rect(2, 11, 13, 9, "L");           // LCD
  g.text("MP3", 3, 13, "G", 1);
  // EQ bars
  const hts = [3, 6, 4, 8, 5, 7, 3, 6];
  hts.forEach((h, i) => g.rect(17 + i * 2, 20 - h, 1, h, "G"));
  g.rect(2, 22, 28, 2, "S");           // seek bar
  g.rect(4, 21, 3, 4, "Y");
  g.outline("K");
  return { palette: { K: "#0a0d18", D: "#39405c", T: "#6a76a0", L: "#0d2417", G: "#39ff14", Y: "#ffcc33", R: "#ff3355", S: "#20263a" }, rows: g.rows() };
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
        : r < 0.82 ? "C" : r < 0.9 ? "G" : "W";
      g.rect(x, y, bw, bh, c);
      x += bw;
    }
    y += bh;
  }
  // scan tears
  for (let i = 0; i < 5; i++) {
    g.rect(0, rnd() * 58 | 0, 88, 1 + (rnd() * 2 | 0), rnd() < 0.5 ? "W" : "K");
  }
  return { palette: { K: "#0a0d18", D: "#1c2450", M: "#ff3ce0", C: "#54f2ff", G: "#39ff14", W: "#e8ecff" }, rows: g.rows() };
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

function clippy() {
  const g = new G(32, 32);
  // paperclip: outer loop, inner loop
  g.ring(16, 17, 11, 2.4, "M");
  g.rect(5, 2, 22, 14, ".");           // cut the tops off to make U shapes
  g.line(5, 6, 5, 17, 2.4, "M");
  g.line(27, 6, 27, 17, 2.4, "M");
  g.line(5, 6, 16, 6, 2.4, "M");       // top bend
  g.ring(16, 18, 5.5, 2.4, "M");
  g.rect(9, 4, 14, 14, ".");
  g.line(11, 12, 11, 18, 2.4, "M");
  g.line(21, 9, 21, 18, 2.4, "M");
  g.line(11, 12, 21, 12, 2.4, "M");
  // eyes
  g.disc(12, 9, 3.4, "W"); g.disc(21, 9, 3.4, "W");
  g.disc(12.6, 9.4, 1.5, "K"); g.disc(21.6, 9.4, 1.5, "K");
  g.outline("K");
  return { palette: { K: "#0a0d18", M: "#c9d4e6", W: "#ffffff" }, rows: g.rows() };
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
  g.text("004201", 4, 13, "G", 1);
  g.rect(3, 9, 26, 1, "S");
  for (let i = 1; i < 6; i++) g.rect(3 + i * 4 + 2, 9, 1, 14, "S");
  g.outline("K");
  return { palette: { K: "#0a0d18", D: "#0d1a10", G: "#39ff14", S: "#2b3550" }, rows: g.rows() };
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
function cookie() {
  const g = new G(40, 40);
  // virus spikes
  for (let i = 0; i < 10; i++) {
    const a = i * Math.PI * 2 / 10 + 0.3;
    const x0 = 20 + Math.cos(a) * 15, y0 = 20 + Math.sin(a) * 15;
    const x1 = 20 + Math.cos(a) * 19, y1 = 20 + Math.sin(a) * 19;
    g.line(x0, y0, x1, y1, 2, "V");
    g.disc(x1, y1, 1.8, "V");
  }
  g.disc(20, 20, 16, "T");            // cookie
  g.ring(20, 20, 16, 2, "D");
  // chips
  [[11, 12], [28, 11], [9, 24], [30, 25], [20, 31], [24, 18]].forEach(p => g.disc(p[0], p[1], 2.4, "M"));
  // eyes
  g.disc(14, 16, 4.4, "W"); g.disc(26, 16, 4.4, "W");
  g.disc(14.8, 16.6, 2.2, "R"); g.disc(26.8, 16.6, 2.2, "R");
  g.disc(15.2, 17, 1, "K"); g.disc(27.2, 17, 1, "K");
  // fanged mouth
  g.poly([[11, 25], [29, 25], [27, 31], [23, 27], [20, 32], [17, 27], [13, 31]], "K");
  g.poly([[13, 25], [16, 25], [15, 28]], "W");
  g.poly([[19, 25], [22, 25], [20.5, 29]], "W");
  g.poly([[25, 25], [28, 25], [26, 28]], "W");
  g.outline("K");
  return { palette: { K: "#0a0d18", T: "#d9963f", D: "#8c5a1c", M: "#4a2a10", W: "#ffffff", R: "#ff3355", V: "#b07cff" }, rows: g.rows() };
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
  notfound: notfound(), clippy: clippy(), msn: msn(), ie: ie(),
  bsod: bsod(), java: java(), hitcounter: hitcounter(),
  // sludge: big, harmless, and it kills your speed
  popupstorm: popupstorm(), glitch: glitch(), construction: construction(),
  // pickups + chaser
  norton: norton(), bolt: bolt(), floppy: floppy(), portal: portal(),
  link: link(), cookie: cookie(), life: miniFloppy()
};

const LABELS = {
  netscape: "NETSCAPE CRASH", aol: "AOL FREE TRIAL", icq: "UH OH!",
  winamp: "IT WHIPS THE LLAMA", notfound: "404 NOT FOUND",
  clippy: "IT LOOKS LIKE A CRASH", msn: "MSN MESSENGER",
  ie: "INTERNET EXPLORER", bsod: "BLUE SCREEN", java: "JAVA APPLET",
  hitcounter: "YOU ARE VISITOR 4201",
  popupstorm: "POPUP STORM", glitch: "SIGNAL CORRUPTED",
  construction: "UNDER CONSTRUCTION",
  norton: "NORTON SHIELD", bolt: "BROADBAND", floppy: "SAVED",
  portal: "HYPERLINK JUMP", cookie: "COOKIEMONSTER"
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
