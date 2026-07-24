# Retro Surfer '96

A 32×32 pixel-art SkiFree/Surf-style easter egg themed around 90s web surfing
and security. Vanilla JS, no dependencies, no image or audio assets — every
sprite is character-grid data drawn into an offscreen canvas at load, and the
CSS injects itself. One `<script>` tag to ship (~120 KB raw, ~21 KB gzipped).

## Drop it in

```html
<script src="retro-surfer.js"></script>
<div data-retro-surfer data-width="420"></div>
```

Any element with `data-retro-surfer` auto-mounts on DOM ready. Or mount it
yourself:

```js
var game = RetroSurfer.mount(document.getElementById('egg'), { width: 420 });
game.destroy();
```

As an actual easter egg — Konami code (↑↑↓↓←→←→BA) opens it in an overlay,
Escape or clicking the backdrop closes it:

```js
RetroSurfer.konami({ width: 440 });
```

`RetroSurfer.open(opts)` opens the overlay directly if you'd rather wire it to
your own trigger (a hidden link, a logo click, a typed phrase).

## Controls

| Key | Action |
| --- | --- |
| ← → | Lean the board — tap to nudge, hold to carve all the way over |
| ↓ | Tuck — 1.28× speed along whichever way you're pointing; the puma visibly crouches |
| ↑ | Brake |
| Enter / Space | Start, restart |

On a touchscreen, one finger anywhere on the canvas is a virtual stick
anchored where you first touched: drag sideways to lean (analog — about 50px
of drag is full lean), drag down to tuck, drag up to brake, and tap to start.
The title screen swaps to touch instructions the first time you use it.

The lean is continuous anywhere in ±60°, not a set of fixed positions. Holding
a key ramps an eased turn rate (168°/s at full commitment, ~80ms to spin up
and the same to die away), so a quick tap gives you roughly 20° and a held key
sweeps to the stop in about three quarters of a second. Let go and the board
holds its angle — it doesn't spring back to centre — so you steer by leaning
in and then leaning back out. The one exception: scrubbing along a wall with
no key held stands you up rather than leaving you pinned.

You always travel *along the board*, so leaning trades descent for drift:

| Lean | Descent | Lateral |
| --- | --- | --- |
| 0° (straight) | 100% | 0% |
| 30° | 87% | 50% |
| 60° (full) | 50% | 87% |

Tucking never changes your direction — it scales speed along the board, so a
hard carve stays a hard carve and you just cover it faster.

The art is sampled from the angle every 15°, giving nine board poses across
the range. Crashing stands you back up at 0°.

Clicking the canvas focuses it; the game pauses when it loses focus or the tab
is hidden.

## Gameplay

You ride down the information superhighway. Distance is scored in KB
downloaded; your speed reads out in baud (your *descent* rate, so it drops
when you carve).

Three kinds of thing come at you, and size tells you which is which:

**Hazards — small, cost a life.** Dead services and software, one 32×32 icon
each: Netscape, an AOL free-trial CD, an ICQ flower, Winamp, a 404 page,
Clippy, the MSN butterfly, the IE `e`, a blue screen, a Java applet, a hit
counter. Hit one and you lose a life, drop to half speed, and snap straight.

**Sludge — large, harmless, and it kills your speed.** Islands of junk you
wade through rather than crash into: a popup storm (a pile of overlapping
Win95 ad windows), a corrupted-signal artifact (torn RGB scanline noise), and
an UNDER CONSTRUCTION zone with barriers, cones and a dirt mound. Contact
costs no health at all — it drops you to **0.3× speed** for as long as you're
inside, tears the picture with scan bars, and turns the baud readout red.

That's the interesting one, because it feeds the chase: CookieMonster runs at
a fixed downhill speed, so bogging down in an ad storm hands it the gap even
though the ads themselves can't hurt you. Sludge is never consumed — it scrolls
past like terrain — and the hyperlink jump carries you clean over it.

**Pickups — small, glowing green.** See below.

Spawn mix is roughly 14% pickups, 20–25% sludge (rising with level), the rest
hazards, and the same sprite won't spawn twice in a row.

### Near misses

Clearing a hazard by less than 15px pays a bonus, worth more the closer you
cut it, and chaining them without crashing multiplies it up to 3×. The bonus
lands as a rising `+18KB X3` popup. Crashing resets the chain, and so does
3.5 seconds without a near miss — so the greedy line is worth taking, but only
if you can keep taking it. Jumping over something doesn't count; you weren't
at risk.

### Eras

Every few thousand KB you cross into a new era, which repaints the world and
swaps the line-up of junk:

| From | Era | Look |
| --- | --- | --- |
| 0 KB | 1994 DIAL-UP | navy; Netscape, AOL, ICQ, Clippy, 404s, hit counters |
| 300 KB | 1997 MULTIMEDIA | purple; Winamp, Java, MSN, more glitch fields |
| 700 KB | 1999 BROADBAND | teal; IE, MSN, blue screens |
| 1300 KB | 2001 SPYWARE | red; blue screens, IE, wall-to-wall popup storms |

Colours ease over about a second rather than cutting, the era name sits in the
HUD, and crossing announces itself. `ZONES` at the top of the file holds the
thresholds, palettes and pools — that array is the only place that decides
what can spawn, so a new hazard needs adding to at least one era's `hazards`
list to ever appear.

### Pickups reach for you

Powerups within 34px start pulling toward the player, so a nearly-perfect line
still counts as a grab. It's enough to forgive a few pixels, not enough to
collect something you didn't go for.

**CookieMonster** spawns behind you and runs at a fixed downhill speed, so the
gap is driven by your descent rate. Carving sideways or braking hands it
ground; pointing straight and tucking is what pulls away. Escape it and you
bank a distance bonus ("VIRUS QUARANTINED"); let it catch you and you lose a
life. That's the core tension: obstacles push you into turns, turns feed the
virus, and getting straight again costs you two keypresses.

### Green means good

Anything you should grab is drawn with a pulsing green halo — a 1px outline
plus a softer 2px glow, stamped around the sprite's real silhouette rather
than baked into the art, so it works for any pickup you add later. Hazards and
sludge get nothing; sludge is told apart by being three times the size. The
title screen shows the four pickups glowing next to an unglowing CookieMonster
with "GRAB THE GREEN ONES / BIG JUNK JUST SLOWS YOU" underneath, so both rules
are taught before the first run.

The colour isn't the only cue: pickups also bob up and down while obstacles
sit still, which keeps the distinction working without relying on hue.

To restyle it, change `GOOD` (the highlight colour) or `drawPickup` in
`retro-surfer.js`.

Powerups (about 14% of spawns):

| Icon | Effect |
| --- | --- |
| Norton shield | 9s — absorbs one hit and makes CookieMonster flee outright |
| Broadband bolt | 4.5s speed boost |
| Hyperlink portal | 1.15s airborne jump — pass straight over obstacles |
| Floppy disk | +1 life (max 5) |

Three lives, shown as floppies in the HUD. High score persists in
`localStorage` under `retroSurferHighScore`.

## The art

Sprites live in the `SPRITES` object as plain character grids — one character
per pixel indexing that sprite's own palette, `.` for transparent. Edit a row
by hand and the change shows up directly.

They were authored with `tools/gen-sprites.js`, a Node script that draws each
icon from primitives (discs, polygons, rotated board profiles, 3×5 text) and
prints the grids. It is not part of the shipped game — use it if you want to
regenerate or add art, then paste its output over the `SPRITES` block:

```bash
node tools/gen-sprites.js sprites.txt
```

The rider is an anthropomorphic puma — ears, muzzle, and a tail that trails
up-track and swings opposite the turn as a counterweight.

There are 18 player sprites: nine board angles (`pose0`–`pose8`) rotated from
−60° to 60° in 15° steps, plus a crouched variant of each (`tuck0`–`tuck8`)
used while tucking. In the crouch the knees bend, the head ducks down and
forward, the arms sweep back and the tail streams straighter — but the feet
stay planted in the same spot, which is what makes it read as a crouch rather
than a smaller sprite.

Want a smoother turn still? Change the loop that builds `POSES` to a smaller
step and extend the `POSE` and `TUCK` lists to match — nothing else needs to
know how many there are, and `check-sprites.js` will fail the build if the two
lists ever disagree.

The tail bends by a fixed angle off straight-back, rather than being offset
sideways. Offsetting the tip made it fan into a shapeless blob at part-lean,
and letting it trail perfectly straight hid it behind the rider at 0°, where
it read as a tuft on top of the head.

## Notes

- Internal resolution is 320×480, upscaled with `image-rendering: pixelated`,
  so it stays crisp at any width. Set the size with `width` / `data-width`.
- Sprites are pre-rendered to offscreen canvases once and blitted; drawing a
  32×32 sprite pixel-by-pixel every frame would be 1024 `fillRect` calls.
- Obstacles spawn per distance covered, not per second, so tucking means more
  obstacles per second rather than a thinner field.
- Entities draw in layers: sludge underneath, hazards over it, pickups on top,
  so a glowing powerup is never lost inside an ad storm.
- To add a hazard or a sludge island, generate the sprite, paste the grid into
  `SPRITES`, add a `label`, and push the key onto an era's `hazards` or
  `sludge` list in `ZONES` — the behaviour comes from which list it's in.
- Carving hard or braking kicks spray off the board's inside edge. The
  particles are world-anchored, so they stream away up-track instead of
  hanging off you.
- Background motes stretch into streaks in proportion to your descent rate —
  speed lines for free, rather than a second effect system.
- CookieMonster gets a blinking chevron at the top of the screen while it's
  still above the view, so being hunted is never a surprise you couldn't see.
- Audio is a handful of WebAudio square-wave blips generated on the fly; it
  degrades to silence where WebAudio isn't available.
- Scanlines are disabled under `prefers-reduced-motion`.
- The wrap is `max-width:100%` with `touch-action:none`, so it shrinks to fit
  a phone and swallows drag gestures instead of scrolling the page.

## Files

- `retro-surfer.js` — the whole game (art and styles included)
- `index.html` — playable page; deployed, and doubles as the local demo
- `tools/gen-sprites.js` — sprite art generator, dev-only
- `tools/check-sprites.js` — art integrity check, run in CI

## Deploying

Pushing to `main` runs `.gitlab-ci.yml`, which validates and then rsyncs
`index.html`, `retro-surfer.js` and a `version.json` fingerprint over SSH to
**https://greykit.com/games/retrosurfer96/**. There's no build step — the game
is one self-contained script that injects its own CSS.

Auth comes from `DREAMHOST_SSH_KEY`, `DREAMHOST_HOST` and `DREAMHOST_USERNAME`,
inherited from the `greykit-games` group. They're *protected* variables, so
they only reach pipelines on protected branches; `main` is protected here. If a
deploy fails at the `ssh` step with empty variables, that's the thing to check.

The validate stage runs `node --check` plus `tools/check-sprites.js`, which
catches the failure modes this codebase actually has — a grid row that lost a
character, a pixel referencing a colour that isn't in its palette, or a sprite
no era can spawn. None of those throw at runtime; they just render wrong.

```bash
node tools/check-sprites.js
```

## License

MIT — see `LICENSE`.
