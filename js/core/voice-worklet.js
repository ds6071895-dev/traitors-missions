/* 24 kHz mono PCM16, 20 ms per packet. Resample against the device's actual
   AudioContext rate; playback keeps a small, bounded jitter buffer. */
class RoomVoiceProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.capture = !!options.processorOptions.capture;
    this.alive = true;
    this.phase = 0;
    this.sum = 0;
    this.count = 0;
    this.packet = new Int16Array(480);
    this.offset = 0;
    this.energy = 0;
    this.speechUntil = 0;
    this.ring = new Float32Array(4800);
    this.read = 0;
    this.write = 0;
    this.length = 0;
    this.playing = false;
    this.port.onmessage = event => {
      if (event.data === 'stop') { this.alive = false; return; }
      if (this.capture) return;
      const data = new Int16Array(event.data);
      if (this.length + data.length > this.ring.length) {
        this.read = this.write; this.length = 0; this.playing = false;
      }
      for (const value of data) {
        this.ring[this.write] = value / 32768;
        this.write = (this.write + 1) % this.ring.length;
        this.length++;
      }
      if (this.length >= 960) this.playing = true;
    };
  }
  process(inputs, outputs) {
    if (!this.alive) return false;
    const output = outputs[0] && outputs[0][0];
    if (!output) return true;
    if (this.capture) {
      const channels = inputs[0];
      if (!channels || !channels.length) return true;
      for (let i = 0; i < output.length; i++) {
        let value = 0;
        for (const channel of channels) value += channel[i] || 0;
        this.sum += value / channels.length; this.count++;
        this.phase += 24000;
        if (this.phase >= sampleRate) {
          this.phase -= sampleRate;
          const sample = Math.max(-1, Math.min(1, this.sum / this.count));
          this.packet[this.offset++] = Math.round(sample * 32767);
          this.energy += sample * sample;
          this.sum = this.count = 0;
          if (this.offset === 480) {
            // Stop transmitting silence; keep a short tail for quiet word endings.
            if (this.energy / 480 > .00001) this.speechUntil = currentTime + .25;
            if (currentTime < this.speechUntil) {
              this.port.postMessage({ pcm: this.packet.buffer, at: currentTime }, [this.packet.buffer]);
            }
            this.packet = new Int16Array(480); this.offset = 0;
            this.energy = 0;
          }
        }
      }
    } else if (this.playing) {
      for (let i = 0; i < output.length; i++) {
        if (this.length < 2) { this.playing = false; this.phase = 0; break; }
        const a = this.ring[this.read], b = this.ring[(this.read + 1) % this.ring.length];
        output[i] = a + (b - a) * this.phase;
        this.phase += 24000 / sampleRate;
        while (this.phase >= 1 && this.length) {
          this.phase--;
          this.read = (this.read + 1) % this.ring.length;
          this.length--;
        }
      }
    }
    return true;
  }
}
registerProcessor('room-voice', RoomVoiceProcessor);
