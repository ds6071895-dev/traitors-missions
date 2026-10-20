/* 24 kHz mono, 20 ms per packet. Resample against the device's actual
   AudioContext rate.

   Capture hands each voiced packet (and the packet before it, so the start
   of a word is not lost) to whoever holds its port: the voice worker when
   there is one, the main thread when there is not.

   Playback is an adaptive jitter buffer. Frames come over TCP, so they are
   never reordered but they do arrive in clumps: a quiet second, then four
   frames at once. The buffer learns how late frames run behind the best
   the line has done this talkspurt, and holds that much — at least 60 ms,
   at most 250 — before it plays. It runs dry with a fade rather than a
   click, and picks up again as soon as a little has come rather than
   waiting the whole target out in silence. Then it steers its depth
   without gaps: a couple of percent slow while it is shallower than it
   wants, a few percent fast when it has filled too deep — never throwing
   anything away. */
const RATE = 24000;
const FRAME = 480;
const RING = RATE;                 // one second
const FADE = 120;                  // 5 ms of source samples
const MIN_TARGET = 0.06, MAX_TARGET = 0.25, TARGET_PAD = 0.03;
const PEAK_HALF_LIFE = 6;          // seconds for a remembered stall to halve
const HANGOVER = 0.4;              // seconds sent after the last loud packet
const SPEECH = 0.00001;            // mean energy that counts as voice

class RoomVoiceProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.capture = !!options.processorOptions.capture;
    this.alive = true;
    this.phase = 0;
    if (this.capture) {
      this.sum = 0;
      this.count = 0;
      this.packet = new Int16Array(FRAME);
      this.prev = null;            // the packet before speech, sent with its first
      this.offset = 0;
      this.energy = 0;
      this.speechUntil = 0;
      this.sending = false;
      this.out = this.port;
    } else {
      this.ring = new Float32Array(RING);
      this.read = 0;
      this.write = 0;
      this.length = 0;
      this.playing = false;
      this.gain = 0;
      this.fast = false;
      this.slow = false;
      this.dry = false;            // ran out mid-talkspurt, and has not picked up since
      this.resuming = false;       // picking up after running dry: play on a little
      this.target = MIN_TARGET * RATE;
      this.peak = 0;
      this.dMin = 0;
      this.lastSeq = null;
      this.lastArrival = -1;
      this.underruns = 0;
      this.statsAt = 0;
    }
    this.port.onmessage = event => this.message(event.data);
  }

  message(data) {
    if (data === 'stop') { this.alive = false; return; }
    if (data && data.type === 'port' && data.port) {
      if (this.capture) this.out = data.port;
      else data.port.onmessage = event => this.message(event.data);
      return;
    }
    if (this.capture) return;
    // the old shape, a bare PCM16 buffer, is a frame with nothing known about it
    if (data instanceof ArrayBuffer) data = { pcm: data, seq: null, start: null };
    if (!data || !data.pcm) return;
    const samples = data.pcm instanceof Float32Array ? data.pcm
      : data.pcm instanceof ArrayBuffer ? int16ToFloat(new Int16Array(data.pcm)) : null;
    if (!samples || !samples.length) return;
    this.arrive(samples, data.seq, data.start);
  }

  /* How late this frame is against the earliest any frame of this
     talkspurt has come, and so how deep the buffer should be. */
  arrive(samples, seq, start) {
    const now = currentTime;
    const gap = this.lastArrival < 0 ? Infinity : now - this.lastArrival;
    let n;
    if (Number.isInteger(seq)) {
      if (this.lastSeq === null) n = seq;
      else {
        const step = (seq - (this.lastSeq & 0xffff) + 0x10000) & 0xffff;
        n = this.lastSeq + (step || 0x10000);
      }
    } else n = this.lastSeq === null ? 0 : this.lastSeq + 1;
    const lost = this.lastSeq === null ? 0 : n - this.lastSeq - 1;
    /* A new talkspurt resets the measure. The sender says so when it can;
       a frame from an older sender that says nothing is taken as new after
       a quarter of a second without one. */
    const spurt = start === true || this.lastSeq === null || lost > 50
      || (start !== false && start !== true && gap > 0.25);
    this.lastSeq = n;
    const d = now - n * FRAME / RATE;
    if (spurt) this.dMin = d;
    else if (d < this.dMin) this.dMin = d;
    const late = d - this.dMin;
    const decay = Number.isFinite(gap) ? Math.pow(0.5, gap / PEAK_HALF_LIFE) : 1;
    this.peak = Math.max(late, this.peak * decay);
    this.target = Math.round(Math.max(MIN_TARGET, Math.min(MAX_TARGET, this.peak + TARGET_PAD)) * RATE);
    this.lastArrival = now;

    // a frame lost on the way: ease out of what is queued and into this one
    if (lost > 0 && !spurt && this.length >= FADE) {
      for (let i = 0; i < FADE; i++) {
        const at = (this.write - FADE + i + RING) % RING;
        this.ring[at] *= 1 - (i + 1) / FADE;
      }
    }
    const fadeIn = lost > 0 && !spurt;
    // full: drop the oldest, never the lot
    const over = this.length + samples.length - RING;
    if (over > 0) { this.read = (this.read + over) % RING; this.length -= over; }
    for (let i = 0; i < samples.length; i++) {
      const v = fadeIn && i < FADE ? samples[i] * (i + 1) / FADE : samples[i];
      this.ring[this.write] = v;
      this.write = (this.write + 1) % RING;
    }
    this.length += samples.length;
    if (spurt) { this.dry = false; this.resuming = false; }
    else if (this.dry && !this.playing) { this.underruns++; this.dry = false; this.resuming = true; }
    // after running dry, play again at once on a little; the slow steer makes up the rest
    const need = this.resuming ? MIN_TARGET * RATE : this.target;
    if (!this.playing && this.length >= need) { this.playing = true; this.resuming = false; }
  }

  process(inputs, outputs) {
    if (!this.alive) return false;
    const output = outputs[0] && outputs[0][0];
    if (!output) return true;
    if (this.capture) this.captureBlock(inputs[0]);
    else this.playBlock(output);
    return true;
  }

  captureBlock(channels) {
    if (!channels || !channels.length) return;
    const n = channels[0].length;
    for (let i = 0; i < n; i++) {
      let value = 0;
      for (const channel of channels) value += channel[i] || 0;
      this.sum += value / channels.length; this.count++;
      this.phase += RATE;
      if (this.phase < sampleRate) continue;
      this.phase -= sampleRate;
      const sample = Math.max(-1, Math.min(1, this.sum / this.count));
      this.packet[this.offset++] = Math.round(sample * 32767);
      this.energy += sample * sample;
      this.sum = this.count = 0;
      if (this.offset < FRAME) continue;
      // Stop transmitting silence; keep a tail for quiet word endings.
      if (this.energy / FRAME > SPEECH) this.speechUntil = currentTime + HANGOVER;
      if (currentTime < this.speechUntil) {
        if (!this.sending && this.prev) {
          const lead = this.prev; this.prev = null;
          this.out.postMessage({ pcm: lead.buffer, at: currentTime, start: true }, [lead.buffer]);
          this.out.postMessage({ pcm: this.packet.buffer, at: currentTime, start: false }, [this.packet.buffer]);
        } else {
          this.out.postMessage({ pcm: this.packet.buffer, at: currentTime, start: !this.sending }, [this.packet.buffer]);
        }
        this.sending = true;
        this.packet = new Int16Array(FRAME);
      } else {
        this.sending = false;
        // keep this one as the lead-in for whatever is said next
        const keep = this.packet;
        this.packet = this.prev && this.prev.length === FRAME ? this.prev : new Int16Array(FRAME);
        this.prev = keep;
      }
      this.offset = 0;
      this.energy = 0;
    }
  }

  playBlock(output) {
    // a short talkspurt that never reached the target still gets said
    if (!this.playing && this.length > 0 && currentTime - this.lastArrival > 0.1) this.playing = true;
    if (this.playing) {
      if (this.length > this.target + 0.08 * RATE) this.fast = true;
      else if (this.length < this.target + 0.02 * RATE) this.fast = false;
      // only while frames are still coming: at the end of a talkspurt it simply runs out
      const flowing = currentTime - this.lastArrival < 0.1;
      if (flowing && this.length < this.target - 0.02 * RATE) this.slow = true;
      else if (!flowing || this.length >= this.target) this.slow = false;
      const step = (RATE / sampleRate) * (this.fast ? 1.04 : this.slow ? 0.975 : 1);
      const rise = 1 / (0.005 * sampleRate);
      for (let i = 0; i < output.length; i++) {
        if (this.length < 2) {
          // ran dry: what was left faded itself out on the way down
          this.dry = true;
          this.playing = false; this.phase = 0; this.gain = 0;
          break;
        }
        const a = this.ring[this.read], b = this.ring[(this.read + 1) % RING];
        // fade in from a stop; fade out as the last 5 ms runs down
        const room = this.length >= FADE ? 1 : this.length / FADE;
        this.gain = Math.min(room, this.gain + rise);
        output[i] = (a + (b - a) * this.phase) * this.gain;
        this.phase += step;
        while (this.phase >= 1 && this.length) {
          this.phase--;
          this.read = (this.read + 1) % RING;
          this.length--;
        }
      }
    }
    if (currentTime - this.statsAt >= 1) {
      this.statsAt = currentTime;
      this.port.postMessage({ type: 'stats', underruns: this.underruns,
        depth: Math.round(this.length / RATE * 1000), target: Math.round(this.target / RATE * 1000) });
    }
  }
}

function int16ToFloat(pcm) {
  const out = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) out[i] = pcm[i] / 32768;
  return out;
}

registerProcessor('room-voice', RoomVoiceProcessor);
