/* ------------------------------------------------------------------
   jitter.test.js — the playback buffer, against a bad line.

   The worklet runs in a vm with a stub AudioWorklet around it: a clock in
   128-sample render quanta at 48 kHz, and a port. A voice is fed in the
   way TCP delivers it over a poor connection — every frame late by a
   different amount, clumps, a 150 ms stall every couple of seconds with
   everything held behind it arriving at once, and one frame lost on the
   way — and what comes out is listened to: every stretch of silence in
   the middle of speech is a gap somebody hears.

   `COMPARE=path/to/old/voice-worklet.js node test/jitter.test.js` also
   runs an older buffer through the same line, fed the old way.
------------------------------------------------------------------ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const H = require('./harness');
const { test, eq, ok, report } = H;

const RATE = 24000, FRAME = 480, OUT = 48000, QUANTUM = 128;
const STALL = Number(process.env.STALL) || 0.15;      // seconds; try STALL=0.3 with COMPARE

function load(file) {
  const ctx = { console, Math, Float32Array, Int16Array, ArrayBuffer, Number, Infinity, currentTime: 0, sampleRate: OUT };
  ctx.globalThis = ctx;
  ctx.AudioWorkletProcessor = class { constructor() { this.port = { postMessage: () => {}, onmessage: null }; } };
  ctx.registerProcessor = (name, cls) => { ctx.Processor = cls; };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
  return ctx;
}

// a seeded random, so a failure can be run again
function rng(seed) { return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296); }

/* Ten seconds of continuous speech as 500 frames, and when each lands. */
function line(seed) {
  const r = rng(seed);
  const frames = [];
  let stallUntil = 0;
  for (let n = 0; n < 500; n++) {
    const sent = n * 0.02;
    if (n % 100 === 37) stallUntil = sent + STALL;     // a stall every two seconds
    let at = sent + 0.03 + -Math.log(1 - r()) * 0.012;  // 30 ms away, give or take
    if (sent < stallUntil) at = Math.max(at, stallUntil + 0.03);
    if (n === 250) continue;                            // lost: the sender skipped it
    const pcm = new Int16Array(FRAME);
    for (let i = 0; i < FRAME; i++) pcm[i] = Math.round(8000 * Math.sin(2 * Math.PI * 220 * (n * FRAME + i) / RATE));
    frames.push({ n, at, pcm });
  }
  // TCP never reorders: a frame cannot land before the one sent before it
  for (let i = 1; i < frames.length; i++) frames[i].at = Math.max(frames[i].at, frames[i - 1].at);
  return frames;
}

function run(file, old, seed) {
  const ctx = load(file);
  const node = new ctx.Processor({ processorOptions: { capture: false } });
  const frames = line(seed);
  const out = new Float32Array(QUANTUM);
  let k = 0, heardFrom = -1, lastSound = -1, gaps = 0, silentRun = 0, maxDepth = 0, loudQuanta = 0;
  const quanta = Math.ceil(11 * OUT / QUANTUM);
  for (let q = 0; q < quanta; q++) {
    ctx.currentTime = q * QUANTUM / OUT;
    while (k < frames.length && frames[k].at <= ctx.currentTime) {
      const f = frames[k++];
      if (old) node.port.onmessage({ data: f.pcm.buffer.slice(0) });
      else node.port.onmessage({ data: { seq: f.n & 0xffff, start: f.n === 0, pcm: Float32Array.from(f.pcm, v => v / 32768) } });
    }
    out.fill(0);
    node.process([], [[out]]);
    const loud = out.some(v => Math.abs(v) > 0.01);
    if (loud) {
      loudQuanta++;
      if (heardFrom < 0) heardFrom = ctx.currentTime;
      // a stretch of silence of 5 ms or more, between two sounds, is a gap you hear
      if (lastSound >= 0 && silentRun * QUANTUM / OUT >= 0.005) gaps++;
      silentRun = 0; lastSound = ctx.currentTime;
    } else if (heardFrom >= 0) silentRun++;
    if (!old) maxDepth = Math.max(maxDepth, node.length / RATE);
  }
  return { gaps, start: heardFrom, end: lastSound, maxDepth, underruns: old ? null : node.underruns,
           audible: loudQuanta * QUANTUM / OUT };
}

const NEW = path.join(H.ROOT, 'js/core/voice-worklet.js');
const seeds = [1, 2, 3, 4, 5];
const results = seeds.map(s => run(NEW, false, s));

test('a bad line is played with no more than a gap or two in ten seconds', () => {
  for (const [i, r] of results.entries()) ok(r.gaps <= 2, 'seed ' + seeds[i] + ': ' + r.gaps + ' gaps');
});

test('it gets there by holding more, not by holding everything', () => {
  for (const r of results) ok(r.maxDepth <= 0.45, 'deepest ' + Math.round(r.maxDepth * 1000) + 'ms');
  for (const r of results) ok(r.start < 0.2, 'first sound after ' + Math.round(r.start * 1000) + 'ms');
});

test('nothing that arrived is thrown away', () => {
  // 499 of the 500 frames arrived; all of that is heard (the steering may stretch it slightly)
  for (const r of results) ok(r.audible > 9.9, 'audible for ' + r.audible.toFixed(2) + 's of 9.98s');
});

test('ten seconds sent is ten seconds heard, give or take the stalls', () => {
  for (const r of results) {
    const heard = r.end - r.start;
    ok(heard > 9.5 && heard < 10.3, 'heard for ' + heard.toFixed(2) + 's');
  }
});

test('a good line is played straight through', () => {
  const ctx = load(NEW);
  const node = new ctx.Processor({ processorOptions: { capture: false } });
  const out = new Float32Array(QUANTUM);
  let fed = 0, gaps = 0, silent = 0, started = false;
  for (let q = 0; q < Math.ceil(3 * OUT / QUANTUM); q++) {
    ctx.currentTime = q * QUANTUM / OUT;
    while (fed < 100 && 0.03 + fed * 0.02 <= ctx.currentTime) {
      const pcm = new Float32Array(FRAME).fill(0.2);
      node.port.onmessage({ data: { seq: fed, start: fed === 0, pcm } });
      fed++;
    }
    out.fill(0);
    node.process([], [[out]]);
    const loud = out.some(v => Math.abs(v) > 0.01);
    if (loud) { if (started && silent) gaps++; started = true; silent = 0; } else if (started && fed < 100) silent++;
  }
  eq(gaps, 0, 'no gaps');
  eq(node.underruns, 0, 'never ran dry');
  ok(node.target / RATE <= 0.07, 'and kept the buffer short: ' + Math.round(node.target / RATE * 1000) + 'ms');
});

if (process.env.COMPARE) {
  const before = seeds.map(s => run(process.env.COMPARE, true, s));
  console.log('\n  gaps per 10 s, same line:  old ' + before.map(r => r.gaps).join(' ') + '   new ' + results.map(r => r.gaps).join(' '));
  console.log('  audio heard of 9.98 s:     old ' + before.map(r => r.audible.toFixed(2)).join(' ')
    + '   new ' + results.map(r => r.audible.toFixed(2)).join(' '));
}
report();
