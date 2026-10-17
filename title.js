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
