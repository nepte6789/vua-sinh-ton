const $ = (id) => document.getElementById(id);
let ws,
  state = null,
  bank = [],
  bankDirty = false,
  autoState = null,
  selectedId = "";
const send = (cmd, data = {}) =>
  ws?.send(JSON.stringify({ t: "control", cmd, ...data }));
let noticeTimer;
function notice(text) {
  $("notice").textContent = text;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => ($("notice").textContent = ""), 10000);
}
function appendLog(text) {
  $("logs").textContent += text + "\n";
  if ($("logs").textContent.length > 25000)
    $("logs").textContent = $("logs").textContent.slice(-20000);
  $("logs").scrollTop = $("logs").scrollHeight;
}
const phaseNames = {
  lobby: "Sảnh chờ",
  question: "Đang trả lời",
  reveal: "Chốt đáp án",
  paused: "Tạm dừng",
  finished: "Kết thúc ván",
};
function render(m) {
  state = m;
  const g = m.game;
  autoState = m.autoConnect;
  $("liveStatus").textContent =
    m.live.status === "connected"
      ? `TikTok: @${m.live.uniqueId} ✓`
      : "TikTok: " +
        ({
          idle: "chưa kết nối",
          connecting: "đang kết nối",
          disconnected: "mất kết nối",
          error: "lỗi kết nối",
        }[m.live.status] || m.live.status);
  $("liveStatus").className =
    "status " + (m.live.status === "connected" ? "ok" : "bad");
  if (m.live.uniqueId && !$("channel").value)
    $("channel").value = "@" + m.live.uniqueId;
  $("phaseStatus").textContent = phaseNames[g.phase];
  $("playerCount").textContent = `${g.islandCount}/200 trên đảo`;
  $("roundStat").textContent = g.round;
  $("questionStat").textContent = g.number + "/20";
  $("lockedStat").textContent = g.answered;
  $("currentQuestion").textContent =
    g.question?.prompt || "Đảo đang chờ người chơi…";
  $("waitingStat").textContent = "Hàng chờ: " + g.waitingCount;
  $("outStat").textContent = "Đã rời đảo: " + g.outCount;
  $("chatStat").textContent = "Chat TikTok: " + m.live.chatCount;
  $("chatStat").title = m.live.lastUser ? "Gần nhất: " + m.live.lastUser : "";
  const category = $("category");
  const options = ["mixed", ...g.categories];
  if (
    category.options.length !== options.length ||
    [...category.options].some((o, i) => o.value !== options[i])
  ) {
    category.replaceChildren();
    for (const value of options) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value === "mixed" ? "Tổng hợp tất cả chủ đề" : value;
      category.append(option);
    }
  }
  category.value = g.config.category;
  $("autoNext").checked = g.config.autoNext;
  $("voice").checked = m.settings.readQuestions;
  $("bots").textContent = m.demo ? "Tắt bot trả lời" : "Bật bot trả lời";
  $("start").disabled = g.phase !== "lobby";
  $("pause").disabled = !["question", "reveal"].includes(g.phase);
  $("resume").disabled = g.phase !== "paused";
  $("reveal").disabled = g.phase !== "question";
  $("next").disabled = g.phase !== "reveal";
  $("category").disabled = !["lobby", "finished"].includes(g.phase);
  $("autoNext").disabled = !["lobby", "finished"].includes(g.phase);
  $("feed").replaceChildren();
  for (const item of [...g.feed].reverse()) {
    const p = document.createElement("p");
    p.textContent = item.text;
    $("feed").append(p);
  }
  renderPlayers();
}
function renderPlayers() {
  if (!state) return;
  const filter = $("filter").value.toLocaleLowerCase("vi");
  const players = [...state.game.players].sort(
    (a, b) => b.points - a.points || b.correct - a.correct,
  );
  $("players").replaceChildren();
  const filtered = players.filter((p) =>
    p.name.toLocaleLowerCase("vi").includes(filter),
  );
  for (const p of filtered.slice(0, 300)) {
    const row = document.createElement("tr");
    const values = [
      players.indexOf(p) + 1,
      p.name,
      p.zone === "island"
        ? "Đảo #" + p.seat
        : p.zone === "waiting"
          ? "Hàng chờ"
          : "Đã rời đảo",
      p.points,
      `${p.recentCorrect}/${p.recentCount}`,
      p.strikes,
      p.demo ? "Mô phỏng" : "Người chơi",
    ];
    for (const value of values) {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    }
    $("players").append(row);
  }
  $("tableMore").textContent =
    `Hiển thị ${Math.min(300, filtered.length)}/${filtered.length} người chơi`;
}
setInterval(() => {
  if (state) {
    const g = state.game;
    $("timeStat").textContent = g.deadline
      ? Math.max(0, Math.ceil((g.deadline - Date.now()) / 1000))
      : g.phase === "paused"
        ? "Ⅱ"
        : 20;
  }
  if (autoState?.enabled) {
    const remaining = autoState.nextAttemptAt
      ? Math.max(0, Math.ceil((autoState.nextAttemptAt - Date.now()) / 1000))
      : null;
    $("autoStatus").textContent =
      autoState.phase === "connected"
        ? "Kết nối ổn định · tự kiểm tra mỗi 2 phút"
        : `@${autoState.target} · ${autoState.phase === "connecting" ? "đang kết nối" : remaining !== null ? "thử lại sau " + remaining + " giây" : autoState.phase}` +
          (autoState.error ? " · " + autoState.error : "");
  }
}, 250);
ws = new LiveSocket(
  "control",
  (m) => {
    if (m.t === "state") render(m);
    else if (m.t === "error") notice(m.message);
    else if (m.t === "result") {
      if (!m.result.ok)
        notice(
          {
            locked: "Bạn đã chốt câu trả lời đầu tiên.",
            not_joined: "Bình luận VÔ trước khi trả lời.",
            closed: "Câu hỏi chưa mở hoặc đã hết giờ.",
            out: "Bạn đã rời đảo, bình luận VÔ để tham gia lại.",
          }[m.result.reason] || "Không nhận được lệnh.",
        );
      else notice("Đã nhận bình luận thử.");
    } else if (m.t === "log") appendLog(m.text);
    else if (m.t === "logs") {
      $("logs").textContent = m.lines.join("\n");
    }
  },
  (status) => {
    $("serverStatus").textContent =
      status === "connected" ? "Server: đang chạy" : "Server: đang nối lại";
    $("serverStatus").className =
      "status " + (status === "connected" ? "ok" : "bad");
    if (status !== "connected") {
      $("liveStatus").textContent = "TikTok: chờ xác nhận từ server";
      $("liveStatus").className = "status";
    }
  },
);
$("connect").onclick = () => send("connect", { channel: $("channel").value });
$("disconnect").onclick = () => send("disconnect");
for (const cmd of ["start", "pause", "resume", "reveal", "next"])
  $(cmd).onclick = () => send(cmd);
$("newRound").onclick = () => {
  if (
    !state?.game.players.length ||
    confirm(
      "Bắt đầu ván mới sẽ xóa điểm và danh sách của ván hiện tại. Tiếp tục?",
    )
  )
    send("newRound");
};
$("category").onchange = () =>
  send("configure", {
    config: { category: $("category").value, autoNext: $("autoNext").checked },
  });
$("autoNext").onchange = $("category").onchange;
$("voice").onchange = () => send("voice", { enabled: $("voice").checked });
$("send").onclick = () =>
  send("simulate", { name: $("simName").value, text: $("simText").value });
$("simText").onkeydown = (e) => {
  if (e.key === "Enter") $("send").click();
};
$("join").onclick = () =>
  send("simulate", { name: $("simName").value, text: "VÔ" });
$("correct").onclick = () => {
  const q = bank.find((q) => q.id === state?.game.question?.id);
  if (!q) return notice("Chưa có câu hỏi đang mở.");
  send("simulate", { name: $("simName").value, text: q.answers[0] });
};
$("fill12").onclick = () => send("fill", { count: 12 });
$("fill200").onclick = () => send("fill", { count: 200 });
$("bots").onclick = () => send("bots", { on: !state?.demo });
$("filter").oninput = renderPlayers;
function bankOptions() {
  const select = $("questionSelect");
  select.replaceChildren();
  for (const q of bank) {
    const option = document.createElement("option");
    option.value = q.id;
    option.textContent = `[${q.category}] ${q.prompt}`;
    select.append(option);
  }
  $("bankCount").textContent =
    `${bank.length} câu · ${new Set(bank.map((q) => q.category)).size} chủ đề` +
    (bankDirty ? " · chưa lưu" : "");
  if (bank.some((q) => q.id === selectedId)) select.value = selectedId;
  else selectedId = select.value;
  loadQuestion();
}
function loadQuestion() {
  selectedId = $("questionSelect").value;
  const q = bank.find((q) => q.id === selectedId);
  if (!q) return;
  $("questionId").value = q.id;
  $("questionCategory").value = q.category;
  $("questionPrompt").value = q.prompt;
  $("questionAnswers").value = q.answers.join(" | ");
  $("questionExplanation").value = q.explanation;
}
$("questionSelect").onchange = loadQuestion;
$("newQuestion").onclick = () => {
  $("questionId").value = "";
  $("questionCategory").value = "";
  $("questionPrompt").value = "";
  $("questionAnswers").value = "";
  $("questionExplanation").value = "";
  $("questionPrompt").focus();
};
$("questionForm").onsubmit = (e) => {
  e.preventDefault();
  const id = $("questionId").value || crypto.randomUUID();
  const q = {
    id,
    category: $("questionCategory").value.trim(),
    prompt: $("questionPrompt").value.trim(),
    answers: $("questionAnswers")
      .value.split("|")
      .map((x) => x.trim())
      .filter(Boolean),
    explanation: $("questionExplanation").value.trim(),
  };
  const index = bank.findIndex((x) => x.id === id);
  if (index >= 0) bank[index] = q;
  else bank.push(q);
  selectedId = id;
  bankDirty = true;
  bankOptions();
  notice("Đã cập nhật bản nháp. Bấm Lưu bộ câu hỏi để áp dụng.");
};
$("deleteQuestion").onclick = () => {
  if (confirm("Xóa câu hỏi đang chọn khỏi bản nháp?")) {
    bank = bank.filter((q) => q.id !== selectedId);
    bankDirty = true;
    bankOptions();
  }
};
async function saveBank() {
  try {
    const response = await fetch("/api/questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bank),
    });
    const result = await response.json();
    if (!response.ok) throw Error(result.error);
    bankDirty = false;
    bankOptions();
    notice("Đã lưu " + result.count + " câu hỏi.");
  } catch (e) {
    notice(e.message);
  }
}
$("saveBank").onclick = saveBank;
$("importFile").onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    if (file.size > 1024 * 1024) throw Error("File vượt 1 MB");
    const value = JSON.parse(await file.text());
    if (
      !Array.isArray(value) ||
      value.length < 20 ||
      value.some(
        (q) =>
          !q ||
          typeof q.id !== "string" ||
          typeof q.category !== "string" ||
          typeof q.prompt !== "string" ||
          !Array.isArray(q.answers) ||
          !q.answers.length ||
          q.answers.some((a) => typeof a !== "string"),
      )
    )
      throw Error(
        "File phải gồm ít nhất 20 câu, mỗi câu có id/category/prompt/answers hợp lệ",
      );
    if (!confirm("Thay bản nháp bằng bộ câu hỏi trong file?")) return;
    bank = value;
    bankDirty = true;
    bankOptions();
    notice("Đã nhập bản nháp, bấm Lưu để áp dụng.");
  } catch (error) {
    notice(error.message);
  }
};
$("export").onclick = () => {
  const url = URL.createObjectURL(
      new Blob([JSON.stringify(bank, null, 2)], { type: "application/json" }),
    ),
    a = document.createElement("a");
  a.href = url;
  a.download = "vua-sinh-ton-questions.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
fetch("/api/questions")
  .then((r) => {
    if (!r.ok) throw Error("Không tải được câu hỏi");
    return r.json();
  })
  .then((value) => {
    bank = value;
    bankOptions();
  })
  .catch((e) => notice(e.message));
