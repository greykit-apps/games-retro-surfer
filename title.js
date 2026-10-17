/* Retro Surfer '96 -- the standalone page around the game.
 *
 * The greykit.games boot (the canon @gk-title block, games-meta STANDARD.md
 * §3), then a title of the game's own in dark glass, after Raid on Puma Bay
 * and Airborne Puma: the slope scrolling behind it with the puma carving down
 * and Clippy on its tail, the name in the game's own pixel face, the menu
 * (New game; Settings, Help, About) and the §1 credit. Then the game, mounted
 * from retro-surfer.js and started past its own canvas title.
 *
 * greykit.com's Konami egg loads retro-surfer.js alone and never sees any of
 * this; everything here reaches the game through its public API. */
"use strict";
(() => {
  const RS = window.RetroSurfer, A = RS.art;
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const CREDIT = 'Built by <a href="https://greykit.com/" target="_blank" rel="noopener">greykit.com</a>';
  /* the game's own key predates the <game>_<feature>_v<n> pattern; every key
     this page keeps starts the same way, so Forget everything finds them all */
  const PREFIX = "retroSurfer", KEY_HIGH = "retroSurferHighScore", KEY_MUTED = "retroSurfer_muted_v1";
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* no storage */ } }
  };
  const best = () => parseInt(store.get(KEY_HIGH), 10) || 0;
  const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const TOUCH = navigator.maxTouchPoints > 0 || "ontouchstart" in window;
  const pick = a => a[Math.random() * a.length | 0];

  let mode = "boot";            /* boot | title | play */
  let game = null, sheet = null;
  let muted = store.get(KEY_MUTED) === "1";

  /* ---- sound ---- */
  function syncSound() {
    const b = $("snd");
    b.setAttribute("aria-pressed", String(!muted));
    b.classList.toggle("muted", muted);
  }
  function setMuted(m) {
    muted = m;
    store.set(KEY_MUTED, m ? "1" : "0");
    if (game) game.setMuted(m);
    syncSound();
    if (mode === "play") flashHint(m ? "Sound off" : "Sound on");
    if (sheet && sheet.refresh) sheet.refresh();
  }

  /* ---- the name, in the game's own 3x5 face at a whole-pixel scale ---- */
  function drawMark() {
    const cv = document.querySelector(".rs-mark canvas"), g = cv.getContext("2d");
    const w = A.textWidth("SURFER '96", 1), narrow = innerWidth < 760;
    const want = narrow ? innerWidth - 48 : Math.min(innerWidth * 0.34, 440);
    const p = Math.max(4, Math.floor(want / w));
    cv.width = w; cv.height = 12;
    cv.style.width = w * p + "px"; cv.style.height = 12 * p + "px";
    g.clearRect(0, 0, w, 12);
    A.drawText(g, "RETRO", narrow ? Math.floor((w - A.textWidth("RETRO", 1)) / 2) : 0, 0, "#54f2ff", 1);
    A.drawText(g, "SURFER", 0, 7, "#54f2ff", 1);
    A.drawText(g, "'96", A.textWidth("SURFER ", 1) + 1, 7, "#ff9f1c", 1);
  }

  /* the four pickups, glowing, at the foot of the menu: the rule the canvas
     title used to teach before the first run */
  const GREENS = ["norton", "bolt", "portal", "floppy"];
  function drawGreens(t) {
    const cv = $("greens"), g = cv.getContext("2d");
    if (cv.width !== 144) { cv.width = 144; cv.height = 36; }
    g.clearRect(0, 0, 144, 36);
    GREENS.forEach((k, i) => A.drawPickup(g, k, 2 + i * 36, 2, t * 5 + i));
  }

  /* ---- the slope behind the title ----
   * The game's world as an attract loop, in world pixels at a whole multiple
   * of the screen's: the eras' grid and motes, junk rising past, a puma
   * weaving down a path it can always see coming, grabbing the green, and
   * Clippy hanging on behind. Nothing here is the game's logic; it only
   * borrows the art. */
  const ZS = A.ZONES, SPEED = 150;
  const POP = { norton: "SHIELD", bolt: "TURBO", portal: "LINKS", floppy: "+1 LIFE" };
  const S = { cv: null, g: null, k: 2, w: 0, h: 0, cx: 0, amp: 0, ry: 0, t: 0, dist: 0,
    era: 0, eraT: 0, bg: ZS[0].bg.slice(), grid: ZS[0].grid.slice(), mote: ZS[0].mote.slice(),
    gap: 120, things: [], pops: [], next: 0, clipX: 0, raf: 0, last: 0 };
  const rgb = a => "rgb(" + (a[0] | 0) + "," + (a[1] | 0) + "," + (a[2] | 0) + ")";
  const ease = (cur, tgt, k) => { for (let i = 0; i < 3; i++) cur[i] += (tgt[i] - cur[i]) * k; };
  const riderX = t => S.cx + S.amp * (Math.sin(t * 0.55) * 0.75 + Math.sin(t * 1.37 + 1) * 0.25);

  function sizeScene() {
    S.cv = document.querySelector(".rs-scene");
    S.k = Math.max(2, Math.round(innerHeight / 330));
    S.w = Math.ceil(innerWidth / S.k); S.h = Math.ceil(innerHeight / S.k);
    S.cv.width = S.w; S.cv.height = S.h;
    S.g = S.cv.getContext("2d"); S.g.imageSmoothingEnabled = false;
    const wide = innerWidth >= 760;
    S.cx = Math.round(S.w * (wide ? 0.7 : 0.5));
    S.amp = Math.min(S.w * (wide ? 0.13 : 0.3), 64);
    /* a phone stacks the name and the menu down the middle: the puma rides
       below them there, with Clippy peeking out under the glass */
    S.ry = Math.round(S.h * (wide ? 0.44 : 0.86));
    S.gap = wide ? 120 : 84;
    if (!S.clipX) S.clipX = S.cx;
  }

  /* will a thing of this size at x clear the rider all the way past? */
  function clears(x, w, y, h) {
    const t0 = (y + h / 2 - S.ry - (h / 2 + 18)) / SPEED, t1 = (y + h / 2 - S.ry + (h / 2 + 18)) / SPEED;
    for (let i = 0; i <= 6; i++) {
      if (Math.abs(x + w / 2 - riderX(S.t + t0 + (t1 - t0) * i / 6)) < w / 2 + 22) return false;
    }
    return !S.things.some(o => o.y > S.h - 100 && x < o.x + o.w + 6 && o.x < x + w + 6 && y < o.y + o.h + 6);
  }
  function spawn() {
    const z = ZS[S.era], r = Math.random();
    const kind = r < 0.14 ? "green" : r < 0.32 ? "sludge" : "hazard";
    const key = kind === "green" ? pick(GREENS) : kind === "sludge" ? pick(z.sludge) : pick(z.hazards);
    const sp = RS.sprites[key], w = sp.rows[0].length, h = sp.rows.length, y = S.h + 4;
    if (kind === "green") {
      /* the green sits on the line, so the puma takes it */
      const x = Math.round(riderX(S.t + (y + h / 2 - S.ry) / SPEED) - w / 2);
      if (!S.things.some(o => o.y > S.h - 60)) S.things.push({ key, kind, x, y, w, h, bob: Math.random() * 6 });
      return;
    }
    for (let i = 0; i < 10; i++) {
      const x = Math.round(-w * 0.3 + Math.random() * (S.w - w * 0.4));
      if (clears(x, w, y, h)) { S.things.push({ key, kind, x, y, w, h, bob: 0 }); return; }
    }
  }
  function step(dt) {
    S.t += dt; S.dist += SPEED * dt;
    if ((S.eraT += dt) > 11) { S.eraT = 0; S.era = (S.era + 1) % ZS.length; }
    const z = ZS[S.era], k = Math.min(1, dt * 1.5);
    ease(S.bg, z.bg, k); ease(S.grid, z.grid, k); ease(S.mote, z.mote, k);
    const rx = riderX(S.t);
    S.clipX += (rx - S.clipX) * Math.min(1, dt * 1.1);
    for (const o of S.things) o.y -= SPEED * dt;
    S.things = S.things.filter(o => {
      if (o.y + o.h < -8) return false;
      if (o.kind === "green" && Math.abs(o.x + o.w / 2 - rx) < 20 && Math.abs(o.y + o.h / 2 - S.ry) < 16) {
        S.pops.push({ text: POP[o.key], x: rx, y: S.ry - 26, life: 0.9 });
        return false;
      }
      return true;
    });
    for (const p of S.pops) { p.y -= 26 * dt; p.life -= dt; }
    S.pops = S.pops.filter(p => p.life > 0);
    S.next -= SPEED * dt;
    while (S.next <= 0) { spawn(); S.next += 44 + Math.random() * 40; }
  }
  function drawScene() {
    const g = S.g;
    g.fillStyle = rgb(S.bg); g.fillRect(0, 0, S.w, S.h);
    /* the grid and the motes rise with the junk: the slope runs up the screen */
    g.fillStyle = rgb(S.grid);
    for (let y = -(S.dist % 40); y < S.h; y += 40) g.fillRect(0, Math.round(y), S.w, 1);
    for (let x = 0; x < S.w; x += 40) g.fillRect(x, 0, 1, S.h);
    g.fillStyle = rgb(S.mote);
    for (let i = 0; i < 60; i++) {
      const sx = (i * 97) % S.w, sy = (i * 149 + S.dist * (0.6 + (i % 3) * 0.25)) % S.h;
      g.fillRect(sx, S.h - Math.round(sy), 2, Math.round(5 * (0.6 + (i % 3) * 0.2)));
    }
    for (const kind of ["sludge", "hazard"]) for (const o of S.things) if (o.kind === kind) A.drawSprite(g, o.key, o.x, o.y);
    for (const o of S.things) if (o.kind === "green") A.drawPickup(g, o.key, o.x, o.y + Math.sin(S.t * 6 + o.bob) * 2, S.t * 5 + o.bob);
    /* the puma: the pose from the way the path is heading, tucked when it runs straight */
    const rx = riderX(S.t), vx = (riderX(S.t + 0.05) - rx) / 0.05;
    const lean = Math.max(-60, Math.min(60, Math.atan2(vx, SPEED) * 180 / Math.PI));
    const pose = Math.round((lean + 60) / 15);
    A.drawSprite(g, (Math.abs(lean) < 9 ? "tuck" : "pose") + pose, rx - 16, S.ry - 16);
    const cy = S.ry - S.gap + Math.sin(S.t * 2.2) * 4;
    if (cy > -40) A.drawSprite(g, "clippy", S.clipX - 32, cy - 32);
    for (const p of S.pops) {
      g.globalAlpha = Math.max(0, Math.min(1, p.life * 2.2));
      A.drawText(g, p.text, Math.round(p.x - A.textWidth(p.text, 1) / 2), Math.round(p.y), A.GOOD, 1);
      g.globalAlpha = 1;
    }
  }
  function frame(now) {
    S.raf = 0;
    if (mode !== "title" || document.hidden) return;
    const dt = Math.min(0.05, (now - (S.last || now)) / 1000);
    S.last = now;
    step(dt); drawScene(); drawGreens(S.t);
    S.raf = requestAnimationFrame(frame);
  }
  function startScene() {
    if (S.raf) return;
    S.last = 0;
    /* one frame now, so the title never shows an empty slope while it waits
       for the first animation frame (a background tab may not get one) */
    drawScene(); drawGreens(S.t);
    if (!still()) S.raf = requestAnimationFrame(frame);
  }
  function stopScene() { cancelAnimationFrame(S.raf); S.raf = 0; }
  document.addEventListener("visibilitychange", () => { if (!document.hidden && mode === "title") startScene(); });

  /* ---- the title ---- */
  const menu = () => document.querySelector("#title .rs-menu");
  function openTitle() {
    mode = "title";
    $("play").hidden = true; $("title").hidden = false;
    const b = best();
    $("best").textContent = b ? "Best " + b.toLocaleString("en-US") + " KB" : "";
    drawMark(); drawGreens(S.t);
    startScene();
  }
  function revealTitle(print) {
    const t = $("title");
    t.classList.remove("rs-print");
    void t.offsetWidth;
    if (print) t.classList.add("rs-print");
    t.querySelector(".dflt").focus({ preventScroll: true });
  }
  function act(a) {
    if (a === "new") return newGame();
    if (a === "settings") return settings();
    if (a === "help") return help();
    if (a === "about") return about();
  }
  function titleKey(ev) {
    const k = ev.key;
    if (k === "Enter" || k === " " || k === "Tab" || k === "Shift") return;
    const hit = titleKeyButton(menu(), k);
    if (hit) { ev.preventDefault(); act(hit.dataset.act); return; }
    /* Settings, Help and About are a row: left and right walk it as well */
    const row = (k === "ArrowLeft" || k === "ArrowRight") && document.activeElement && document.activeElement.closest(".rs-menu .util");
    if (row) {
      const bs = [...row.querySelectorAll("button")], i = bs.indexOf(document.activeElement);
      ev.preventDefault(); bs[(i + (k === "ArrowRight" ? 1 : -1) + bs.length) % bs.length].focus();
      return;
    }
    titleArrow(menu(), ev);
  }

  /* ---- the backdrop behind a run ----
     One 1600x900 picture drawn "xMidYMax slice", in the line art the other
     Tactical games put behind play (PumaHeart's and PumaCity's scene values:
     navy fills, slate strokes, cyan and amber sparingly). The 2:3 canvas
     scales with the window's height as the picture does, so it always covers
     about x 515-1085; the landmarks stand either side of that, in x 140-490
     and 1110-1460, with the edges for wide windows. Cyberspace, 1996: a grid
     floor running to a skyline of server towers, the web strung across the
     sky; a CRT the size of a building on the left, a browser up and the
     modem dialling at its foot; pop-ups stacking on the right, the pointer
     on OK, and the page UNDER CONSTRUCTION. Drawn once; nothing in it moves. */
  const SH = 560, SVX = 800;              /* the horizon, and the vanishing point on it */
  function sceneRand(seed) {
    let s = seed >>> 0;
    return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  }
  const f1 = n => Math.round(n * 10) / 10;
  /* a 90s window: frame, title bar with its three boxes, then the body */
  function sceneWindow(x, y, w, h, title) {
    let o = `<rect class="sf" x="${x}" y="${y}" width="${w}" height="${h}" rx="3"/>`;
    o += `<path class="sl" d="M${x} ${y + 22} H${x + w}"/>`;
    for (let i = 0; i < 3; i++) o += `<rect class="sd" x="${x + w - 18 - i * 16}" y="${y + 6}" width="11" height="10"/>`;
    if (title) o += `<text class="stext" x="${x + 10}" y="${y + 16}">${title}</text>`;
    return o;
  }
  /* the pointer, tip at (x, y) */
  const scenePointer = (x, y, s) =>
    `<path class="sf ptr" d="M${x} ${y} v${f1(34 * s)} l${f1(8 * s)} ${f1(-8 * s)} l${f1(7 * s)} ${f1(15 * s)} l${f1(6 * s)} ${f1(-3 * s)} l${f1(-7 * s)} ${f1(-15 * s)} h${f1(11 * s)} Z"/>`;
  function sceneSVG() {
    const H = SH, VX = SVX, r = sceneRand(96);
    let o = "";
    /* stars, thinner toward the horizon */
    for (let i = 0; i < 110; i++) {
      const x = Math.round(r() * 1600), y = Math.round(Math.pow(r(), 1.3) * (H - 60)), big = r() < 0.22;
      o += `<circle class="st" cx="${x}" cy="${y}" r="${big ? 1.6 : 1}"/>`;
    }

    /* the web across the sky: nodes, the links between them, packets on two */
    const nodes = [[60, 120], [170, 70], [300, 400], [420, 120], [470, 300], [560, 60],
                   [1050, 70], [1120, 150], [1260, 60], [1420, 110], [1540, 210], [1500, 40]];
    const links = [[0, 1], [1, 3], [3, 5], [3, 4], [4, 2], [5, 6], [6, 7], [6, 8], [8, 11], [8, 9], [9, 10], [9, 11]];
    for (const [a, b] of links) o += `<path class="swire" d="M${nodes[a][0]} ${nodes[a][1]} L${nodes[b][0]} ${nodes[b][1]}"/>`;
    for (const [x, y] of nodes) o += `<circle class="snode" cx="${x}" cy="${y}" r="3.5"/>`;
    for (const [a, b, t] of [[1, 3, .4], [8, 9, .6]]) {
      const [x0, y0] = nodes[a], [x1, y1] = nodes[b];
      o += `<rect class="samber" x="${f1(x0 + (x1 - x0) * t - 3)}" y="${f1(y0 + (y1 - y0) * t - 3)}" width="6" height="6"/>`;
    }

    /* the world wide web itself: a wireframe globe, wired in */
    const GX = 270, GY = 230, GR = 78;
    o += `<path class="swire" d="M${GX - 40} ${GY - 67} L170 70 M${GX + 60} ${GY - 50} L420 120 M${GX + 50} ${GY + 60} L300 400"/>`;
    o += `<circle class="sglow-cyan" cx="${GX}" cy="${GY}" r="${GR + 26}"/>`;
    o += `<circle class="sf" cx="${GX}" cy="${GY}" r="${GR}"/>`;
    let gl = "";
    for (const k of [0.35, 0.7]) gl += `M${GX} ${GY - GR} A${f1(GR * k)} ${GR} 0 0 0 ${GX} ${GY + GR} A${f1(GR * k)} ${GR} 0 0 0 ${GX} ${GY - GR} `;
    gl += `M${GX} ${GY - GR} V${GY + GR} `;
    for (const k of [-0.62, -0.3, 0, 0.3, 0.62]) {
      const y = GY + GR * k, hw = Math.sqrt(GR * GR - (GR * k) ** 2);
      gl += `M${f1(GX - hw)} ${f1(y)} H${f1(GX + hw)} `;
    }
    o += `<path class="sd" d="${gl}"/>`;
    o += `<ellipse class="sorbit" cx="${GX}" cy="${GY}" rx="${GR + 40}" ry="22" transform="rotate(-16 ${GX} ${GY})"/>`;
    o += `<circle class="scyan" cx="${GX + GR + 34}" cy="${GY - 30}" r="3"/>`;

    /* the skyline on the horizon: server towers, a light or two lit */
    let sky = `M-20 ${H}`;
    const towers = [];
    for (let x = -20; x < 1620;) {
      const w = 26 + Math.round(r() * 40), h = 18 + Math.round(r() * 64);
      sky += ` V${H - h} H${x + w}`;
      towers.push([x, w, h]);
      x += w;
    }
    o += `<path class="sf far" d="${sky} V${H} Z"/>`;
    for (const [x, w, h] of towers) {
      if (r() < 0.5) o += `<path class="sd" d="M${x + 6} ${H - h + 10} h${w - 12} M${x + 6} ${H - h + 18} h${w - 12}"/>`;
      if (r() < 0.18) o += `<rect class="${r() < .5 ? "scyan" : "samber"} dim" x="${x + w / 2 - 2}" y="${H - h + 26}" width="4" height="4"/>`;
    }

    /* the grid floor, running out to the horizon */
    o += `<rect class="sground" x="0" y="${H}" width="1600" height="${900 - H}"/>`;
    let grid = "";
    for (let x = -2400; x <= 4000; x += 160) grid += `M${VX} ${H} L${x} 900 `;
    for (const z of [1, 1.25, 1.6, 2.05, 2.7, 3.6, 5, 7.2, 11, 18]) grid += `M0 ${f1(H + 340 / z)} H1600 `;
    o += `<path class="sgrid" d="${grid}"/>`;
    o += `<path class="sl" d="M0 ${H} H1600"/>`;

    /* the CRT the size of a building, a browser up on it */
    const MX = 300, MB = 820;              /* its centre, and where it stands */
    o += `<path class="sf" d="M${MX - 120} ${MB - 70} L${MX - 150} ${MB - 300} H${MX + 150} L${MX + 120} ${MB - 70} Z"/>`;
    o += `<path class="sf" d="M${MX - 90} ${MB} L${MX - 60} ${MB - 40} H${MX + 60} L${MX + 90} ${MB} Z"/>`;
    o += `<rect class="sf" x="${MX - 180}" y="${MB - 400}" width="360" height="300" rx="20"/>`;
    o += `<rect class="sglow-cyan" x="${MX - 200}" y="${MB - 420}" width="400" height="340" rx="44"/>`;
    o += `<rect class="sscreen" x="${MX - 152}" y="${MB - 374}" width="304" height="232" rx="14"/>`;
    const BX = MX - 140, BY = MB - 362, BW = 280;
    o += `<path class="sd" d="M${BX} ${BY + 20} H${BX + BW} M${BX} ${BY + 46} H${BX + BW}"/>`;
    o += `<text class="stext lit" x="${BX + 6}" y="${BY + 14}">NETSURFER 2.0</text>`;
    o += `<rect class="sd" x="${BX + 6}" y="${BY + 26}" width="200" height="14" rx="2"/><text class="stext lit sm" x="${BX + 12}" y="${BY + 37}">http://www.</text>`;
    o += `<rect class="scyan" x="${BX + 88}" y="${BY + 28}" width="2" height="10"/>`;
    o += `<rect class="sd" x="${BX + BW - 40}" y="${BY + 24}" width="34" height="18"/><path class="sd" d="M${BX + BW - 33} ${BY + 38} l10 -10 l10 10"/>`;
    o += `<path class="sd" d="M${BX + 10} ${BY + 66} h150 M${BX + 10} ${BY + 80} h120 M${BX + 10} ${BY + 94} h140 M${BX + 10} ${BY + 120} h96 M${BX + 10} ${BY + 134} h120 M${BX + 10} ${BY + 148} h80"/>`;
    o += `<path class="slink" d="M${BX + 10} ${BY + 168} h70 M${BX + 96} ${BY + 168} h60"/>`;
    o += `<rect class="sd" x="${BX + 180}" y="${BY + 62}" width="88" height="66"/><path class="sd" d="M${BX + 180} ${BY + 128} l26 -30 l20 18 l14 -12 l28 24"/>`;
    o += `<circle class="sd" cx="${BX + 250}" cy="${BY + 78}" r="6"/>`;
    o += `<circle class="samber" cx="${MX + 150}" cy="${MB - 120}" r="3"/>`;
    /* the keyboard at its foot */
    o += `<path class="sf" d="M${MX - 150} ${MB + 34} L${MX - 132} ${MB + 6} H${MX + 132} L${MX + 150} ${MB + 34} Z"/>`;
    o += `<path class="sd" d="M${MX - 136} ${MB + 16} H${MX + 136} M${MX - 141} ${MB + 25} H${MX + 141}"/>`;

    /* the modem on top of it, lights on, the phone cord down its side */
    const DX = MX - 130, DB = MB - 400;
    o += `<path class="swire" d="M${DX} ${DB - 10} c-24 0 -30 20 -30 40 c0 12 -14 12 -14 24 s14 12 14 24 s-14 12 -14 24 s14 12 14 24 c0 40 -40 60 -70 70"/>`;
    o += `<path class="sf" d="M${DX} ${DB} L${DX + 10} ${DB - 30} H${DX + 120} L${DX + 128} ${DB} Z"/>`;
    for (let i = 0; i < 6; i++) o += `<circle class="${i === 1 || i === 4 ? "samber" : "scyan dim"}" cx="${DX + 26 + i * 16}" cy="${DB - 12}" r="2.5"/>`;

    /* the pop-ups, stacking on the right, the pointer on OK */
    o += sceneWindow(1150, 150, 230, 150, "WELCOME!!!");
    o += `<path class="sd" d="M1164 196 h140 M1204 210 h110 M1204 224 h150 M1204 250 h90"/>`;
    o += `<path class="slink" d="M1164 276 h70"/>`;
    o += sceneWindow(1240, 260, 250, 140, "CONGRATULATIONS");
    o += `<text class="stext" x="1256" y="314">YOU ARE THE</text><text class="stext" x="1256" y="334">1,000,000th VISITOR</text>`;
    o += `<rect class="sf" x="1380" y="356" width="56" height="26" rx="2"/><text class="stext" x="1408" y="374" text-anchor="middle">OK</text>`;
    o += sceneWindow(1100, 410, 180, 110, "");
    o += `<path class="sf hg" d="M1180 448 h20 l-8 14 l8 14 h-20 l8 -14 Z"/><path class="sd" d="M1174 448 h32 M1174 476 h32"/>`;
    o += scenePointer(1420, 372, 1.15);

    /* the page UNDER CONSTRUCTION: a barrier on the grid, a hit counter */
    const UX = 1290, UB = 840;
    o += `<path class="sl" d="M${UX - 120} ${UB} L${UX - 96} ${UB - 90} M${UX - 70} ${UB} L${UX - 96} ${UB - 90} M${UX + 120} ${UB} L${UX + 96} ${UB - 90} M${UX + 70} ${UB} L${UX + 96} ${UB - 90}"/>`;
    o += `<rect class="sf" x="${UX - 140}" y="${UB - 108}" width="280" height="32"/>`;
    let st = "";
    for (let x = UX - 132; x < UX + 132; x += 28) st += `M${x} ${UB - 78} l16 -28 h10 l-16 28 Z `;
    o += `<path class="sstripe" d="${st}"/>`;
    o += `<rect class="sf sign" x="${UX - 132}" y="${UB - 160}" width="264" height="40" rx="3"/>`;
    o += `<text class="stext big" x="${UX}" y="${UB - 133}" text-anchor="middle">UNDER CONSTRUCTION</text>`;
    o += `<circle class="samber" cx="${UX - 96}" cy="${UB - 116}" r="4"/><circle class="sglow-amber" cx="${UX - 96}" cy="${UB - 116}" r="14"/>`;
    o += `<circle class="samber" cx="${UX + 96}" cy="${UB - 116}" r="4"/><circle class="sglow-amber" cx="${UX + 96}" cy="${UB - 116}" r="14"/>`;
    o += `<rect class="sf" x="1330" y="430" width="112" height="30" rx="2"/>`;
    for (let i = 0; i < 6; i++) o += `<rect class="sd" x="${1336 + i * 17.5}" y="435" width="14" height="20"/><text class="stext sm" x="${1343 + i * 17.5}" y="450" text-anchor="middle">${"001996"[i]}</text>`;
    return `<svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">${o}</svg>`;
  }

  /* ---- a game ---- */
  /* the canvas is 2:3; it gets the most room that keeps the strip above it */
  function fitWidth() {
    return Math.max(200, Math.floor(Math.min(innerWidth - 24, (innerHeight - 74) * 2 / 3)));
  }
  function fitGame() {
    if (!game) return;
    const w = fitWidth();
    game.element.style.width = w + "px";
    $("play").style.setProperty("--gw", w + "px");
  }
  const HINT = TOUCH ? "Drag to steer · 2nd finger jumps" : "← → carve · ↓ tuck · ↑ brake · Space jump";
  let hintTimer = 0;
  function flashHint(text) {
    clearTimeout(hintTimer);
    $("hint").textContent = text;
    hintTimer = setTimeout(() => { $("hint").textContent = HINT; }, 1400);
  }
  function newGame() {
    closeSheet(true);
    stopScene();
    mode = "play";
    $("title").hidden = true; $("play").hidden = false;
    $("hint").textContent = HINT;
    $("host").innerHTML = "";
    game = RS.mount($("host"), { width: fitWidth(), muted, autofocus: true });
    fitGame();
    game.start();
  }
  function toTitle() {
    if (game) { game.destroy(); game = null; }
    $("host").innerHTML = "";
    openTitle(); revealTitle(true);
  }

  /* ---- the sheets: a glass panel over the title ---- */
  function openSheet(title, { tabs, html, onClick, focus }) {
    closeSheet(true);
    const back = document.activeElement;
    const el = document.createElement("div");
    el.className = "rs-sheet" + (tabs ? " tabbed" : "");
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-label", title);
    let tab = 0;
    const draw = () => {
      el.innerHTML = '<div class="sh-box"><div class="sh-head"><h2>' + esc(title) + '</h2><button data-x aria-label="Close"><kbd>Esc</kbd>Close</button></div>' +
        (tabs ? '<div class="sh-tabs" role="tablist">' + tabs.map(([t], i) => '<button role="tab" data-tab="' + i + '" aria-selected="' + (i === tab) + '">' + esc(t) + "</button>").join("") + "</div>" : "") +
        '<div class="sh-body">' + (tabs ? tabs[tab][1]() : html()) + "</div></div>";
      el.querySelectorAll("canvas[data-fig]").forEach(cv => {
        cv.width = 36; cv.height = 36;
        A.drawPickup(cv.getContext("2d"), cv.dataset.fig, 2, 2, 1.4);
      });
    };
    const refocus = k => (k && el.querySelector('[data-k="' + k + '"]')) || el.querySelector('[role="tab"][aria-selected="true"]') || el.querySelector("[data-k]") || el.querySelector("[data-x]");
    draw();
    const api = {
      el,
      close: () => closeSheet(),
      /* redraw, keeping the focus on the same control, or on k */
      refresh(k) {
        const a = document.activeElement;
        draw();
        refocus(k || (a && a.dataset && a.dataset.k)).focus();
      },
      back
    };
    el.addEventListener("click", ev => {
      if (ev.target === el) return closeSheet();
      const b = ev.target.closest("button");
      if (!b) return;
      if (b.hasAttribute("data-x")) return closeSheet();
      if (b.dataset.tab !== undefined) { tab = +b.dataset.tab; draw(); el.querySelector('[data-tab="' + tab + '"]').focus(); return; }
      if (onClick) onClick(b, api);
    });
    document.body.appendChild(el);
    sheet = api;
    refocus(focus).focus();
  }
  function closeSheet(quiet) {
    if (!sheet) return;
    const { el, back } = sheet;
    sheet = null;
    el.remove();
    if (quiet) return;
    (back && back.isConnected ? back : $("title").querySelector(".dflt")).focus({ preventScroll: true });
  }
  function sheetKey(ev) {
    const el = sheet.el;
    if (ev.key === "Escape") { ev.preventDefault(); closeSheet(); return; }
    if (ev.key === "m" || ev.key === "M") { ev.preventDefault(); setMuted(!muted); return; }
    if (ev.key === "Tab") {
      const bs = [...el.querySelectorAll("button, a[href]")], i = bs.indexOf(document.activeElement);
      ev.preventDefault();
      bs[(i + (ev.shiftKey ? -1 : 1) + bs.length) % bs.length].focus();
      return;
    }
    const t = document.activeElement && document.activeElement.closest('[role="tab"]');
    if (t && (ev.key === "ArrowLeft" || ev.key === "ArrowRight")) {
      const ts = [...el.querySelectorAll('[role="tab"]')], i = ts.indexOf(t);
      ev.preventDefault();
      ts[(i + (ev.key === "ArrowRight" ? 1 : -1) + ts.length) % ts.length].click();
    }
  }

  function settings() {
    let asking = false;
    openSheet("Settings", {
      html: () => asking
        ? '<h3>This browser</h3><p class="lede">Forget everything Retro Surfer \'96 has saved in this browser: your best distance and the sound setting? This cannot be undone.</p>' +
          '<div class="row"><button class="danger" data-k="yes">Forget everything</button><button data-k="no">Cancel</button></div>'
        : '<h3>Sound</h3><div class="row"><button class="pill' + (muted ? "" : " on") + '" data-k="on" aria-pressed="' + !muted + '">On</button>' +
          '<button class="pill' + (muted ? " on" : "") + '" data-k="off" aria-pressed="' + muted + '">Off</button></div>' +
          '<p class="note"><kbd>M</kbd> switches it anywhere, mid-run too.</p>' +
          '<h3>This browser</h3><div class="row"><button class="danger" data-k="forget">Forget everything</button></div>' +
          '<p class="note">Clears your best distance and the sound setting, and nothing any other game on greykit.com keeps.</p>',
      onClick(b, s) {
        const k = b.dataset.k;
        if (k === "on" || k === "off") setMuted(k === "off");
        else if (k === "forget") { asking = true; s.refresh("no"); }
        else if (k === "no") { asking = false; s.refresh("forget"); }
        else if (k === "yes") forgetEverything();
      }
    });
  }
  /* every key this game keeps, found by prefix, from both stores: greykit.com
     is one origin, so localStorage.clear() would take every other game's too */
  function forgetEverything() {
    for (const area of ["localStorage", "sessionStorage"]) {
      try {
        const s = window[area];
        for (let i = s.length - 1; i >= 0; i--) {
          const k = s.key(i);
          if (k && k.startsWith(PREFIX)) s.removeItem(k);
        }
      } catch (e) { /* no storage */ }
    }
    location.reload();
  }

  function help() {
    openSheet("Help", { tabs: [
      ["How it plays", () =>
        '<p class="lede">You ride down the information superhighway. Distance is scored in KB downloaded, and your speed reads out in baud.</p>' +
        "<h3>Size tells you what is coming</h3><table>" +
        "<tr><td><b>Small junk</b></td><td>Netscape, AOL CDs, Winamp, blue screens, BonziBuddy and the rest. Hit one and it costs a life.</td></tr>" +
        "<tr><td><b>Big junk</b></td><td>Popup storms, UNDER CONSTRUCTION zones, framesets. Harmless, but you wade through at a crawl.</td></tr>" +
        '<tr><td><b class="good">Green</b></td><td>Pickups glow and bob. Grab them.</td></tr></table>' +
        "<h3>Clippy</h3><p>Clippy chases from behind at a fixed speed. You always travel along the board, so carving to dodge costs descent and hands it ground; pointing straight and tucking pulls away. Lose it and you bank a bonus.</p>" +
        "<h3>Eras, near misses, the jump</h3><p>Every few thousand KB the world crosses into a new era, from 1994 dial-up to 2001 spyware, with its own colours and junk. Clearing a hazard by a hair pays a bonus that chains up to 3×. The jump meter at the foot fills with clean riding.</p>"],
      ["Pickups", () =>
        "<table>" + [
          ["norton", "Norton shield", "Nine seconds. Absorbs one hit, and Clippy backs off."],
          ["bolt", "Broadband", "A speed boost for four and a half seconds."],
          ["portal", "Hyperlink", "Lays a chain of links ahead of you. Every link you take re-aims the rest from where you are pointing, so take each one on a heading you mean to hold."],
          ["floppy", "Floppy disk", "One more life, up to five."]
        ].map(([k, n, d]) => '<tr><td><span class="pk"><canvas data-fig="' + k + '" width="36" height="36" aria-hidden="true"></canvas><b>' + n + "</b></span></td><td>" + d + "</td></tr>").join("") + "</table>"],
      ["Controls", () =>
        "<table>" +
        "<tr><td><kbd>←</kbd> <kbd>→</kbd></td><td>Lean the board: tap to nudge, hold to carve</td></tr>" +
        "<tr><td><kbd>↓</kbd></td><td>Tuck, for speed</td></tr>" +
        "<tr><td><kbd>↑</kbd></td><td>Brake</td></tr>" +
        "<tr><td><kbd>Space</kbd></td><td>Jump; hold to stay up, against the charge meter</td></tr>" +
        "<tr><td><kbd>Enter</kbd></td><td>Ride again after a crash</td></tr>" +
        "<tr><td><kbd>Esc</kbd></td><td>Back to the title</td></tr>" +
        "<tr><td><kbd>M</kbd></td><td>Sound on and off</td></tr></table>" +
        "<h3>Touch</h3><p>One finger anywhere on the game is a stick: drag sideways to lean, down to tuck, up to brake. A second finger jumps; hold it for a longer flight. Tap to ride again.</p>" +
        '<p class="note">The game pauses when it loses focus. Click it to carry on.</p>']
    ] });
  }
  function about() {
    openSheet("About", { html: () =>
      '<p class="lede">Surf the internet, avoiding spam and dead apps along the way. Go fast or Clippy will offer to help!</p>' +
      "<p>This game was originally one of the easter eggs I cycle through greykit.com. It just happened to be popular enough that I decided to keep it around.</p>" +
      '<p class="gk-credit">' + CREDIT + "</p>" });
  }

  /* ---- keys ---- */
  document.addEventListener("keydown", ev => {
    if (ev.ctrlKey || ev.metaKey || ev.altKey || mode === "boot") return;
    if (sheet) { sheetKey(ev); return; }
    if (ev.key === "m" || ev.key === "M") { ev.preventDefault(); setMuted(!muted); return; }
    if (mode === "title") titleKey(ev);
    else if (mode === "play" && ev.key === "Escape") { ev.preventDefault(); toTitle(); }
  });
  /* the pointer moves the focus, so only one row of the menu is ever lit */
  document.addEventListener("pointerover", ev => {
    const b = ev.target.closest && ev.target.closest(".rs-menu button, .rs-sheet button");
    if (b && b !== document.activeElement && !b.closest(".sh-head")) b.focus({ preventScroll: true });
  });
  addEventListener("resize", () => {
    sizeScene();
    if (mode === "title") { drawMark(); if (still()) drawScene(); }
    fitGame();
  });

  /* ---- boot ---- */
  function boot() {
    injectTitleCSS();       /* the boot's; the title and the sheets are title.css */
    syncSound();
    let i = 0;
    for (const el of document.querySelectorAll(".rs-menu > button, .rs-menu .util, .rs-menu .legend")) {
      el.classList.add("pr"); el.style.setProperty("--i", i++);
    }
    menu().addEventListener("click", ev => { const b = ev.target.closest("[data-act]"); if (b) act(b.dataset.act); });
    $("menubtn").addEventListener("click", toTitle);
    $("snd").addEventListener("click", () => setMuted(!muted));
    $("backdrop").innerHTML = sceneSVG();
    sizeScene();
    /* a few seconds of slope already ridden, so the title never opens empty */
    for (let n = 0; n < 150; n++) step(1 / 30);

    const q = new URLSearchParams(location.search);
    /* debug: ?play straight into a run */
    if (q.has("play")) { newGame(); return; }
    const run = runBoot({ lines: [bootReloadLine(), "ATDT 555-0196"] });
    openTitle();
    const b = best();
    run.finish(["CONNECT 28800", b ? "best <b>" + b.toLocaleString("en-US") + " KB</b>" : "it looks like you're surfing"])
      /* debug, for screenshots: ?shot shows the menu without its entrance */
      .then(() => revealTitle(!q.has("shot")));
  }
  boot();
})();
