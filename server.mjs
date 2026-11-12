import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
import { WebSocketServer } from "ws";
import { Game, validateQuestions } from "./src/game.mjs";
import { resolveLiveUser } from "./src/live-user.mjs";
import {
  buildTikTokConnectionOptions,
  explainTikTokConnectionError,
} from "./src/tiktok-config.mjs";
import { AutoConnect } from "./src/auto-connect.mjs";
import { completeSpeech } from "./src/tts.mjs";
const ROOT = path.dirname(fileURLToPath(import.meta.url)),
  PUBLIC = path.join(ROOT, "public"),
  DATA = path.join(ROOT, "data");
const PORT = Number(process.env.PORT) || 3000,
  HOST = "127.0.0.1";
fs.mkdirSync(path.join(DATA, "tts"), { recursive: true });
const bankPath = path.join(DATA, "questions.local.json");
const initial = JSON.parse(
  fs.readFileSync(
    fs.existsSync(bankPath) ? bankPath : path.join(DATA, "questions.json"),
    "utf8",
  ),
);
const game = new Game({ questions: initial });
let live = {
    status: "idle",
    uniqueId: "",
    error: "",
    chatCount: 0,
    lastUser: "",
    roomId: "",
  },
  connection = null,
  version = 0;
const aliases = new Map(),
  logs = [],
  settings = {
    voice: "vi-VN-HoaiMyNeural",
    pitch: 0,
    rate: 2,
    readQuestions: true,
  };
let demoTimer = null,
  demoSerial = 0;
function log(text) {
  const item = `[${new Date().toLocaleTimeString("vi-VN")}] ${text}`;
  logs.push(item);
  if (logs.length > 150) logs.shift();
  broadcast({ t: "log", text: item }, "control");
  console.log(item);
}
const envelope = () => ({
  t: "state",
  game: game.snapshot(),
  live,
  autoConnect: auto.state,
  settings,
  demo: !!demoTimer,
  simulation: [...game.players.values()].some((p) => p.demo),
});
let updateTimer = null;
function changed() {
  if (updateTimer) return;
  updateTimer = setTimeout(() => {
    updateTimer = null;
    broadcast(envelope());
  }, 60);
}
game.on("state", changed);
function broadcast(message, role) {
  const text = JSON.stringify(message);
  for (const c of wss.clients)
    if (c.readyState === 1 && (!role || c.role === role)) {
      if (c.bufferedAmount > 2e6) c.terminate();
      else c.send(text);
    }
}
// Questions are spoken only on a phase transition, not for every incoming answer.
let announced = "";
let voiceBusy = false;
const voiceQueue = [];
function speak(text) {
  voiceQueue.push({
    text,
    round: game.round,
    number: game.number,
    phase: game.phase,
  });
  pumpVoice();
}
const currentVoice = (item) =>
  item.round === game.round &&
  item.number === game.number &&
  item.phase === game.phase;
async function pumpVoice() {
  if (voiceBusy || !voiceQueue.length) return;
  voiceBusy = true;
  const item = voiceQueue.shift(),
    { text } = item;
  if (!currentVoice(item)) {
    voiceBusy = false;
    pumpVoice();
    return;
  }
  try {
    const audio = await completeSpeech(text, settings);
    const name = `${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`;
    if (!currentVoice(item)) return;
    fs.writeFileSync(path.join(DATA, "tts", name), audio);
    broadcast({ t: "tts", url: "/tts/" + name, ...item });
    const files = fs.readdirSync(path.join(DATA, "tts")).sort();
    for (const old of files.slice(0, -80))
      try {
        fs.unlinkSync(path.join(DATA, "tts", old));
      } catch {}
  } catch (error) {
    if (currentVoice(item)) {
      log("Giọng đọc trực tuyến chưa sẵn sàng; chuyển giọng Việt dự phòng.");
      broadcast({ t: "tts", ...item, fallback: true });
    }
  } finally {
    voiceBusy = false;
    setTimeout(pumpVoice, 100);
  }
}
const tick = setInterval(() => {
  game.tick();
  const key = `${game.round}:${game.number}:${game.phase}`;
  if (key !== announced) {
    announced = key;
    if (settings.readQuestions && game.phase === "question")
      speak(
        `Câu ${game.number}. ${game.snapshot().question.prompt} Bạn có hai mươi giây trả lời.`,
      );
    if (settings.readQuestions && game.phase === "reveal")
      speak(
        `Đáp án: ${game.snapshot().question.answer}. ${game.snapshot().question.explanation}`,
      );
  }
}, 150);
async function disconnect() {
  version++;
  const old = connection;
  connection = null;
  live = { ...live, status: "idle", error: "" };
  changed();
  if (old)
    try {
      await old.disconnect();
    } catch {}
}
async function connect(username) {
  const token = ++version;
  const previous = connection;
  connection = null;
  if (previous)
    try {
      await previous.disconnect();
    } catch {}
  if (token !== version) return;
  live = {
    status: "connecting",
    uniqueId: username,
    error: "",
    chatCount: 0,
    lastUser: "",
    roomId: "",
  };
  changed();
  let client;
  try {
    const { TikTokLiveConnection, WebcastEvent, ControlEvent } = await import(
      "tiktok-live-connector"
    );
    if (token !== version) return;
    client = connection = new TikTokLiveConnection(
      username,
      buildTikTokConnectionOptions(),
    );
    client.on(WebcastEvent.CHAT, (data) => {
      if (token !== version) return;
      live.chatCount++;
      const user = resolveLiveUser(data, aliases);
      if (!user) {
        log("Nhận bình luận nhưng thiếu ID người dùng");
        changed();
        return;
      }
      live.lastUser = user.name;
      const text =
        [data.comment, data.text, data.content, data.comment?.text].find(
          (v) => typeof v === "string" && v.trim(),
        ) || "";
      const result = game.comment(user, text);
      if (!result.ok && result.reason === "closed") {
      }
      changed();
    });
    client.on(ControlEvent.ERROR, (error) => {
      if (token === version)
        log("TikTok: " + (error?.info || error?.message || "lỗi sự kiện"));
    });
    client.on(ControlEvent.DISCONNECTED, () => {
      if (token !== version) return;
      live.status = "disconnected";
      auto.disconnected();
      changed();
    });
    const state = await client.connect();
    if (token !== version) {
      await client.disconnect();
      return;
    }
    live = { ...live, status: "connected", roomId: state.roomId };
    log(`Đã kết nối @${username}`);
  } catch (error) {
    if (token !== version) return;
    try {
      await client?.disconnect();
    } catch {}
    if (token !== version) return;
    connection = null;
    live = {
      ...live,
      status: "error",
      error: explainTikTokConnectionError(error),
    };
    log(live.error);
  }
  changed();
}
const auto = new AutoConnect({
  connect,
  getStatus: () => ({
    ...live,
    status:
      connection?.isConnected === false && live.status === "connected"
        ? "disconnected"
        : live.status,
  }),
  onState: changed,
});
function demoFill(count) {
  for (let i = 0; i < count; i++) {
    const id = "demo-" + ++demoSerial;
    game.join({ id, name: `Người thử ${demoSerial}`, demo: true });
  }
  changed();
}
function bots(on) {
  clearInterval(demoTimer);
  demoTimer = null;
  if (on)
    demoTimer = setInterval(() => {
      if (game.phase !== "question") return;
      for (const p of game.players.values())
        if (p.demo && !game.submissions.has(p.id) && Math.random() < 0.12) {
          const q = game.deck[game.number - 1];
          game.submit(p.id, Math.random() < 0.65 ? q.answers[0] : "chưa biết");
        }
    }, 700);
  changed();
}
async function control(message) {
  switch (message.cmd) {
    case "connect":
      auto.setTarget(message.channel, { immediate: true });
      break;
    case "disconnect":
      auto.stop();
      await disconnect();
      break;
    case "start":
      game.start();
      break;
    case "newRound":
      bots(false);
      game.newRound();
      break;
    case "pause":
      game.pause();
      break;
    case "resume":
      game.resume();
      break;
    case "reveal":
      game.closeQuestion();
      break;
    case "next":
      game.next();
      break;
    case "configure":
      game.configure(message.config || {});
      break;
    case "simulate": {
      const user = {
        id: "sim-" + String(message.name || "Khách").slice(0, 30),
        name: String(message.name || "Khách").slice(0, 30),
      };
      const r = game.comment(user, String(message.text || "").slice(0, 200));
      broadcast(
        { t: "result", result: { ok: r.ok, reason: r.reason } },
        "control",
      );
      break;
    }
    case "fill": {
      const count = Math.min(200, Math.max(1, Number(message.count) || 12));
      demoFill(count === 200 ? 200 - game.island().length : count);
      break;
    }
    case "bots":
      bots(!!message.on);
      break;
    case "voice":
      settings.readQuestions = !!message.enabled;
      changed();
      break;
    default:
      throw Error("Lệnh không hợp lệ");
  }
}
const allowed = new Set([
  `localhost:${PORT}`,
  `127.0.0.1:${PORT}`,
  `[::1]:${PORT}`,
]);
const valid = (req) => allowed.has(req.headers.host?.toLowerCase());
const sameOrigin = (req) => {
  if (!req.headers.origin) return true;
  try {
    return new URL(req.headers.origin).host === req.headers.host;
  } catch {
    return false;
  }
};
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".png": "image/png",
  ".mp3": "audio/mpeg",
};
const server = http.createServer(async (req, res) => {
  if (!valid(req) || !sameOrigin(req)) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/api/questions" && req.method === "GET") {
    res
      .writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      })
      .end(JSON.stringify(game.bank));
    return;
  }
  if (url.pathname === "/api/questions" && req.method === "POST") {
    try {
      let size = 0,
        body = "";
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 1024 * 1024) throw Error("File vượt 1 MB");
        body += chunk;
      }
      const bank = validateQuestions(JSON.parse(body));
      if (!["lobby", "finished"].includes(game.phase))
        throw Error("Đổi câu hỏi khi đang chờ ván hoặc kết thúc ván.");
      const temp = bankPath + ".tmp";
      fs.writeFileSync(temp, JSON.stringify(bank, null, 2));
      fs.renameSync(temp, bankPath);
      game.setBank(bank);
      res
        .writeHead(200, { "Content-Type": "application/json" })
        .end(JSON.stringify({ ok: true, count: bank.length }));
    } catch (error) {
      res
        .writeHead(400, { "Content-Type": "application/json" })
        .end(JSON.stringify({ error: error.message }));
    }
    return;
  }
  if (!["GET", "HEAD"].includes(req.method)) {
    res.writeHead(405).end();
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  let root = PUBLIC,
    relative = pathname === "/" ? "control.html" : pathname.slice(1);
  if (pathname.startsWith("/tts/")) {
    root = path.join(DATA, "tts");
    relative = pathname.slice(5);
  }
  if (
    relative.split("/").some((p) => p === ".." || p.startsWith(".")) ||
    relative.includes("\\")
  ) {
    res.writeHead(404).end();
    return;
  }
  const file = path.resolve(root, relative);
  if (!file.startsWith(root + path.sep)) {
    res.writeHead(404).end();
    return;
  }
  fs.stat(file, (error, stat) => {
    if (error || !stat.isFile()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, {
      "Content-Type": mime[path.extname(file)] || "application/octet-stream",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    if (req.method === "HEAD") res.end();
    else fs.createReadStream(file).pipe(res);
  });
});
const wss = new WebSocketServer({
  server,
  path: "/ws",
  maxPayload: 8192,
  verifyClient: ({ req }) => valid(req) && sameOrigin(req),
});
wss.on("connection", (socket, req) => {
  socket.role =
    new URL(req.url, "http://x").searchParams.get("role") === "control"
      ? "control"
      : "overlay";
  socket.alive = true;
  socket.on("pong", () => (socket.alive = true));
  socket.on("error", () => {});
  socket.send(JSON.stringify(envelope()));
  if (socket.role === "control")
    socket.send(JSON.stringify({ t: "logs", lines: logs }));
  socket.on("message", async (raw) => {
    try {
      const m = JSON.parse(raw);
      if (m.t === "ping") {
        socket.send(JSON.stringify({ t: "pong" }));
        return;
      }
      if (socket.role === "control" && m.t === "control") await control(m);
    } catch (error) {
      socket.send(JSON.stringify({ t: "error", message: error.message }));
    }
  });
});
const heartbeat = setInterval(() => {
  for (const s of wss.clients) {
    if (!s.alive) {
      s.terminate();
      continue;
    }
    s.alive = false;
    if (s.readyState === 1) s.ping();
  }
}, 20000);
server.listen(PORT, HOST, () => {
  log(
    `VUA SINH TỒN · Điều khiển http://localhost:${PORT}/ · Màn hình http://localhost:${PORT}/overlay.html`,
  );
  if (process.env.TIKTOK_CHANNEL) {
    try {
      auto.setTarget(process.env.TIKTOK_CHANNEL, { immediate: true });
    } catch (error) {
      log(error.message);
    }
  } else if (process.stdin.isTTY) {
    const prompt = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    prompt.question(
      "Link TikTok hoặc @username (Enter để thử game trước): ",
      (answer) => {
        prompt.close();
        if (answer.trim())
          try {
            auto.setTarget(answer, { immediate: true });
          } catch (error) {
            log(error.message);
          }
      },
    );
  }
});
function shutdown() {
  clearInterval(tick);
  clearInterval(heartbeat);
  clearTimeout(updateTimer);
  clearInterval(demoTimer);
  auto.stop();
  disconnect().finally(() => {
    for (const s of wss.clients) s.terminate();
    server.close(() => process.exit(0));
  });
  setTimeout(() => process.exit(0), 1000).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
