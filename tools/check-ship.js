#!/usr/bin/env node
/*
 * Fails when index.html loads a local file the deploy doesn't ship.
 *
 *   node tools/check-ship.js
 *
 * The deploy job rsyncs an explicit list of files, so a script added to the
 * page but not to that list deploys green and then 404s: on 2026-10-20 the
 * integrated intro added gk-intro.js and music.js, the list wasn't touched,
 * and the live game was a black screen ("injectIntroCSS is not defined").
 *
 * Reads .gitlab-ci.yml as text rather than parsing YAML (no dependencies):
 * the file names on the `puma_rsync` line, and the deploy job's
 * `artifacts: paths:`. Every local src/href in index.html must appear in
 * both, and every shipped file must exist (version.json is written by the
 * job itself).
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const ci = fs.readFileSync(path.join(root, ".gitlab-ci.yml"), "utf8");
const GENERATED = new Set(["version.json"]);
const errors = [];

// Local references: src= / href= that aren't a URL, data:, mailto: or a #fragment.
const refs = new Set();
for (const m of html.matchAll(/\b(?:src|href)="([^"]+)"/g)) {
  const ref = m[1].replace(/[?#].*$/, "");
  if (!ref || /^[a-z][a-z0-9+.-]*:|^\/\//i.test(m[1]) || m[1].startsWith("#")) continue;
  refs.add(ref);
}

// The rsync list: bare file names on the puma_rsync line (not options, not the
// $USER@$HOST:dest target).
const rsyncLine = ci.split("\n").find((l) => /^\s*- puma_rsync\b/.test(l));
const rsync = new Set(
  rsyncLine
    ? rsyncLine.replace(/"[^"]*"/g, "").split(/\s+/).filter((t) => /^[\w][\w./-]*\.\w+$/.test(t))
    : []
);

// The deploy job's artifacts: paths: list.
const art = /\n {2}artifacts:\n {4}paths:\n((?: {6}- .*\n)+)/.exec(ci);
const artifacts = new Set(art ? [...art[1].matchAll(/- (\S+)/g)].map((m) => m[1]) : []);

/* A check that checks nothing must never read as a pass. */
if (refs.size === 0) errors.push("index.html references no local files -- refusing to pass vacuously");
if (rsync.size === 0) errors.push("no file list found on a `- puma_rsync` line in .gitlab-ci.yml");
if (artifacts.size === 0) errors.push("no `artifacts: paths:` list found in .gitlab-ci.yml");

for (const ref of refs) {
  if (!rsync.has(ref)) errors.push(`index.html loads ${ref}, which the rsync list doesn't ship`);
  if (!artifacts.has(ref)) errors.push(`index.html loads ${ref}, which artifacts: paths: leaves out`);
}
for (const f of new Set([...rsync, ...artifacts])) {
  if (!GENERATED.has(f) && !fs.existsSync(path.join(root, f))) errors.push(`.gitlab-ci.yml ships ${f}, which is not in the repo`);
}

if (errors.length) {
  for (const e of errors) console.error(`  error: ${e}`);
  process.exit(1);
}
console.log(`ship list covers all ${refs.size} local file(s) index.html loads`);
