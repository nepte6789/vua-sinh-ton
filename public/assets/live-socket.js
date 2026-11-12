/* One reconnect loop per page; snapshots restore UI without reconnecting TikTok. */
window.LiveSocket = class {
  constructor(role, onMessage, onStatus) {
    this.role = role;
    this.onMessage = onMessage;
    this.onStatus = onStatus;
    this.retry = null;
    this.attempt = 0;
    this.lastSeen = Date.now();
    this.connect();
    this.heartbeat = setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        if (Date.now() - this.lastSeen > 45000) this.reconnect();
        else this.socket.send(JSON.stringify({ t: "ping" }));
      }
    }, 15000);
    addEventListener("online", () => this.reconnect());
    document.addEventListener("visibilitychange", () => {
      if (
        !document.hidden &&
        (this.readyState !== WebSocket.OPEN ||
          Date.now() - this.lastSeen > 30000)
      )
        this.reconnect();
    });
  }
  get readyState() {
    return this.socket?.readyState ?? WebSocket.CLOSED;
  }
  send(data) {
    if (this.readyState === WebSocket.OPEN) this.socket.send(data);
  }
  reconnect() {
    clearTimeout(this.retry);
    this.retry = null;
    const old = this.socket;
    this.socket = null;
    old?.close();
    this.connect();
  }
  connect() {
    clearTimeout(this.retry);
    this.retry = null;
    this.onStatus("connecting");
    const socket = (this.socket = new WebSocket(
      `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws?role=${this.role}`,
    ));
    socket.onopen = () => {
      if (socket !== this.socket) return;
      this.lastSeen = Date.now();
      this.onStatus("syncing");
      socket.send(JSON.stringify({ t: "ping" }));
    };
    socket.onmessage = (e) => {
      if (socket !== this.socket) return;
      let m;
      try {
        m = JSON.parse(e.data);
      } catch {
        return;
      }
      this.lastSeen = Date.now();
      if (m.t === "state") {
        this.attempt = 0;
        this.onStatus("connected");
      }
      if (m.t !== "pong") this.onMessage(m);
    };
    socket.onerror = () => {
      if (socket === this.socket) socket.close();
    };
    socket.onclose = () => {
      if (socket !== this.socket) return;
      this.onStatus("disconnected");
      const delay = Math.min(10000, 1000 * 2 ** Math.min(this.attempt++, 4));
      this.retry = setTimeout(() => this.connect(), delay);
    };
  }
};
