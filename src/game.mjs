import { EventEmitter } from "node:events";
export const normalize = (text) => {
  const raw = String(text ?? "").trim();
  if (/^[+-]?\d+(?:[.,]\d+)?$/.test(raw))
    return String(Number(raw.replace(",", ".")));
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
};
export function validateQuestions(value) {
  if (!Array.isArray(value) || value.length < 20 || value.length > 5000)
    throw Error("Bộ câu hỏi phải có từ 20 đến 5.000 câu.");
  const ids = new Set();
  return value.map((q, i) => {
    if (!q || typeof q.id !== "string" || !q.id || ids.has(q.id))
      throw Error(`ID câu ${i + 1} bị thiếu hoặc trùng.`);
    ids.add(q.id);
    if (
      typeof q.prompt !== "string" ||
      !q.prompt.trim() ||
      q.prompt.length > 500 ||
      typeof q.category !== "string" ||
      !q.category.trim() ||
      q.category.length > 60
    )
      throw Error(`Nội dung câu ${i + 1} không hợp lệ.`);
    if (
      !Array.isArray(q.answers) ||
      !q.answers.length ||
      q.answers.some(
        (a) => typeof a !== "string" || !normalize(a) || a.length > 100,
      )
    )
      throw Error(`Đáp án câu ${i + 1} không hợp lệ.`);
    return {
      id: q.id,
      category: q.category.trim(),
      prompt: q.prompt.trim(),
      answers: q.answers.map((a) => a.trim()),
      explanation: String(q.explanation || "").slice(0, 1000),
    };
  });
}
const shuffle = (list, random) => {
  const result = [...list];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};
const publicPlayer = (p) => ({
  id: p.id,
  name: p.name,
  avatar: p.avatar,
  zone: p.zone,
  seat: p.seat,
  points: p.points,
  streak: p.streak,
  strikes: p.strikes,
  correct: p.correct,
  recentCorrect: (p.history || []).filter(Boolean).length,
  recentCount: (p.history || []).length,
  lastResult: p.lastResult,
  demo: p.demo,
});
export class Game extends EventEmitter {
  constructor({ questions, now = Date.now, random = Math.random } = {}) {
    super();
    this.bank = validateQuestions(questions);
    this.now = now;
    this.random = random;
    this.config = {
      capacity: 200,
      questionSeconds: 20,
      roundQuestions: 20,
      historySize: 6,
      minCorrect: 3,
      silentLimit: 3,
      revealSeconds: 5,
      category: "mixed",
      autoNext: true,
    };
    this.round = 1;
    this.phase = "lobby";
    this.number = 0;
    this.players = new Map();
    this.submissions = new Map();
    this.feed = [];
    this.deck = [];
    this.deadline = null;
    this.serial = 0;
  }
  note(text, kind = "info") {
    this.feed.push({ text, kind, at: this.now() });
    if (this.feed.length > 6) this.feed.shift();
  }
  update() {
    this.emit("state", this.snapshot());
  }
  configure(change) {
    if (!["lobby", "finished"].includes(this.phase))
      throw Error("Chỉ đổi bộ câu hỏi trước hoặc sau ván.");
    if (
      change.category !== undefined &&
      change.category !== "mixed" &&
      !this.bank.some((q) => q.category === change.category)
    )
      throw Error("Chủ đề không tồn tại.");
    if (change.category !== undefined) this.config.category = change.category;
    if (change.autoNext !== undefined) this.config.autoNext = !!change.autoNext;
    this.update();
  }
  setBank(value) {
    if (!["lobby", "finished"].includes(this.phase))
      throw Error("Dừng ván trước khi đổi ngân hàng câu hỏi.");
    this.bank = validateQuestions(value);
    this.config.category = "mixed";
    this.update();
  }
  pool() {
    return this.config.category === "mixed"
      ? this.bank
      : this.bank.filter((q) => q.category === this.config.category);
  }
  start() {
    if (this.phase !== "lobby")
      throw Error("Bấm Ván mới trước khi bắt đầu ván tiếp theo.");
    const pool = this.pool();
    if (pool.length < 20) throw Error("Chủ đề cần ít nhất 20 câu hỏi.");
    this.deck = shuffle(pool, this.random).slice(0, 20);
    this.note(`Ván ${this.round} bắt đầu · 20 câu hỏi!`);
    this.openQuestion();
  }
  newRound() {
    this.winnerResult = null;
    this.round++;
    this.phase = "lobby";
    this.number = 0;
    this.players.clear();
    this.submissions.clear();
    this.deck = [];
    this.deadline = null;
    this.serial = 0;
    this.paused = null;
    this.feed = [];
    this.note("Đảo mở cửa · bình luận VÔ để tham gia!");
    this.update();
  }
  openQuestion() {
    if (this.number >= this.deck.length) {
      this.phase = "finished";
      this.deadline = null;
      const champion = this.rank().find((p) => p.zone === "island");
      this.winnerResult = champion ? publicPlayer(champion) : null;
      this.note("Ván đã kết thúc. Chúc mừng các nhà sinh tồn!", "win");
      this.update();
      return;
    }
    this.number++;
    this.phase = "question";
    this.submissions.clear();
    this.openedAt = this.now();
    this.deadline = this.openedAt + 20000;
    this.update();
  }
  join({ id, name, avatar = "", demo = false }) {
    if (id === undefined || id === null || !String(id).trim())
      return { ok: false, reason: "missing_id" };
    id = String(id);
    const existing = this.players.get(id);
    if (existing) {
      existing.name = String(name || existing.name).slice(0, 30);
      if (avatar) existing.avatar = this.avatar(avatar);
      if (existing.zone !== "out") {
        this.fillSeats();
        this.update();
        return { ok: true, player: existing, existing: true };
      }
      existing.zone = "waiting";
      existing.seat = null;
      existing.history = [];
      existing.strikes = 0;
      existing.streak = 0;
      existing.joined = ++this.serial;
      existing.lastResult = null;
      this.fillSeats();
      this.note(`${existing.name} tham gia lại`, "join");
      this.update();
      return { ok: true, player: existing, existing: true };
    }
    if (this.players.size >= 5000) return { ok: false, reason: "queue_full" };
    this.fillSeats();
    const direct =
      this.phase !== "finished" && this.island().length < this.config.capacity;
    const p = {
      id,
      name: String(name || id).slice(0, 30),
      avatar: this.avatar(avatar),
      demo: !!demo,
      zone: direct ? "island" : "waiting",
      seat: null,
      points: 0,
      correct: 0,
      streak: 0,
      strikes: 0,
      joined: ++this.serial,
      responseMs: 0,
      lastResult: null,
      history: [],
      eligibleFrom: this.phase === "question" ? this.number : this.number + 1,
    };
    if (direct) p.seat = this.freeSeat();
    this.players.set(id, p);
    this.note(
      `${p.name} ${direct ? "lên đảo số " + p.seat : "vào hàng chờ"}`,
      direct ? "join" : "info",
    );
    this.update();
    return { ok: true, player: p };
  }
  avatar(value) {
    try {
      const url = new URL(value);
      return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch {
      return "";
    }
  }
  island() {
    return [...this.players.values()].filter((p) => p.zone === "island");
  }
  freeSeat() {
    const taken = new Set(this.island().map((p) => p.seat));
    for (let n = 1; n <= this.config.capacity; n++) if (!taken.has(n)) return n;
    return null;
  }
  fillSeats() {
    if (this.phase === "finished") return;
    const waiting = [...this.players.values()]
      .filter((p) => p.zone === "waiting")
      .sort((a, b) => a.joined - b.joined);
    for (const p of waiting) {
      if (this.island().length >= 200) break;
      p.zone = "island";
      p.seat = this.freeSeat();
      p.history = [];
      p.strikes = 0;
      p.streak = 0;
      p.eligibleFrom =
        this.phase === "question" ? this.number : this.number + 1;
      this.note(`${p.name} lên đảo từ hàng chờ, số ${p.seat}`, "join");
    }
  }
  submit(id, text) {
    const p = this.players.get(String(id));
    if (!p) return { ok: false, reason: "not_joined" };
    if (p.zone === "out") return { ok: false, reason: "out" };
    if (this.phase !== "question" || this.now() >= this.deadline)
      return { ok: false, reason: "closed" };
    if (this.submissions.has(p.id)) return { ok: false, reason: "locked" };
    const answer = normalize(text);
    if (!answer) return { ok: false, reason: "empty" };
    this.submissions.set(p.id, {
      answer,
      at: this.now(),
      elapsed: this.now() - this.openedAt,
    });
    this.update();
    return { ok: true };
  }
  comment(user, text) {
    return ["vo", "vao", "lendao"].includes(normalize(text))
      ? this.join(user)
      : this.submit(user.id, text);
  }
  closeQuestion() {
    if (this.phase !== "question") return;
    const question = this.deck[this.number - 1],
      accepted = new Set(question.answers.map(normalize));
    for (const p of this.players.values()) {
      if (p.zone === "out") continue;
      const submission = this.submissions.get(p.id),
        correct = !!submission && accepted.has(submission.answer);
      p.lastResult = correct ? "correct" : submission ? "wrong" : "missed";
      if (correct) {
        p.points += 10;
        p.correct++;
        p.streak++;
        p.responseMs += submission.elapsed;
      } else p.streak = 0;
      if (p.zone === "island" && this.number >= p.eligibleFrom) {
        p.history.push(correct);
        if (p.history.length > 6) p.history.shift();
        p.strikes = submission ? 0 : p.strikes + 1;
        if (
          p.strikes >= 3 ||
          (p.history.length === 6 && p.history.filter(Boolean).length < 3)
        ) {
          const reason =
            p.strikes >= 3
              ? "3 câu liên tiếp không trả lời"
              : "chưa đúng 3 trong 6 câu gần nhất";
          p.zone = "out";
          p.seat = null;
          this.note(
            `${p.name} rời đảo: ${reason}. Bình luận VÔ để trở lại.`,
            "out",
          );
        }
      }
    }
    this.phase = "reveal";
    this.fillSeats();
    this.deadline = this.now() + this.config.revealSeconds * 1000;
    this.update();
  }
  next() {
    if (this.phase !== "reveal")
      throw Error("Chỉ sang câu mới sau khi chốt đáp án.");
    this.openQuestion();
  }
  tick() {
    if (this.phase === "question" && this.now() >= this.deadline)
      this.closeQuestion();
    else if (
      this.phase === "reveal" &&
      this.config.autoNext &&
      this.now() >= this.deadline
    )
      this.next();
  }
  pause() {
    if (!["question", "reveal"].includes(this.phase)) return;
    this.paused = {
      phase: this.phase,
      remaining: Math.max(0, this.deadline - this.now()),
      at: this.now(),
    };
    this.phase = "paused";
    this.deadline = null;
    this.update();
  }
  resume() {
    if (this.phase !== "paused") return;
    this.phase = this.paused.phase;
    this.deadline = this.now() + this.paused.remaining;
    this.openedAt += this.now() - this.paused.at;
    this.paused = null;
    this.update();
  }
  rank() {
    return [...this.players.values()].sort(
      (a, b) =>
        b.points - a.points ||
        b.correct - a.correct ||
        a.responseMs - b.responseMs ||
        a.joined - b.joined,
    );
  }
  snapshot() {
    const q = this.deck[this.number - 1],
      revealed =
        ["reveal", "finished"].includes(this.phase) ||
        (this.phase === "paused" && this.paused?.phase === "reveal");
    const question = q
      ? {
          id: q.id,
          category: q.category,
          prompt: q.prompt,
          lengths: q.answers[0].split(/\s+/).map((x) => [...x].length),
          ...(revealed
            ? { answer: q.answers[0], explanation: q.explanation }
            : {}),
        }
      : null;
    const island = this.island(),
      rank = this.rank();
    return {
      round: this.round,
      phase: this.phase,
      number: this.number,
      config: this.config,
      question,
      deadline: this.deadline,
      serverTime: this.now(),
      players: [...this.players.values()].map((p) => ({
        ...publicPlayer(p),
        answered: this.submissions.has(p.id),
      })),
      islandCount: island.length,
      waitingCount: [...this.players.values()].filter(
        (p) => p.zone === "waiting",
      ).length,
      outCount: [...this.players.values()].filter((p) => p.zone === "out")
        .length,
      answered: island.filter((p) => this.submissions.has(p.id)).length,
      leaderboard: rank.slice(0, 10).map(publicPlayer),
      winner: this.phase === "finished" ? this.winnerResult : null,
      feed: this.feed,
      categories: [...new Set(this.bank.map((q) => q.category))],
    };
  }
}
