#!/usr/bin/env node
/*
 * Integrity check for retro-surfer.js. The game is one file of hand-editable
 * character-grid art, so the failure modes are all data-shaped: a row that
 * lost a character, a colour that isn't in the palette, a sprite nothing can
 * ever spawn. Those don't throw — they just render wrong — so check them here.
 *
 *   node tools/check-sprites.js [path]
 *
 * Parses the source rather than importing it: retro-surfer.js is a browser
 * IIFE that touches window and document on load.
 */
const fs = require("fs");

const file = process.argv[2] || require("path").join(__dirname, "..", "retro-surfer.js");
const src = fs.readFileSync(file, "utf8");
const errors = [];
const warnings = [];

// --- sprites -------------------------------------------------------------
const sprites = {};
const blockRe = /^ {4}(\w+): \{\n([\s\S]*?)^ {4}\},?$/gm;
let m;
while ((m = blockRe.exec(src)) !== null) {
  const name = m[1];
  const body = m[2];
  const rows = [...body.matchAll(/^ {8}"(.*)"/gm)].map((r) => r[1]);
  const palRaw = /palette: \{([^}]*)\}/.exec(body);
  const palette = new Set();
  if (palRaw) {
    for (const p of palRaw[1].matchAll(/(\w+):/g)) palette.add(p[1]);
  }
  const colours = palRaw ? [...palRaw[1].matchAll(/"(#[0-9a-fA-F]{6})"/g)].map((c) => c[1]) : [];
  sprites[name] = { rows, palette, colours, hasLabel: /label:/.test(body) };
}

// --- the pickup green is reserved --------------------------------------
// Anything drawn in a bright green reads as "grab me" at speed, whatever
// shape it is. Only pickups may use the band; a hazard that wants green has
// to go dark (ICQ's offline red, Winamp's dim analyser base) or pick another
// hue. Hue 80-160 at decent saturation and mid lightness — wide enough to
// catch a near-miss like #3ddc4a, narrow enough to leave cyan and olive be.
function hsl(h) {
  const r = parseInt(h.slice(1, 3), 16) / 255;
  const g = parseInt(h.slice(3, 5), 16) / 255;
  const b = parseInt(h.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let hue = 0;
  if (d !== 0) {
    if (max === r) hue = 60 * (((g - b) / d) % 6);
    else if (max === g) hue = 60 * ((b - r) / d + 2);
    else hue = 60 * ((r - g) / d + 4);
  }
  return { h: (hue + 360) % 360, s, l };
}

function isReservedGreen(hex) {
  const c = hsl(hex);
  return c.h >= 80 && c.h <= 160 && c.s >= 0.5 && c.l >= 0.34 && c.l <= 0.78;
}

const names = Object.keys(sprites);
if (names.length < 20) errors.push(`only found ${names.length} sprites — parser or file layout changed`);

for (const [name, s] of Object.entries(sprites)) {
  if (!s.rows.length) { errors.push(`${name}: no rows`); continue; }
  const w = s.rows[0].length;
  s.rows.forEach((row, i) => {
    if (row.length !== w) {
      errors.push(`${name}: row ${i} is ${row.length} chars, expected ${w}`);
    }
    for (const ch of new Set(row)) {
      if (ch !== "." && !s.palette.has(ch)) {
        errors.push(`${name}: row ${i} uses '${ch}', which is not in its palette`);
      }
    }
  });
  const ink = s.rows.join("").split("").filter((c) => c !== ".").length;
  if (ink === 0) errors.push(`${name}: completely empty`);
}

// --- everything the game references must exist ---------------------------
function refs(re) {
  const out = new Set();
  for (const hit of src.matchAll(re)) {
    for (const k of hit[1].matchAll(/"(\w+)"/g)) out.add(k[1]);
  }
  return out;
}

const zoneKeys = new Set([
  ...refs(/hazards: \[([\s\S]*?)\]/g),
  ...refs(/sludge: \[([\s\S]*?)\]/g)
]);
const poseKeys = refs(/var POSE = \[([\s\S]*?)\]/g);
const tuckKeys = refs(/var TUCK = \[([\s\S]*?)\]/g);
const powerKeys = new Set([...src.matchAll(/\{ key: "(\w+)", kind:/g)].map((h) => h[1]));
const extraKeys = new Set(["clippy", "life", "link"]);

for (const [label, keys] of [["zone pool", zoneKeys], ["POSE", poseKeys],
  ["TUCK", tuckKeys], ["POWERUPS", powerKeys]]) {
  for (const k of keys) {
    if (!sprites[k]) errors.push(`${label} references "${k}", which has no sprite`);
  }
}
for (const k of extraKeys) {
  if (!sprites[k]) errors.push(`game references "${k}", which has no sprite`);
}

if (poseKeys.size < 3) errors.push("POSE list looks wrong — fewer than 3 board angles");
if (tuckKeys.size !== poseKeys.size) {
  errors.push(`TUCK has ${tuckKeys.size} entries but POSE has ${poseKeys.size} — every board angle needs a crouched variant`);
}

// --- and everything that exists should be reachable -----------------------
const reachable = new Set([...zoneKeys, ...poseKeys, ...tuckKeys, ...powerKeys, ...extraKeys]);
for (const name of names) {
  if (!reachable.has(name)) warnings.push(`${name} is defined but nothing can ever spawn it`);
}

// hazards and sludge surface their label in a toast when you hit them
for (const k of zoneKeys) {
  if (sprites[k] && !sprites[k].hasLabel) warnings.push(`${k} has no label — its toast will be blank`);
}

// nothing that can hurt you may wear the pickup's green
for (const k of zoneKeys) {
  if (!sprites[k]) continue;
  for (const c of sprites[k].colours) {
    if (isReservedGreen(c)) {
      errors.push(`${k} uses ${c}, which is inside the reserved pickup green — ` +
        "hazards and sludge in that band read as things to collect");
    }
  }
}

// --- report ---------------------------------------------------------------
console.log(`checked ${names.length} sprites in ${require("path").basename(file)}`);
warnings.forEach((w) => console.log(`  warning: ${w}`));
if (errors.length) {
  errors.forEach((e) => console.error(`  error:   ${e}`));
  console.error(`\n${errors.length} error(s)`);
  process.exit(1);
}
console.log(`  ok — ${zoneKeys.size} spawnable obstacles, ${poseKeys.size} board angles (+${tuckKeys.size} crouched), no orphans`);
