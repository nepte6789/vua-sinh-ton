import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { Game, normalize, validateQuestions } from "../src/game.mjs";
const bank = JSON.parse(
  fs.readFileSync(new URL("../data/questions.json", import.meta.url), "utf8"),
);
function setup() {
  let now = 1000;
  const game = new Game({
    questions: bank,
    now: () => now,
    random: () => 0.999,
  });
  return {
    game,
    setNow: (t) => (now = t),
    advance: (ms) => (now += ms),
    close() {
      now = game.deadline;
      game.tick();
    },
    next() {
      game.next();
    },
  };
}
const person = (id) => ({ id: String(id), name: "Người " + id });
function answer(game, id, correct = true) {
  return game.submit(
    String(id),
    correct ? game.deck[game.number - 1].answers[0] : "sai đáp án",
  );
}
test("120 questions across six topics have unique ids and valid answers", () => {
  assert.equal(bank.length, 120);
  assert.equal(new Set(bank.map((q) => q.category)).size, 6);
  assert.equal(new Set(bank.map((q) => q.prompt)).size, 120);
  assert.equal(validateQuestions(bank).length, 120);
  assert.throws(() => validateQuestions([...bank, bank[0]]));
});
test("server enforces 25 seconds, first answer, and does not reveal answer early", () => {
  const f = setup(),
    g = f.game;
  g.join(person(1));
  g.start();
  assert.equal(g.deadline - g.openedAt, 25000);
  assert.equal(g.snapshot().question.answer, undefined);
  f.setNow(g.deadline - 1);
  assert.equal(answer(g, 1, false).ok, true);
  assert.equal(answer(g, 1, true).reason, "locked");
  f.setNow(g.deadline);
  assert.equal(answer(g, 1, true).reason, "closed");
  g.tick();
  assert.equal(g.phase, "reveal");
  assert.ok(g.snapshot().question.answer);
  assert.equal(g.players.get("1").points, 0);
  assert.equal(g.players.get("1").strikes, 0);
});
test("normalize accents, spaces and case for Vietnamese answers", () => {
  assert.equal(normalize(" CÁ CAO! "), normalize("ca cao"));
  const f = setup();
  f.game.join(person(1));
  f.game.start();
  f.game.submit("1", "CA CAO");
  f.close();
  assert.equal(f.game.players.get("1").points, 10);
});
test("three unanswered questions remove a player; wrong answers do not count as silence", () => {
  const f = setup(),
    g = f.game;
  g.join(person(1));
  g.join(person(2));
  g.start();
  for (let i = 0; i < 3; i++) {
    answer(g, 2, false);
    f.close();
    if (i < 2) f.next();
  }
  assert.equal(g.players.get("1").zone, "out");
  assert.equal(g.players.get("2").zone, "island");
  assert.equal(g.players.get("2").strikes, 0);
  assert.equal(g.snapshot().waitingCount, 0);
});
test("three correct out of six, not necessarily consecutive, survive; rolling window is evaluated next", () => {
  const f = setup(),
    g = f.game;
  g.join(person(1));
  g.start();
  for (const correct of [true, false, true, false, true, false]) {
    answer(g, 1, correct);
    f.close();
    if (g.number < 6) f.next();
  }
  assert.equal(g.players.get("1").zone, "island");
  assert.equal(g.players.get("1").history.filter(Boolean).length, 3);
  f.next();
  answer(g, 1, false);
  f.close();
  assert.equal(g.players.get("1").zone, "out");
});
test("two correct among six causes removal even when all questions were answered", () => {
  const f = setup(),
    g = f.game;
  g.join(person(1));
  g.start();
  for (let i = 0; i < 6; i++) {
    answer(g, 1, i < 2);
    f.close();
    if (i < 5) f.next();
  }
  assert.equal(g.players.get("1").zone, "out");
});
test("capacity 200, queue FIFO, no instant resurrection and VO re-entry works", () => {
  const f = setup(),
    g = f.game;
  for (let i = 0; i < 202; i++) g.comment(person(i), "VÔ");
  assert.equal(g.island().length, 200);
  assert.equal(g.snapshot().waitingCount, 2);
  g.start();
  for (let n = 0; n < 3; n++) {
    for (let i = 1; i < 200; i++) answer(g, i, true);
    f.close();
    if (n < 2) f.next();
  }
  assert.equal(g.players.get("0").zone, "out");
  assert.equal(g.players.get("200").zone, "island");
  assert.equal(g.players.get("201").zone, "waiting");
  assert.equal(g.island().length, 200);
  assert.deepEqual(g.players.get("200").history, []);
  g.join(person(0));
  assert.equal(g.players.get("0").zone, "waiting");
  assert.equal(g.players.get("201").joined < g.players.get("0").joined, true);
});
test("new arrivals may join after question 12 and get their own six-question evaluation", () => {
  const f = setup(),
    g = f.game;
  g.start();
  for (let i = 1; i < 14; i++) {
    f.close();
    f.next();
  }
  assert.equal(g.number, 14);
  g.comment(person("late"), "VÔ");
  assert.equal(g.players.get("late").zone, "island");
  answer(g, "late", true);
  f.close();
  assert.equal(g.players.get("late").history.length, 1);
});
test("repeat VO cannot reset survival history or duplicate a person", () => {
  const f = setup(),
    g = f.game;
  g.join(person(1));
  g.start();
  f.close();
  f.next();
  f.close();
  const p = g.players.get("1");
  assert.equal(p.strikes, 2);
  g.comment(person(1), "VO");
  assert.equal(p.strikes, 2);
  assert.equal(g.players.size, 1);
});
test("pause preserves remaining time and no answer is accepted while paused", () => {
  const f = setup(),
    g = f.game;
  g.join(person(1));
  g.start();
  f.advance(5000);
  g.pause();
  f.advance(60000);
  g.tick();
  assert.equal(g.phase, "paused");
  assert.equal(answer(g, 1, true).ok, false);
  g.resume();
  assert.equal(g.deadline - g.now(), 20000);
  answer(g, 1, true);
  f.close();
  assert.equal(g.players.get("1").points, 10);
});
test("100-question rounds restart with same occupants, seats and waiting order", () => {
  const f = setup(),
    g = f.game;
  g.configure({ category: "Toán học" });
  for (let i = 0; i < 201; i++) g.join(person(i));
  const seats = g.island().map((p) => [p.id, p.seat]);
  g.start();
  assert.equal(g.deck.length, 100);
  assert.ok(g.deck.every((q) => q.category === "Toán học"));
  for (let n = 1; n <= 100; n++) {
    for (let i = 0; i < 200; i++) answer(g, i);
    f.close();
    if (n === 100) {
      assert.equal(g.snapshot().rankingAt, 100);
      assert.equal(g.snapshot().leaderboard[0].points, 1000);
    }
    f.advance(5000);
    g.tick();
  }
  assert.equal(g.round, 2);
  assert.equal(g.number, 1);
  assert.equal(g.phase, "question");
  assert.deepEqual(
    g.island().map((p) => [p.id, p.seat]),
    seats,
  );
  assert.equal(g.players.get("200").zone, "waiting");
  assert.equal(g.players.size, 201);
  assert.ok(
    g
      .island()
      .every(
        (p) => p.points === 0 && p.history.length === 0 && p.strikes === 0,
      ),
  );
  assert.equal(g.snapshot().rankingAt, 0);
  assert.deepEqual(g.snapshot().leaderboard, []);
});
test("ranking refreshes only each ten questions and is frozen between checkpoints", () => {
  const f = setup(),
    g = f.game;
  g.join(person(1));
  g.start();
  for (let n = 1; n <= 11; n++) {
    answer(g, 1);
    f.close();
    assert.equal(g.snapshot().rankingDue, n === 10);
    if (n < 10) assert.deepEqual(g.snapshot().leaderboard, []);
    else {
      assert.equal(g.snapshot().leaderboard[0].points, 100);
      assert.equal(g.snapshot().rankingAt, 10);
    }
    f.next();
  }
});
test("mixed rounds have 100 unique questions when the pool is large enough", () => {
  const { game: g } = setup();
  g.start();
  assert.equal(g.deck.length, 100);
  assert.equal(new Set(g.deck.map((q) => q.id)).size, 100);
});
test("question bank changes require lobby/end and avatar URL rejects javascript", () => {
  const f = setup(),
    g = f.game;
  g.join({ ...person(1), avatar: "javascript:alert(1)" });
  assert.equal(g.players.get("1").avatar, "");
  g.start();
  assert.throws(() => g.setBank(bank));
});
test("negative and decimal answers are not confused with positive or whole numbers", () => {
  assert.notEqual(normalize("-5"), normalize("5"));
  assert.notEqual(normalize("1.5"), normalize("15"));
  assert.equal(normalize("1,5"), normalize("1.5"));
});
test("empty rounds also restart automatically after 100 questions", () => {
  const f = setup(),
    g = f.game;
  g.start();
  for (let i = 0; i < 100; i++) {
    f.close();
    f.next();
  }
  assert.equal(g.round, 2);
  assert.equal(g.number, 1);
  g.join(person("late"));
  assert.equal(g.players.get("late").zone, "island");
});
test("top three are correct answers ordered by latency and stay private until reveal", () => {
  const f = setup(),
    g = f.game;
  for (let i = 1; i <= 5; i++) g.join(person(i));
  g.start();
  f.advance(500);
  answer(g, 5, false);
  f.advance(500);
  answer(g, 3);
  f.advance(500);
  answer(g, 1);
  f.advance(500);
  answer(g, 4);
  f.advance(500);
  answer(g, 2);
  assert.deepEqual(g.snapshot().topAnswers, []);
  f.close();
  assert.deepEqual(
    g.snapshot().topAnswers.map((p) => p.id),
    ["3", "1", "4"],
  );
  assert.equal(g.snapshot().topAnswers[0].elapsed, 1000);
});
test("wait for speech completion then give a full five second countdown, including pause", () => {
  const f = setup(),
    g = f.game;
  g.start();
  g.waitForAnnouncement = true;
  f.close();
  assert.equal(g.deadline, null);
  f.advance(90000);
  g.tick();
  assert.equal(g.number, 1);
  g.finishAnnouncement();
  assert.equal(g.deadline - g.now(), 5000);
  f.advance(4999);
  g.tick();
  assert.equal(g.number, 1);
  f.advance(1);
  g.tick();
  assert.equal(g.number, 2);
  f.close();
  g.pause();
  g.finishAnnouncement();
  f.advance(60000);
  g.resume();
  assert.equal(g.deadline - g.now(), 5000);
});

test("chat keeps both player and bot comments even outside answer windows, bounded and reset per round", () => {
  const { game: g } = setup();
  g.comment(person("real"), "Xin chào");
  g.comment({ ...person("bot"), demo: true }, "VÔ");
  assert.equal(g.snapshot().chat[0].text, "Xin chào");
  assert.equal(g.snapshot().chat[1].demo, true);
  for (let i = 0; i < 60; i++) g.comment(person("real"), "Tin " + i);
  assert.equal(g.snapshot().chat.length, 50);
  assert.equal(g.snapshot().chat.at(-1).text, "Tin 59");
  g.newRound();
  assert.deepEqual(g.snapshot().chat, []);
});
