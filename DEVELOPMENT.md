# Developing Retro Surfer '96

Vanilla JS, no dependencies, no image or audio assets — every sprite is
character-grid data drawn into an offscreen canvas at load, and the CSS
injects itself. One `<script>` tag (~165 KB raw, ~29 KB gzipped).

## The standalone page

`index.html` is the game as a greykit.games title: the canon boot (the
greykit face, a load bar and a modem log), then a title in dark glass after
Raid on Puma Bay and Airborne Puma, then the game. It is four files around
the engine:

- `gk-title.js` and `gk-tokens.css` — byte-for-byte copies of games-meta's
  `canon/` (STANDARD.md §3, §4). The page uses only the boot, the reload
  line and the menu-key helpers from the block; never edit them here.
- `title.css` — the title, the sheets and the play frame.
- `title.js` — everything the page does: the backdrop, the menu (New game;
  Settings, Help, About), the sheets, and the run.

The backdrop is not the game running. It borrows the art through
`RetroSurfer.art` (the sprite blitter, the glowing pickup, the 3×5 text, the
eras) and runs its own attract loop: junk rising past, a puma weaving down a
path it can always see coming, grabbing the green, Clippy hanging on behind.
The wordmark is the game's own pixel face at a whole-pixel scale.

New game mounts the engine and calls `start()`, past the canvas's own title,
so the four pickups and "grab the green ones" now sit at the foot of the menu
instead. Esc goes back to the title; M switches sound anywhere, through the
engine's `setMuted()`. Settings → Forget everything removes every key starting
`retroSurfer`, never `localStorage.clear()`, because every game on
greykit.com shares one origin.

Debug: `?play` skips the boot and title straight into a run; `?shot` shows
the title without its entrance.

## Embedding

```html
<script src="retro-surfer.js"></script>
<div data-retro-surfer data-width="420"></div>
```

Any element with `data-retro-surfer` auto-mounts on DOM ready. Or mount it
from script:

```js
var game = RetroSurfer.mount(document.getElementById('egg'), { width: 420, muted: false });
game.start();        // straight into a run, past the canvas title
game.setMuted(true);
game.destroy();
```

`muted`, `start()` and `setMuted()` are for a page with a title of its own;
the Konami overlay uses none of them and behaves as it always has.

As an actual easter egg — Konami code (↑↑↓↓←→←→BA) opens it in an overlay,
Escape or clicking the backdrop closes it:

```js
RetroSurfer.konami({ width: 440 });
```

`RetroSurfer.open(opts)` opens the overlay directly, for any other trigger.
greykit.com loads `/games/retrosurfer96/retro-surfer.js` this way as its
Konami-code easter egg.

## Controls, in detail

| Key | Action |
| --- | --- |
| ← → | Lean the board — tap to nudge, hold to carve all the way over |
| ↓ | Tuck — 1.28× speed along whichever way you're pointing; the puma visibly crouches |
| ↑ | Brake |
| Space | Jump — hold to stay up, against the charge meter |
| Enter | Start, restart |

Space starts the game when you aren't playing and jumps when you are, so the
two never collide.

On a touchscreen, one finger anywhere on the canvas is a virtual stick
anchored where you first touched: drag sideways to lean (analog — about 50px
of drag is full lean), drag down to tuck, drag up to brake, and tap to start.
A **second finger** anywhere is the jump button — steer with one thumb, jump
with the other, hold for a longer flight. The title screen swaps to touch
instructions the first time you use it.

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

## Gameplay, in detail

You ride down the information superhighway. Distance is scored in KB
downloaded; your speed reads out in baud (your *descent* rate, so it drops
when you carve).

Three kinds of thing come at you, and size tells you which is which:

**Hazards — small, cost a life.** Twenty-seven dead services and pieces of
software, one 32×32 icon each. Hit one and you lose a life, drop to half
speed, and snap straight.

| Era it belongs to | Icons |
| --- | --- |
| Dial-up | Netscape, AOL free-trial CD, ICQ flower, 404 page, hit counter, 56k modem, a lifted phone handset, a guestbook, a flying toaster, an autoplaying MIDI |
| Multimedia | Winamp, a Java applet, the MSN butterfly, Ask Jeeves, the hourglass cursor, a SKIP INTRO button, a dead Tamagotchi, a dancing hamster |
| Broadband | the IE `e`, a blue screen, the Napster cat, Y2K on a beige CRT, a bondi-blue iMac |
| Spyware | BonziBuddy, a browser buried under six toolbars, the ILOVEYOU envelope, the Pets.com sock puppet |

**Sludge — large, harmless, and it kills your speed.** Islands of junk you
wade through rather than crash into: a popup storm (a pile of overlapping
Win95 ad windows), a corrupted-signal artifact (torn RGB scanline noise), an
UNDER CONSTRUCTION zone with barriers, cones and a dirt mound, and a nested
frameset that is more scrollbar than page. Contact costs no health at all — it
drops you to **0.3× speed** for as long as you're inside, tears the picture
with scan bars, and turns the baud readout red.

That's the interesting one, because it feeds the chase: Clippy runs at a
fixed downhill speed, so bogging down in an ad storm hands it the gap even
though the ads themselves can't hurt you. Sludge is never consumed — it scrolls
past like terrain — and a jump carries you clean over it.

**Pickups — small, glowing green.** See below.

Spawn mix is roughly 14% pickups, 20–25% sludge (rising with level), the rest
hazards, and the same sprite won't spawn twice in a row.

### Near misses

Clearing a hazard by less than 15px pays a bonus, worth more the closer you
cut it, and chaining them without crashing multiplies it up to 3×. The bonus
lands as a rising `+18KB X3` popup. Crashing resets the chain, and so does
3.5 seconds without a near miss — so the greedy line is worth taking, but only
if you can keep taking it. Jumping over something doesn't count; you weren't
at risk (nor does clearing one mid-jump).

### Eras

Every few thousand KB you cross into a new era, which repaints the world and
swaps the line-up of junk:

| From | Era | Look |
| --- | --- | --- |
| 0 KB | 1994 DIAL-UP | navy; Netscape, AOL, ICQ, modems, guestbooks, flying toasters |
| 300 KB | 1997 MULTIMEDIA | purple; Winamp, Java, MSN, Jeeves, Tamagotchis, SKIP INTRO, more glitch fields |
| 700 KB | 1999 BROADBAND | teal; IE, blue screens, Napster, Y2K, the iMac |
| 1300 KB | 2001 SPYWARE | red; BonziBuddy, toolbar stacks, ILOVEYOU, Pets.com, wall-to-wall popup storms |

Each era draws from a pool of ten to twelve hazards, so the same run rarely
shows you the same thing twice in a row and the line-up turns over completely
by the time you reach the red.

Colours ease over about a second rather than cutting, the era name sits in the
HUD, and crossing announces itself. `ZONES` at the top of the file holds the
thresholds, palettes and pools — that array is the only place that decides
what can spawn, so a new hazard needs adding to at least one era's `hazards`
list to ever appear.

### Pickups reach for you

Powerups within 34px start pulling toward the player, so a nearly-perfect line
still counts as a grab. It's enough to forgive a few pixels, not enough to
collect something you didn't go for.

**Clippy** spawns behind you and runs at a fixed downhill speed, so the gap
is driven by your descent rate. Carving sideways or braking hands it ground;
pointing straight and tucking is what pulls away. Escape it and you bank a
distance bonus ("ASSISTANT DISMISSED"); let it catch you and you lose a life.
That's the core tension: obstacles push you into turns, turns feed the
assistant, and getting straight again costs you two keypresses.

It announces itself with "IT LOOKS LIKE YOU'RE FLEEING", catches you with
"NEED HELP WITH THAT?", and the title screen counts your run's "ASSISTS
DODGED". Clippy used to be a small hazard you could hit; promoting it to the
chaser is why it no longer appears in any era's `hazards` pool.

He is the one sprite off the 32px grid — **64×64, twice the player** — because
a chaser has to read as a specific character rather than a category, and that
needs detail the icons don't. Getting there took some doing: at 40px he read
as an owl, and the fixes were all proportion and symmetry rather than detail.
A paperclip is roughly 1:2.5, so drawing it wide turns it into a face; the
wire is folded as one continuous strand the way a real clip is, so its top
loop sits off-centre; the wire is re-laid *over* the eyes so the clip is
clearly the object and the eyes are stuck to it; the eyes are tall ovals with
both pupils cut to the same side, because two symmetric circles staring
straight out is an owl no matter what you hang underneath them; and the brows
stay thin and inside the eyes' own width, since sweeping them up and out makes
them ear tufts. All of that is commented in `clippy()` in the generator.

### Green means good

Anything you should grab is drawn with a pulsing green halo — a 1px outline
plus a softer 2px glow, stamped around the sprite's real silhouette rather
than baked into the art, so it works for any pickup. Hazards and
sludge get nothing; sludge is told apart by being three times the size. The
title screen shows the four pickups glowing next to an unglowing Clippy
with "GRAB THE GREEN ONES / BIG JUNK JUST SLOWS YOU" underneath, so both rules
are taught before the first run.

The colour isn't the only cue: pickups also bob up and down while obstacles
sit still, which keeps the distinction working without relying on hue.

**That green is reserved.** A bright green hazard reads as a pickup at speed
no matter what shape it is, and the game used to have three: the ICQ flower
was a near-solid `#3ddc4a` blob, and Winamp's analyser and the hit counter's
digits were drawn in `#39ff14` — the exact hex of the halo. They're gone. ICQ
now wears its *offline* red, which is what the flower actually did when your
contact vanished; Winamp's bars run the dim-green/amber/red gradient the real
analyser used; the hit counter is an amber odometer.

`tools/check-sprites.js` enforces the rule, so this can't come back by
accident: any hazard or sludge sprite with a palette colour inside the
reserved band (hue 80–160° at mid lightness and decent saturation) fails the
check. A new sprite that wants green has to go dark or pick another hue.

`GOOD` is also the only green in the HUD, so "GRAB THE GREEN ONES" on the
title screen is drawn in literally the colour it's describing. To restyle,
change `GOOD` or `drawPickup` in `retro-surfer.js`.

Powerups (about 14% of spawns):

| Icon | Effect |
| --- | --- |
| Norton shield | 9s — absorbs one hit and makes Clippy back off outright |
| Broadband bolt | 4.5s speed boost |
| Hyperlink portal | Opens a chain of links to ride — see below |
| Floppy disk | +1 life (max 5) |

The Norton shield draws as a circular bubble, and while it's up that circle
*is* your hitbox — so what you see is exactly what collides, and it never eats
a hit that looked like a miss. It's a wider target than the bare body, which
is the trade for absorbing a hit (it also sweeps up pickups more easily).
`SHIELD_R` sets both the drawn radius and the collision radius; they can't
drift apart.

### The hyperlink chain

Taking a hyperlink lays a line of links running off in the direction you're
currently travelling. Every link you take **re-aims the rest of the line from
wherever you're pointing at that instant** — so the trick is to take each one
on a heading you actually mean to hold. Swerve as you touch it and the
remaining links swing away with you.

You ride the chain on the ground, at your normal carving speed, dodging
everything else at the same time. Miss a link and the rest of the line goes
with it.

Each link pays 18 KB, and taking the whole chain pays a further 18 KB per
link. The line stops where it would run off the field rather than clamping to
the edge — clamped links stack on the same pixel and could be swept up in one
go. So a steep heading from mid-field simply lays a shorter chain, and the
payout scales with length. Shallow, sustainable headings are worth more, which
is the whole lesson of the mechanic.

### The jump meter

Jumping is no longer tied to a pickup — it runs off a charge bar in the bottom
status strip, filled by clean riding:

- The fill rate scales with your **descent rate**, the same number the baud
  readout shows, so going fast charges faster. Roughly 12s at cruising speed,
  19s if you dawdle, 8s flat out.
- It ramps in over 5 seconds of clean riding, so the meter starts slowly after
  a knock and speeds up the longer you stay clean.
- **A collision stops the bar without taking anything off it.** While you're
  flashing it doesn't move at all; wading through sludge stalls it too, though
  that doesn't cost you the ramp. The track hatches red while it's stalled, so
  a frozen bar explains itself.
- Nothing charges while you're in the air.

A full bar is 1.8 seconds of flight. Hold Space for one long jump, or tap for
a 0.6s hop — exactly enough to clear an obstacle, and exactly three per bar. A
small notch on the track marks the minimum charge needed to leave the ground.

Three lives, shown as floppies in the HUD. High score persists in
`localStorage` under `retroSurferHighScore`.

## The art

Sprites live in the `SPRITES` object as plain character grids — one character
per pixel indexing that sprite's own palette, `.` for transparent. Edit a row
by hand and the change shows up directly. Nothing enforces a size: hazards and
the player are 32×32, sludge runs to 104×76, and Clippy is 64×64. Sprites are
blitted 1:1, so a grid's dimensions *are* its on-screen size.

They were authored with `tools/gen-sprites.js`, a Node script that draws each
icon from primitives (discs, polygons, rotated board profiles, 3×5 text) and
prints the grids. It is not part of the shipped game; it regenerates or adds art:

```bash
node tools/gen-sprites.js sprites.txt
```

`tools/splice.js` runs the generator and drops the result straight into
`retro-surfer.js`, replacing the whole `SPRITES` block, which beats pasting
2000 lines by hand:

```bash
node tools/splice.js && node tools/check-sprites.js
```

Pixel art authored blind is pixel art that doesn't read, so
`tools/sheet.js` renders the shipped grids to a PNG contact sheet — every
sprite at 4× with its key underneath, or just the ones you name. No
dependencies; it writes the PNG itself. This is the fastest way to find out
that a flying toaster looks like a stapler:

```bash
node tools/sheet.js sheet.png toaster napster sockpuppet
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
- Clippy gets a blinking chevron at the top of the screen while it's
  still above the view, so being hunted is never a surprise you couldn't see.
- Audio is a handful of WebAudio square-wave blips generated on the fly; it
  degrades to silence where WebAudio isn't available.
- Scanlines are disabled under `prefers-reduced-motion`.
- The wrap is `max-width:100%` with `touch-action:none`, so it shrinks to fit
  a phone and swallows drag gestures instead of scrolling the page.

## Files

- `retro-surfer.js` — the whole game (art and styles included)
- `index.html` — the standalone page: boot, title, game
- `title.js`, `title.css` — the page's title, sheets and play frame
- `gk-title.js`, `gk-tokens.css` — games-meta canon, copied byte for byte
- `tools/gen-sprites.js` — sprite art generator, dev-only
- `tools/splice.js` — regenerates the art and writes it into the game, dev-only
- `tools/sheet.js` — PNG contact sheet of every sprite, dev-only
- `tools/check-sprites.js` — art integrity check, run in CI

## Deploying

Pushing to `main` runs `.gitlab-ci.yml`, which validates and then rsyncs
`index.html`, `retro-surfer.js` and a `version.json` fingerprint over SSH to
**https://greykit.com/games/retrosurfer96/**. There's no build step — the game
is one self-contained script that injects its own CSS.

Auth comes from `DREAMHOST_SSH_KEY`, `DREAMHOST_HOST` and `DREAMHOST_USERNAME`,
inherited from the `greykit-app` group. They're *protected* variables, so
they only reach pipelines on protected branches; `main` is protected here. If a
deploy fails at the `ssh` step with empty variables, that's the thing to check.

The validate stage runs `node --check` plus `tools/check-sprites.js`, which
catches the failure modes this codebase actually has — a grid row that lost a
character, a pixel referencing a colour that isn't in its palette, a sprite no
era can spawn, or a hazard wearing the reserved pickup green. None of those
throw at runtime; they just render wrong.

```bash
node tools/check-sprites.js
```
