const $ = (id) => document.getElementById(id),
  stage = $("stage");
function fit() {
  stage.style.transform = `translate(-50%,-50%) scale(${Math.min(innerWidth / 1080, innerHeight / 1920)})`;
}
addEventListener("resize", fit);
fit();
let current = null,
  offset = 0,
  settings = {},
  signature = "",
  chatSignature = "",
  voicePlayer = null,
  AC = null;
const pendingVoice = [];
const rows = [10, 12, 16, 18, 20, 24, 24, 20, 18, 16, 12, 10];
function avatar(person) {
  const box = document.createElement("span");
  box.className = "avatar";
  const initials = (person.name || "?")
    .split(/\s+/)
    .map((s) => s[0])
    .slice(-2)
    .join("")
    .toUpperCase();
  const hue = [...String(person.id)].reduce(
    (n, c) => (n * 31 + c.charCodeAt(0)) % 360,
    0,
  );
  box.style.background = `linear-gradient(135deg,hsl(${hue} 48% 48%),hsl(${hue} 53% 30%))`;
  if (person.avatar) {
    const im = new Image();
    im.alt = person.name;
    im.referrerPolicy = "no-referrer";
    im.onerror = () => {
      im.remove();
      box.textContent = initials;
    };
    im.src = person.avatar;
    box.append(im);
  } else box.textContent = initials;
  return box;
}
function render(message) {
  current = message.game;
  offset = current.serverTime - Date.now();
  settings = message.settings;
  const g = current;
  $("round").textContent = "Ván " + g.round;
  $("population").textContent = `🌴 ${g.islandCount}/200`;
  $("topic").textContent = g.question
    ? "✦ " + g.question.category
    : "✦ " + (g.config.category === "mixed" ? "Tổng hợp" : g.config.category);
  const phase =
    g.phase === "lobby"
      ? "ĐANG MỞ ĐẢO"
      : g.phase === "finished"
        ? "VÁN ĐÃ KẾT THÚC"
        : g.phase === "paused"
          ? "TẠM DỪNG"
          : `${g.number <= 10 ? "Khởi động" : g.number <= 80 ? "Sinh tồn" : "Chung kết"} · Câu ${g.number}/${g.config.roundQuestions}`;
  $("phase").textContent = phase;
  $("prompt").textContent =
    g.question?.prompt || "Bạn đã sẵn sàng trở thành vua sinh tồn?";
  const key = `${g.round}:${g.number}:${g.phase}`;
  if (key !== signature) {
    signature = key;
    $("answerSlots").replaceChildren();
    if (g.question && !g.question.answer) {
      let total = 0;
      for (const length of g.question.lengths) {
        total += length;
        const word = document.createElement("div");
        word.className = "word";
        for (let i = 0; i < length; i++) {
          const cell = document.createElement("span");
          cell.className = "letter";
          word.append(cell);
        }
        $("answerSlots").append(word);
      }
      $("answerSlots").classList.toggle("long", total > 18);
    }
  }
  $("answerSlots").hidden = !!g.question?.answer || !g.question;
  $("reveal").hidden = !g.question?.answer;
  $("answer").textContent = g.question?.answer || "";
  $("explanation").textContent = g.question?.explanation || "";
  $("roundPodium").replaceChildren();
  for (const [i, p] of (g.topAnswers || []).entries()) {
    const entry = document.createElement("div");
    entry.append(avatar(p));
    const text = document.createElement("span");
    text.textContent = `${["🥇", "🥈", "🥉"][i]} ${p.name} · ${(p.elapsed / 1000).toFixed(2)}s · ${p.points}đ`;
    entry.append(text);
    $("roundPodium").append(entry);
  }
  $("reportStatus").textContent = g.question?.answer
    ? g.announcementPending
      ? g.rankingDue
        ? "Đang đọc bảng xếp hạng…"
        : "Đang đọc đáp án…"
      : g.config.autoNext
        ? "Câu tiếp theo sau 5 giây"
        : "Chờ chủ phòng sang câu"
    : "";
  $("locked").textContent = `✍ ${g.answered}/${g.islandCount} đã chốt`;
  $("joinBanner").textContent =
    g.islandCount < 200
      ? "📜 Bình luận VÔ để lên đảo · tham gia bất kỳ lúc nào"
      : "🛟 Đảo đủ 200 người · bình luận VÔ để vào hàng chờ";
  $("waitingCount").textContent = g.waitingCount;
  $("rescueRule").textContent = "Tự lên theo thứ tự khi đảo còn chỗ";
  const taken = new Map(
    g.players.filter((p) => p.zone === "island").map((p) => [p.seat, p]),
  );
  const fragment = document.createDocumentFragment();
  let number = 0;
  for (const count of rows) {
    const row = document.createElement("div");
    row.className = "island-row";
    for (let i = 0; i < count; i++) {
      number++;
      const p = taken.get(number),
        seat = document.createElement("div");
      seat.className =
        "seat " +
        (p
          ? p.answered && g.phase === "question"
            ? "answered"
            : p.lastResult || ""
          : "empty");
      if (p) {
        seat.title = `${p.name} · ${p.points} điểm · đúng ${p.recentCorrect}/${p.recentCount} câu · vắng ${p.strikes}/3`;
        seat.append(avatar(p));
        const label = document.createElement("span");
        label.className = "seat-number";
        label.textContent = number;
        seat.append(label);
        if (p.strikes) {
          const strike = document.createElement("span");
          strike.className = "strike";
          strike.textContent = "×" + p.strikes;
          seat.append(strike);
        }
      } else {
        const empty = document.createElement("span");
        empty.className = "avatar";
        seat.append(empty);
      }
      row.append(seat);
    }
    fragment.append(row);
  }
  $("island").replaceChildren(fragment);
  $("emptyIsland").hidden = g.islandCount > 0;
  const waiting = g.players.filter((p) => p.zone === "waiting");
  $("waiting").replaceChildren();
  for (const p of waiting.slice(0, 48)) {
    const cell = document.createElement("div");
    cell.className = "waiting-person";
    cell.title = p.name;
    cell.append(avatar(p));
    const dots = document.createElement("div");
    dots.className = "streak-dots";
    dots.textContent = "#" + (waiting.indexOf(p) + 1);
    cell.append(dots);
    $("waiting").append(cell);
  }
  $("waitingEmpty").hidden = waiting.length > 0;
  $("rankingTitle").textContent =
    `🏆 TOP ĐIỂM · ${g.rankingAt ? "Câu " + g.rankingAt : "Chờ câu 10"}`;
  $("ranking").replaceChildren();
  for (const [i, p] of g.leaderboard.slice(0, 10).entries()) {
    const li = document.createElement("li"),
      rank = document.createElement("span"),
      name = document.createElement("span"),
      score = document.createElement("b");
    rank.className = "rank-place";
    rank.textContent = i + 1;
    name.className = "rank-name";
    name.textContent = p.name;
    score.textContent = p.points;
    li.append(rank, name, score);
    $("ranking").append(li);
  }
  const chatKey = `${g.round}:${g.chat?.at(-1)?.id || 0}`;
  if (chatSignature !== chatKey) {
    chatSignature = chatKey;
    const list = $("chatMessages");
    list.replaceChildren();
    for (const message of g.chat || []) {
      const row = document.createElement("div");
      row.className = "chat-message";
      row.append(
        avatar({
          id: message.userId,
          name: message.name,
          avatar: message.avatar,
        }),
      );
      const body = document.createElement("div"),
        name = document.createElement("b"),
        text = document.createElement("span");
      name.textContent = message.name;
      text.textContent = message.text;
      body.append(name, text);
      row.append(body);
      list.append(row);
    }
    $("chatEmpty").hidden = !!g.chat?.length;
    list.scrollTop = list.scrollHeight;
  }
  $("ticker").textContent = g.feed.at(-1)?.text || "Bình luận VÔ để lên đảo!";
  $("liveStatus").textContent =
    message.live.status === "connected"
      ? `● TikTok @${message.live.uniqueId} · ${message.live.chatCount} bình luận`
      : message.simulation
        ? "● ĐANG MÔ PHỎNG · không phải người xem TikTok"
        : "● Chưa kết nối TikTok · có thể thử ở bảng điều khiển";
  $("winner").hidden = g.phase !== "finished";
  if (g.phase === "finished") {
    $("winnerName").textContent = g.winner
      ? "♛ " + g.winner.name
      : "Đảo chưa có nhà vô địch";
    $("winnerPoints").textContent = g.winner
      ? g.winner.points + " điểm"
      : "Không còn người trụ lại";
  }
}
function timer() {
  if (!current) return;
  const remaining = current.deadline
    ? Math.max(0, (current.deadline - (Date.now() + offset)) / 1000)
    : current.config.questionSeconds;
  $("seconds").textContent = current.announcementPending
    ? "♫"
    : current.phase === "paused"
      ? "Ⅱ"
      : current.phase === "lobby"
        ? String(current.config.questionSeconds)
        : Math.ceil(remaining);
  $("timerBar").style.width =
    (current.phase === "question"
      ? Math.min(100, (remaining / current.config.questionSeconds) * 100)
      : 100) + "%";
  document
    .querySelector(".timer-track")
    .classList.toggle("danger", current.phase === "question" && remaining <= 5);
}
setInterval(timer, 100);
setInterval(
  () =>
    ($("clock").textContent = new Intl.DateTimeFormat("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date())),
  1000,
);
function flushVoice() {
  if (!voicePlayer) return;
  while (pendingVoice.length) voicePlayer.enqueue(pendingVoice.shift());
}
$("soundButton").onclick = async () => {
  AC ||= new AudioContext();
  await AC.resume();
  voicePlayer ||= new FestivalVoiceQueue({
    context: AC,
    output: AC.destination,
    duck() {},
    settings: () => settings,
    shouldPlay: (m) =>
      m.round === current?.round &&
      m.number === current?.number &&
      m.phase ===
        (current?.phase === "paused" ? current.pausedPhase : current?.phase),
    onFinish: (m) => {
      if (m.reportToken)
        ws.send(JSON.stringify({ t: "ttsDone", reportToken: m.reportToken }));
    },
    onWarning: (text) => ($("audioWarning").textContent = text),
  });
  ws.send(JSON.stringify({ t: "audioReady", ready: true }));
  $("soundButton").hidden = true;
  flushVoice();
};
const ws = new LiveSocket(
  "overlay",
  (m) => {
    if (m.t === "state") render(m);
    if (m.t === "tts") {
      pendingVoice.push(m);
      flushVoice();
    }
  },
  (status) => {
    if (status === "connected" && AC?.state === "running")
      ws.send(JSON.stringify({ t: "audioReady", ready: true }));
    if (status !== "connected")
      $("liveStatus").textContent = "Đang nối lại server…";
  },
);
