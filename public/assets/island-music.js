// Original procedural score: Island Sunshine, 116 BPM. No recordings or samples.
window.IslandMusic = class {
  constructor(context) {
    this.context = context;
    this.output = context.createGain();
    this.output.connect(context.destination);
    this.volume = 0.18;
    this.enabled = true;
    this.ducked = false;
    this.step = 0;
    this.next = 0;
    this.timer = null;
  }
  level() {
    const c = this.context;
    this.output.gain.setTargetAtTime(
      this.enabled ? this.volume * (this.ducked ? 0.16 : 1) : 0,
      c.currentTime,
      0.12,
    );
  }
  setVolume(value) {
    this.volume = Math.max(0, Math.min(0.35, Number(value) || 0));
    this.level();
  }
  duck(value) {
    this.ducked = value;
    this.level();
  }
  toggle() {
    this.enabled = !this.enabled;
    this.level();
    return this.enabled;
  }
  tone(midi, at, duration, volume, type = "sine") {
    const c = this.context,
      o = c.createOscillator(),
      g = c.createGain();
    o.type = type;
    o.frequency.value = 440 * 2 ** ((midi - 69) / 12);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(volume, at + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    o.connect(g);
    g.connect(this.output);
    o.start(at);
    o.stop(at + duration + 0.02);
    o.onended = () => {
      o.disconnect();
      g.disconnect();
    };
  }
  start() {
    if (this.timer) return;
    this.next = this.context.currentTime + 0.08;
    this.level();
    const schedule = () => {
      const c = this.context;
      if (c.state !== "running") return;
      if (this.next < c.currentTime) this.next = c.currentTime + 0.05;
      while (this.next < c.currentTime + 0.25) {
        this.beat(this.step++, this.next);
        this.next += 60 / 116 / 2;
      }
    };
    schedule();
    this.timer = setInterval(schedule, 50);
  }
  beat(step, at) {
    const chords = [
      [60, 64, 67],
      [57, 60, 64],
      [65, 69, 72],
      [55, 59, 62],
      [60, 64, 69],
      [65, 69, 72],
      [62, 65, 69],
      [55, 59, 67],
    ];
    const melody = [
      [72, 76, 79, 76, 74, 72, 67, 69],
      [72, 71, 69, 64, 67, 69, 72, 76],
      [77, 76, 72, 69, 72, 74, 77, 79],
      [74, 71, 67, 62, 67, 71, 74, 71],
      [76, 79, 81, 79, 76, 72, 74, 76],
      [77, 81, 79, 77, 76, 72, 69, 72],
      [74, 77, 81, 77, 74, 72, 69, 65],
      [71, 74, 79, 77, 74, 71, 67, 72],
    ];
    const bar = Math.floor(step / 8) % 8,
      part = step % 8,
      chord = chords[bar];
    this.tone(melody[bar][part], at, 0.22, 0.17, "sine");
    this.tone(melody[bar][part] + 12, at, 0.1, 0.025);
    if (part % 2 === 0)
      this.tone(
        chord[0] - 24 + (part === 4 ? 7 : 0),
        at,
        0.25,
        0.23,
        "triangle",
      );
    if (part % 2 === 1)
      for (const note of chord) this.tone(note, at, 0.12, 0.055, "triangle");
    if (part === 0 || part === 4) this.tone(35, at, 0.12, 0.22);
    if (part === 2 || part === 6) {
      this.tone(80, at, 0.035, 0.055, "triangle");
      this.tone(86, at, 0.04, 0.035, "triangle");
    }
  }
};
