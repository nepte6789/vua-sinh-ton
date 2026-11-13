import { normalize } from "./game.mjs";
const first = [
  "Minh",
  "Ngọc",
  "Bảo",
  "Khánh",
  "Hoàng",
  "Thanh",
  "Gia",
  "Hải",
  "Tuấn",
  "Thu",
  "Kim",
  "Phương",
  "Đức",
  "Hồng",
  "Mai",
  "Quỳnh",
  "Thùy",
  "Anh",
  "Nhật",
  "Trúc",
];
const last = [
  "Anh",
  "Hà",
  "Linh",
  "Nam",
  "Vy",
  "Phúc",
  "Huy",
  "Ngân",
  "Trang",
  "An",
  "Khoa",
  "Nhi",
  "Yến",
  "Long",
  "Châu",
  "Thảo",
  "Quân",
  "My",
  "Tâm",
  "Duy",
];
export function botAvatar(seed) {
  const n = Math.abs(Number(seed) || 1),
    hue = (n * 71) % 360,
    skin = ["#f6cba7", "#ddae88", "#ba865d", "#edbca2"][n % 4],
    hair = ["#322a33", "#302a22", "#57392c", "#77513a"][n % 4];
  const bg = `hsl(${hue} 60% 76%)`,
    shirt = `hsl(${(hue + 150) % 360} 62% 40%)`,
    eyes =
      n % 3 === 0 ? "M35 48Q39 44 43 48M57 48Q61 44 65 48" : "M37 47h3M60 47h3";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" rx="50" fill="${bg}"/><path d="M17 103Q18 74 50 74Q82 74 83 103" fill="${shirt}"/><path d="M42 70h16v14H42z" fill="${skin}"/><ellipse cx="50" cy="47" rx="25" ry="31" fill="${skin}"/><path d="${n % 2 ? "M25 44Q17 9 47 12Q83 8 76 45L65 26Q48 35 29 31Z" : "M24 46Q14 14 45 12Q83 7 78 49L70 30Q56 27 44 19Q41 35 24 46Z"}" fill="${hair}"/><path d="${eyes}" fill="none" stroke="#352a2c" stroke-width="3" stroke-linecap="round"/><path d="M42 62Q50 68 58 62" fill="none" stroke="#a15550" stroke-width="2" stroke-linecap="round"/>${n % 5 === 0 ? '<g fill="none" stroke="#27556f" stroke-width="2"><rect x="30" y="40" width="17" height="15" rx="6"/><rect x="53" y="40" width="17" height="15" rx="6"/><path d="M47 46h6"/></g>' : ""}${n % 4 === 0 ? '<path d="M21 27Q50-4 79 27L74 32H26Z" fill="#f8dd75"/>' : ""}${n % 7 === 0 ? '<circle cx="74" cy="24" r="8" fill="#ef7da7"/><circle cx="67" cy="23" r="7" fill="#ffb4cf"/>' : ""}</svg>`;
}
export class BotDirector {
  constructor(
    game,
    {
      now = Date.now,
      random = Math.random,
      avatarBase = "http://localhost:3000",
    } = {},
  ) {
    Object.assign(this, { game, now, random, avatarBase });
    this.enabled = false;
    this.target = 12;
    this.serial = 0;
    this.plans = new Map();
    this.nextRefillAt = null;
    this.previousRealCount = 0;
    this.reactions = new Map();
  }
  managed() {
    return [...this.game.players.values()].filter(
      (p) => p.demo && p.id.startsWith("bot-"),
    );
  }
  state() {
    const list = this.managed();
    return {
      enabled: this.enabled,
      target: this.target,
      total: list.length,
      active: list.filter((p) => p.zone === "island").length,
      nextRefillAt: this.nextRefillAt,
    };
  }
  configure(on, count = this.target) {
    const n = Number(count);
    if (!Number.isInteger(n) || n < 10 || n > 100)
      throw Error("Số bot phải là số nguyên từ 10 đến 100.");
    this.enabled = !!on;
    this.target = n;
    this.plans.clear();
    this.nextRefillAt = null;
    for (const p of this.managed().slice(this.enabled ? n : 0)) {
      this.game.players.delete(p.id);
      this.game.submissions.delete(p.id);
    }
    this.game.fillSeats();
    if (this.enabled) {
      this.sync();
      this.previousRealCount = this.realCount();
      this.scheduleRefill();
    }
    this.game.update();
  }
  realCount() {
    return this.game.island().filter((p) => !p.demo).length;
  }
  scheduleRefill() {
    this.nextRefillAt = this.now() + 60000 + Math.floor(this.random() * 120001);
  }
  sync(limit = this.target) {
    if (!this.enabled || ["paused", "finished"].includes(this.game.phase))
      return;
    this.game.fillSeats();
    let added = 0;
    while (
      this.state().active < this.target &&
      this.game.island().length < this.game.config.capacity &&
      added < limit
    ) {
      const departed = this.managed().filter((p) => p.zone === "out");
      if (departed.length) {
        const p = departed[Math.floor(this.random() * departed.length)];
        this.plans.delete(p.id);
        this.game.comment(p, "VÔ");
        added++;
        continue;
      }
      if (this.managed().length >= this.target) break;
      const n = ++this.serial,
        user = {
          id: "bot-" + n,
          name:
            first[(n - 1) % first.length] +
            " " +
            last[Math.floor((n - 1) / first.length) % last.length],
          avatar: this.avatarBase + "/avatar/" + n + ".svg",
          demo: true,
        };
      this.game.comment(user, "VÔ");
      added++;
    }
  }
  tick() {
    if (!this.enabled) return;
    const g = this.game;
    if (g.phase === "paused" || g.phase === "finished") return;
    if (this.nextRefillAt !== null && this.now() >= this.nextRefillAt) {
      g.fillSeats();
      const real = this.realCount();
      if (real <= this.previousRealCount)
        this.sync(1 + Math.floor(this.random() * 3));
      this.previousRealCount = real;
      this.scheduleRefill();
      g.update();
    }
    for (const p of this.managed()) {
      if (p.zone === "out") continue;
      if (g.phase === "reveal") {
        const key = g.round + ":" + g.number;
        if (this.reactions.get(p.id) !== key) {
          this.reactions.set(p.id, key);
          if (this.random() < 0.12) {
            const words =
              p.lastResult === "correct"
                ? ["Đúng rồi!", "Câu này hay quá", "May quá mình biết câu này"]
                : ["Tiếc quá!", "Câu sau cố lên", "Giờ mới biết đáp án"];
            const text = words[Math.floor(this.random() * words.length)];
            g.recordChat(p, text);
            g.note(`${p.name}: ${text}`, "chat");
            g.update();
          }
        }
      }
      if (g.phase !== "question" || g.submissions.has(p.id)) continue;
      const key = g.round + ":" + g.number,
        old = this.plans.get(p.id);
      let plan = old;
      if (!plan || plan.key !== key) {
        const remaining = g.deadline - this.now(),
          q = g.deck[g.number - 1];
        const wrong = g.bank
          .flatMap((x) => x.answers)
          .filter((a) => !q.answers.some((b) => normalize(a) === normalize(b)));
        plan = {
          key,
          at:
            this.now() +
            Math.min(
              Math.max(500, remaining - 300),
              3000 + this.random() * 14000,
            ),
          skip: this.random() < 0.08,
          answer:
            this.random() < 0.67
              ? q.answers[Math.floor(this.random() * q.answers.length)]
              : wrong[Math.floor(this.random() * wrong.length)] ||
                "Mình chưa biết",
        };
        this.plans.set(p.id, plan);
      }
      if (!plan.skip && this.now() >= plan.at) {
        const result = g.comment(p, plan.answer);
        if (result.ok) {
          g.note(`${p.name}: ${plan.answer}`, "chat");
          g.update();
        }
      }
    }
  }
}
