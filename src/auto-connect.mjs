export function channelName(value) {
  let text = String(value || "").trim();
  if (/^https?:\/\//i.test(text)) {
    let url;
    try {
      url = new URL(text);
    } catch {
      throw Error("Link kênh không hợp lệ");
    }
    if (!/(^|\.)tiktok\.com$/i.test(url.hostname))
      throw Error("Hãy nhập link kênh TikTok hoặc @username");
    text = url.pathname.match(/^\/@([^/]+)/)?.[1] || "";
  }
  text = text.replace(/^@/, "").replace(/\/live\/?$/, "");
  if (!/^[a-zA-Z0-9_.]{1,64}$/.test(text))
    throw Error("Hãy nhập @username hoặc link tiktok.com/@tenkenh/live");
  return text;
}

export class AutoConnect {
  constructor({
    connect,
    getStatus,
    onState = () => {},
    now = Date.now,
    setTimer = setTimeout,
    clearTimer = clearTimeout,
    initialDelay = 300000,
    retryDelay = 120000,
  }) {
    Object.assign(this, {
      connect,
      getStatus,
      onState,
      now,
      setTimer,
      clearTimer,
      initialDelay,
      retryDelay,
    });
    this.state = {
      enabled: false,
      target: "",
      phase: "idle",
      nextAttemptAt: null,
      attempts: 0,
      error: "",
    };
    this.generation = 0;
    this.busy = false;
    this.timer = null;
  }
  emit() {
    this.onState({ ...this.state });
  }
  setTarget(value, { immediate = false } = {}) {
    const target = channelName(value);
    this.generation++;
    this.clearTimer(this.timer);
    Object.assign(this.state, {
      enabled: true,
      target,
      attempts: 0,
      error: "",
    });
    if (this.busy) {
      this.state.phase = "waiting";
      this.state.nextAttemptAt = null;
      this.emit();
    } else this.schedule(immediate ? 0 : this.initialDelay, "scheduled");
  }
  schedule(delay, phase) {
    this.clearTimer(this.timer);
    if (!this.state.enabled) return;
    Object.assign(this.state, { phase, nextAttemptAt: this.now() + delay });
    this.emit();
    this.timer = this.setTimer(() => this.attempt(), delay);
  }
  stop() {
    this.generation++;
    this.clearTimer(this.timer);
    Object.assign(this.state, {
      enabled: false,
      phase: "stopped",
      nextAttemptAt: null,
    });
    this.emit();
  }
  disconnected() {
    if (this.state.enabled && !this.busy)
      this.schedule(this.retryDelay, "retry");
  }
  async attempt() {
    if (!this.state.enabled || this.busy) return;
    const current = this.getStatus();
    if (
      current.status === "connected" &&
      current.uniqueId === this.state.target
    ) {
      Object.assign(this.state, {
        phase: "connected",
        nextAttemptAt: null,
        error: "",
      });
      this.emit();
      this.timer = this.setTimer(() => this.attempt(), this.retryDelay);
      return;
    }
    const generation = this.generation,
      target = this.state.target;
    this.busy = true;
    Object.assign(this.state, {
      phase: "connecting",
      nextAttemptAt: null,
      attempts: this.state.attempts + 1,
    });
    this.emit();
    try {
      await this.connect(target);
    } catch (error) {
      if (generation === this.generation)
        this.state.error = String(error?.message || error);
    } finally {
      this.busy = false;
      if (generation !== this.generation) {
        if (this.state.enabled) this.schedule(0, "scheduled");
        return;
      }
      if (!this.state.enabled) return;
      const status = this.getStatus();
      if (status.status === "connected" && status.uniqueId === target) {
        Object.assign(this.state, {
          phase: "connected",
          nextAttemptAt: null,
          error: "",
        });
        this.emit();
        this.timer = this.setTimer(() => this.attempt(), this.retryDelay);
      } else {
        this.state.error = String(
          status.error || this.state.error || "Chưa kết nối được TikTok",
        );
        this.schedule(this.retryDelay, "retry");
      }
    }
  }
}
