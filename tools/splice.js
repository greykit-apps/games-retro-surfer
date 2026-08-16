#!/usr/bin/env node
/*
 * Regenerates the art and drops it into retro-surfer.js in place, replacing
 * the whole `var SPRITES = { ... };` block. Beats pasting 2000 lines by hand.
 *
 *   node tools/splice.js
 *
 * Run tools/check-sprites.js afterwards — this does no validation of its own.
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const target = path.join(root, "retro-surfer.js");
const tmp = path.join(require("os").tmpdir(), "retro-sprites-" + process.pid + ".txt");

execFileSync("node", [path.join(__dirname, "gen-sprites.js"), tmp], { stdio: ["ignore", "ignore", "inherit"] });
const block = fs.readFileSync(tmp, "utf8");
fs.unlinkSync(tmp);

const src = fs.readFileSync(target, "utf8");
const start = src.indexOf("  var SPRITES = {\n");
if (start < 0) throw new Error("could not find the SPRITES block");
const end = src.indexOf("\n  };\n", start);
if (end < 0) throw new Error("SPRITES block has no closing brace at the expected indent");

fs.writeFileSync(target, src.slice(0, start) + block + src.slice(end + "\n  };\n".length));
console.log(`spliced ${block.split("\n").length} lines into retro-surfer.js`);
