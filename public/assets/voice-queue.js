window.FestivalVoiceQueue = class {
  constructor({
    context,
    output,
    duck,
    onWarning,
    onStart = () => {},
    onFinish = () => {},
    settings = () => ({}),
    shouldPlay = () => true,
  }) {
    Object.assign(this, {
      context,
      output,
      duck,
      onWarning,
      onStart,
      onFinish,
      settings,
      shouldPlay,
    });
    this.items = [];
    this.busy = false;
  }
  enqueue(message) {
    const before =
      !message.demo && message.tag !== "chant"
        ? this.items.findIndex((x) => x.demo || x.tag === "chant")
        : -1;
    if (before < 0) this.items.push(message);
    else this.items.splice(before, 0, message);
    this.run();
  }
  async run() {
    if (this.busy || !this.items.length) return;
    if (!this.shouldPlay(this.items[0])) {
      this.items.shift();
      this.run();
      return;
    }
    this.busy = true;
    this.duck(true);
    const message = this.items.shift();
    this.onStart(message);
    try {
      if (message.url) {
        try {
          await this.audio(message.url);
        } catch {
          await this.speech(message.text);
        }
      } else await this.speech(message.text);
    } catch (error) {
      this.onWarning(error.message);
    } finally {
      this.duck(false);
      this.busy = false;
      this.onFinish(message);
      this.run();
    }
  }
  audio(url) {
    return new Promise((resolve, reject) => {
      const el = new Audio(url),
        source = this.context.createMediaElementSource(el),
        gain = this.context.createGain();
      gain.gain.value = 1.25;
      source.connect(gain);
      gain.connect(this.output);
      let settled = false;
      const finish = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        el.onended = el.onerror = null;
        el.pause();
        source.disconnect();
        gain.disconnect();
        error ? reject(error) : resolve();
      };
      const timer = setTimeout(
        () => finish(Error("Âm thanh không hoàn tất")),
        120000,
      );
      el.onended = () => finish();
      el.onerror = () => finish(Error("Không tải được âm thanh"));
      el.play().catch(finish);
    });
  }
  async speech(text) {
    if (!("speechSynthesis" in window) || !text)
      throw Error("Không có giọng đọc dự phòng. Hãy kiểm tra dịch vụ TTS.");
    const synth = window.speechSynthesis;
    const options = this.settings();
    const pick = () => {
      const voices = synth
        .getVoices()
        .filter((v) => /^vi([-_]|$)/i.test(v.lang));
      const wanted =
        options.voice === "vi-VN-NamMinhNeural" ? "namminh" : "hoaimy";
      const clean = (s) =>
        s
          .normalize("NFD")
          .replace(/[\u0300-\u036f\s_-]/g, "")
          .toLowerCase();
      return voices.find((v) => clean(v.name).includes(wanted)) || voices[0];
    };
    let voice = pick();
    if (!voice) {
      await new Promise((resolve) => {
        const done = () => {
          clearTimeout(timer);
          synth.removeEventListener("voiceschanged", done);
          resolve();
        };
        const timer = setTimeout(done, 1000);
        synth.addEventListener("voiceschanged", done);
      });
      voice = pick();
    }
    if (!voice)
      throw Error(
        "Máy chưa có giọng đọc tiếng Việt dự phòng; hãy cài giọng Việt hoặc kiểm tra TTS.",
      );
    return new Promise((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.voice = voice;
      utterance.lang = voice.lang;
      utterance.rate = 1 + (options.rate ?? 2) / 100;
      utterance.pitch = Math.max(0, Math.min(2, 1 + (options.pitch ?? 0) / 50));
      let done = false;
      const finish = (error) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        error ? reject(error) : resolve();
      };
      const timer = setTimeout(() => {
        synth.cancel();
        finish(Error("Giọng đọc dự phòng không hoàn tất"));
      }, 120000);
      utterance.onend = () => finish();
      utterance.onerror = () =>
        finish(Error("Giọng đọc dự phòng bị gián đoạn"));
      synth.speak(utterance);
    });
  }
};
