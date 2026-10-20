/* Retro Surfer '96 -- the title theme: surf rock, played on a sound chip.
 *
 * A tremolo-picked lead over the surf idiom's falling Am-G-F-E, a choked
 * square-wave riff to count it in, a triangle bass, a surf beat on the noise
 * channel with a tom fill at each turn, and the lead's own echo for a
 * reverb. Original material; nothing here is sampled or transcribed, and
 * there are no audio files. The surf is in the playing -- the tremolo, the
 * dive down the neck, the echo -- and the chip is the game's own era.
 *
 * The count-in is two bars, so at 168 the tune proper comes in 2.86 s after
 * it starts: the moment the title's menu arrives (gk-intro's timing.menu).
 *
 *   const m = RSMusic.create(ac, out);   out is the music bus
 *   m.start();                           from the count-in; again is a no-op
 *   m.stop();                            fades out over a quarter second
 *
 * RSMusic.render(seconds, { mute }) renders the theme offline and resolves an
 * AudioBuffer, for checking levels without a speaker (the console). */
"use strict";
(() => {
  const BPM = 168, BEAT = 60 / BPM, S16 = BEAT / 4;
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

  /* ---- the score, in beats. A bar is four. ---- */
  /* the lead: [midi, beats]; null rests. Notes of a beat or more are
     tremolo-picked in sixteenths, shorter ones picked once. ["dive", beats]
     is the slide down the neck that ends the B section. Written on the
     guitar's low strings, E3-E4; the chip plays it an octave up (UP). */
  const A1 = [
    [64, 2], [60, 1], [62, 1],                 /* Am */
    [62, 1.5], [59, .5], [55, 2],              /* G  */
    [57, 1], [60, 1], [65, 2],                 /* F  */
    [59, 1], [56, 1], [64, 2]                  /* E  */
  ];
  const A2 = [
    [64, 1], [65, .5], [64, .5], [60, 2],
    [62, 1], [64, .5], [62, .5], [59, 2],
    [60, 1], [62, .5], [60, .5], [57, 2],
    [56, 1], [59, 1], [52, 1], [null, 1]
  ];
  const B = [
    [69, 2], [65, 1], [62, 1],                 /* Dm */
    [65, 1], [69, 1], [74, 2],                 /* Dm */
    [72, 2], [69, 1], [64, 1],                 /* Am */
    [69, 4],                                   /* Am */
    [65, 1], [69, 1], [72, 2],                 /* F  */
    [71, 1], [67, 1], [62, 2],                 /* G  */
    [68, 2], [71, 1], [68, 1],                 /* E  */
    [64, 2], ["dive", 2]                       /* E  */
  ];
  /* the chords under it, a bar each: the bass's roots */
  const CHORDS_A = [45, 43, 41, 40, 45, 43, 41, 40];
  const CHORDS_B = [38, 38, 45, 45, 41, 43, 40, 40];
  /* the count-in: palm-muted eighths on the low strings, two bars */
  const RIFF = [45, 45, 45, 45, 48, 48, 47, 47, 45, 45, 45, 45, 43, 43, 44, 44];

  /* the loop after the count-in: A1 A2 B, 24 bars, then round again */
  const LEAD = [...A1, ...A2, ...B];
  const BASS = [...CHORDS_A, ...CHORDS_B];
  const LOOP_BARS = BASS.length, COUNT_BARS = 2, UP = 12;

  /* every note as an event with an absolute beat, so the scheduler only has
     to walk a sorted list: built once */
  function score() {
    const ev = [];
    const at = (beat, f) => ev.push({ beat, f });
    /* count-in: the riff, kick on the beat, then a snare-and-tom fill */
    RIFF.forEach((m, i) => at(i * .5, (v, t) => v.mute(m, t)));
    for (let b = 0; b < 8; b++) at(b, (v, t) => v.kick(t, b % 4 === 0 ? 1 : .7));
    for (let b = 0; b < 8; b++) at(b + .5, (v, t) => v.hat(t, .5));
    [6, 6.5, 7, 7.25, 7.5, 7.75].forEach((b, i) => at(b, (v, t) => i < 2 ? v.snare(t, .8) : v.tom(t, 1 - i * .08, i)));
    /* the loop, offset by the count-in */
    const loopBeats = LOOP_BARS * 4, off = COUNT_BARS * 4;
    let beat = off;
    for (const [m, len] of LEAD) {
      const dur = len * BEAT;
      if (m === "dive") at(beat, (v, t) => v.lead(76 + UP, t, dur, true, 45 + UP));
      else if (m !== null) at(beat, (v, t) => v.lead(m + UP, t, dur * .97, len >= 1));
      beat += len;
    }
    BASS.forEach((root, bar) => {
      const b0 = off + bar * 4;
      /* root and fifth in eighths, up to the octave at the end of the bar */
      [root, root, root + 7, root, root, root + 7, root + 12, root + 7].forEach((m, i) => at(b0 + i * .5, (v, t) => v.bass(m, t, BEAT * .45)));
      /* the surf beat: kick on 1 and 3 (and the and of 3), snare on 2 and 4, eighth hats */
      const turn = bar % 8 === 7;
      for (let b = 0; b < 4; b++) {
        if (b === 0 || b === 2) at(b0 + b, (v, t) => v.kick(t, 1));
        if (b === 2) at(b0 + b + .5, (v, t) => v.kick(t, .6));
        if ((b === 1 || b === 3) && !(turn && b === 3)) at(b0 + b, (v, t) => v.snare(t, 1));
        if (!(turn && b >= 2)) { at(b0 + b, (v, t) => v.hat(t, .8)); at(b0 + b + .5, (v, t) => v.hat(t, .45)); }
      }
      /* a turn: toms rolling down the kit in sixteenths over the last two beats */
      if (turn) for (let k = 0; k < 8; k++) at(b0 + 2 + k / 4, (v, t) => v.tom(t, 1 - k * .04, k >> 1));
      /* a crash where each section lands */
      if (bar === 0 || bar === 8 || bar === 16) at(b0, (v, t) => v.crash(t));
    });
    ev.sort((a, b) => a.beat - b.beat);
    return { ev, off, loopBeats };
  }
  let SCORE = null;

  /* ---- the chip ----
     The channels of a 90s sound chip, more or less: two pulse waves (the
     lead and its echo), a triangle (the bass and the kick's thump) and a
     noise channel (the kit). Pulses are band-limited PeriodicWaves at the
     chip's duty cycles, so they buzz without aliasing. */
  const pulseCache = new WeakMap();
  function pulse(ac, duty) {
    let per = pulseCache.get(ac);
    if (!per) pulseCache.set(ac, per = new Map());
    if (!per.has(duty)) {
      const N = 64, re = new Float32Array(N), im = new Float32Array(N);
      for (let n = 1; n < N; n++) {
        re[n] = Math.sin(2 * Math.PI * n * duty) / (n * Math.PI);
        im[n] = (1 - Math.cos(2 * Math.PI * n * duty)) / (n * Math.PI);
      }
      per.set(duty, ac.createPeriodicWave(re, im));
    }
    return per.get(duty);
  }
  /* noise as the chip makes it: white for the hats, and a coarse one --
     each value held for several samples -- for the snare's crunch */
  const noiseCache = new WeakMap();
  function noiseBufs(ac) {
    if (noiseCache.has(ac)) return noiseCache.get(ac);
    const mk = hold => {
      const b = ac.createBuffer(1, ac.sampleRate, ac.sampleRate), d = b.getChannelData(0);
      let v = 0;
      for (let i = 0; i < d.length; i++) { if (i % hold === 0) v = Math.random() < .5 ? -1 : 1; d[i] = v; }
      return b;
    };
    const bufs = { hi: mk(1), lo: mk(6) };
    noiseCache.set(ac, bufs);
    return bufs;
  }

  /* the mix: everything sums here, then a compressor keeps the peaks under
     full scale, whatever the bus above does */
  const MIX = { level: .5 };
  function voices(ac, dest, mute = []) {
    const out = ac.createGain(), glue = ac.createDynamicsCompressor();
    out.gain.value = MIX.level;
    glue.threshold.value = -12; glue.knee.value = 6; glue.ratio.value = 3;
    glue.attack.value = .003; glue.release.value = .15;
    out.connect(glue); glue.connect(dest);

    /* the pulses through a gentle roll-off, so the buzz is bright, not shrill */
    const sq = ac.createGain(), soft = ac.createBiquadFilter();
    soft.type = "lowpass"; soft.frequency.value = 7000; soft.Q.value = .3;
    sq.connect(soft); soft.connect(out);
    /* the echo channel: the lead again, a dotted eighth late, thinner and
       quieter, panned off to one side -- the chip's stand-in for reverb */
    const echo = ac.createGain(), echoD = ac.createDelay(1), echoFb = ac.createGain(), echoPan = ac.createStereoPanner ? ac.createStereoPanner() : ac.createGain();
    echo.gain.value = .32; echoD.delayTime.value = BEAT * .75; echoFb.gain.value = .25;
    if (echoPan.pan) echoPan.pan.value = .35;
    echoD.connect(echoFb); echoFb.connect(echoD); echoD.connect(echo); echo.connect(echoPan); echoPan.connect(soft);
    const tri = ac.createGain();
    tri.connect(out);
    const kit = ac.createGain();
    kit.connect(out);
    const NB = noiseBufs(ac);
    /* an envelope's gain starts shut: a new GainNode stands at 1, and a sound
       starting between two samples lets one of them through at full scale
       before the envelope's first value lands -- a click on every hit */
    const silent = () => { const g = ac.createGain(); g.gain.value = 0; return g; };

    const noise = (t, len, buf, peak, rate = 1) => {
      const s = ac.createBufferSource(), g = silent();
      s.buffer = buf; s.loop = true; s.playbackRate.value = rate;
      g.gain.setValueAtTime(peak, t);
      g.gain.exponentialRampToValueAtTime(.0001, t + len);
      s.connect(g); g.connect(kit);
      s.start(t, Math.random() * .5); s.stop(t + len + .02);
    };
    const triSweep = (t, f0, f1, len, peak) => {
      const o = ac.createOscillator(), g = silent();
      o.type = "triangle";
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f1, t + len);
      g.gain.setValueAtTime(peak, t);
      g.gain.setValueAtTime(peak, t + len * .8);
      g.gain.linearRampToValueAtTime(0, t + len);
      o.connect(g); g.connect(kit);
      o.start(t); o.stop(t + len + .02);
    };

    /* one pulse note: the oscillator runs the whole note, and each pick
       restarts the chip's volume envelope -- full, then falling to hold --
       which is how a chip does a surf tremolo. to slides the pitch there. */
    function note(m, t, dur, picks, { duty = .25, to = null, peak = .6, hold = .45, vib = true, into = sq, send = true } = {}) {
      const f = mtof(m), end = t + dur;
      const o = ac.createOscillator(), g = silent();
      o.setPeriodicWave(pulse(ac, duty));
      o.frequency.setValueAtTime(f, t);
      if (to !== null) o.frequency.exponentialRampToValueAtTime(mtof(to), end);
      /* a held note gets the chip's vibrato, coming in after the attack */
      if (vib && dur > .45 && to === null) {
        const lfo = ac.createOscillator(), depth = silent();
        lfo.frequency.value = 6;
        depth.gain.setValueAtTime(0, t);
        depth.gain.setValueAtTime(0, t + .22);
        depth.gain.linearRampToValueAtTime(f * .006, t + Math.min(.6, dur));
        lfo.connect(depth); depth.connect(o.frequency);
        lfo.start(t); lfo.stop(end + .05);
      }
      g.gain.setValueAtTime(0, t);
      picks.forEach(([dt, acc], i) => {
        const p = t + dt, next = i + 1 < picks.length ? t + picks[i + 1][0] : end;
        const span = Math.max(.02, next - p);
        /* a hair of silence between picks, so each one is heard */
        if (i) g.gain.linearRampToValueAtTime(0, p);
        g.gain.linearRampToValueAtTime(peak * acc, p + .002);
        g.gain.setTargetAtTime(peak * hold * acc, p + .002, span * .35);
        if (i + 1 < picks.length) g.gain.setValueAtTime(peak * acc * (hold + (1 - hold) * Math.exp(-(span - .006) / (span * .35))), next - .004);
      });
      g.gain.setValueAtTime(peak * hold, Math.max(t, end - .012));
      g.gain.linearRampToValueAtTime(0, end);
      o.connect(g); g.connect(into);
      if (send) g.connect(echoD);
      o.start(t); o.stop(end + .02);
    }
    /* sixteenth picks across dur, the off-strokes a touch softer */
    const tremolo = dur => { const p = []; for (let x = 0; x < dur - .01; x += S16) p.push([x, p.length % 2 ? .75 : 1]); return p; };

    const v = {
      /* the lead: tremolo-picked or picked once; to slides it there (the dive) */
      lead(m, t, dur, trem, to = null) {
        note(m, t, dur, trem ? tremolo(dur) : [[0, 1]], to === null ? {} : { to, hold: .7 });
      },
      /* the count-in riff: a fat square, short and choked */
      mute(m, t) { note(m, t, BEAT * .38, [[0, 1]], { duty: .5, peak: .55, hold: .2, vib: false, send: false }); },
      /* the bass: the triangle, gated short, as a chip's triangle is (it has no volume) */
      bass(m, t, len) {
        const o = ac.createOscillator(), g = silent();
        o.type = "triangle"; o.frequency.value = mtof(m);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(.2, t + .003);
        g.gain.setValueAtTime(.2, t + len - .01);
        g.gain.linearRampToValueAtTime(0, t + len);
        o.connect(g); g.connect(tri);
        o.start(t); o.stop(t + len + .02);
      },
      /* the kick: the triangle dropping fast, with a click of noise on top */
      kick(t, v) { triSweep(t, 180, 45, .1, .36 * v); noise(t, .015, NB.lo, .08 * v); },
      snare(t, v) { noise(t, .14, NB.lo, .27 * v, .8); noise(t, .05, NB.hi, .12 * v); },
      hat(t, v) { noise(t, .03, NB.hi, .14 * v); },
      tom(t, v, step) { const f = 220 - step * 30; triSweep(t, f, f * .55, .14, .4 * v); },
      crash(t) { noise(t, 1, NB.hi, .1); noise(t, .5, NB.lo, .06, .5); }
    };
    /* render's mute: silence some parts, to hear (or measure) the rest */
    for (const k of mute) if (v[k]) v[k] = () => {};
    return v;
  }

  /* ---- the player ---- */
  function create(ac, out) {
    let song = null, timer = 0;
    function start() {
      if (song || !ac) return;
      SCORE = SCORE || score();
      const bus = ac.createGain();
      bus.connect(out);
      const v = voices(ac, bus);
      const t0 = ac.currentTime + .08;
      /* walk the score a little ahead of the clock: the whole of it once,
         then the loop alone, round and round -- the count-in does not repeat */
      const loop = SCORE.ev.filter(e => e.beat >= SCORE.off);
      let list = SCORE.ev, i = 0, base = 0;
      song = { bus };
      const run = () => {
        const horizon = ac.currentTime + .25;
        for (;;) {
          if (i >= list.length) { list = loop; i = 0; base += SCORE.loopBeats; }
          const e = list[i], t = t0 + (e.beat + base) * BEAT;
          if (t > horizon) break;
          /* a throttled timer (a background tab) drops what it missed rather than piling it up */
          if (t >= ac.currentTime - .02) try { e.f(v, t); } catch (err) { /* no sound */ }
          i++;
        }
      };
      run();
      timer = setInterval(run, 50);
    }
    function stop() {
      if (!song) return;
      clearInterval(timer);
      const { bus } = song, t = ac.currentTime;
      song = null;
      bus.gain.setValueAtTime(bus.gain.value, t);
      bus.gain.linearRampToValueAtTime(0, t + .25);
      setTimeout(() => bus.disconnect(), 400);
    }
    return { start, stop, get playing() { return !!song; } };
  }

  /* render the theme offline: the count-in and the loop, no speaker needed.
     mute names parts to leave out: lead, mute, bass, kick, snare, hat, tom,
     crash */
  function render(seconds = 20, { sr = 44100, mute = [] } = {}) {
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const ac = new OAC(2, Math.ceil(seconds * sr), sr);
    SCORE = SCORE || score();
    const v = voices(ac, ac.destination, mute), t0 = .05;
    for (let lap = 0; t0 + (SCORE.off + lap * SCORE.loopBeats) * BEAT < seconds; lap++) {
      for (const e of SCORE.ev) {
        if (lap && e.beat < SCORE.off) continue;
        const t = t0 + (e.beat + lap * SCORE.loopBeats) * BEAT;
        if (t < seconds) e.f(v, t);
      }
    }
    return ac.startRendering();
  }

  window.RSMusic = { create, render, MIX, BPM, COUNT_IN: COUNT_BARS * 4 * BEAT };
})();
