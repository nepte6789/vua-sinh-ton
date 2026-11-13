import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { Game } from "../src/game.mjs";
import { BotDirector, botAvatar } from "../src/bots.mjs";
const questions = JSON.parse(
  fs.readFileSync(new URL("../data/questions.json", import.meta.url)),
);
function setup(random = () => 0.5) {
  let now = 1000;
  const g = new Game({ questions, now: () => now, random: () => 0.99 }),
    b = new BotDirector(g, { now: () => now, random });
  return { g, b, advance: (ms) => (now += ms) };
}
test("10–100 bots have diverse avatars and resizing preserves real participants", () => {
  const { g, b } = setup();
  g.join({ id: "real", name: "Khách thật" });
  assert.throws(() => b.configure(true, 9));
  assert.throws(() => b.configure(true, 101));
  b.configure(true, 100);
  assert.equal(b.state().active, 100);
  assert.equal(new Set(b.managed().map((p) => p.avatar)).size, 100);
  assert.equal(
    new Set(Array.from({ length: 100 }, (_, i) => botAvatar(i + 1))).size,
    100,
  );
  b.configure(true, 10);
  assert.equal(g.players.size, 11);
  b.configure(false);
  assert.equal(g.players.size, 1);
  assert.ok(g.players.has("real"));
});
test("bots obey capacity and prioritize existing waiting players", () => {
  const { g, b } = setup();
  for (let i = 0; i < 201; i++) g.join({ id: "real" + i, name: "Khách " + i });
  b.configure(true, 100);
  assert.equal(b.state().total, 0);
  assert.equal(g.island().length, 200);
  assert.equal(g.players.get("real200").zone, "waiting");
});
test("bots answer through the normal first-answer lock and pause blocks answers", () => {
  const { g, b, advance } = setup();
  b.configure(true, 10);
  g.start();
  b.tick();
  g.pause();
  advance(15000);
  b.tick();
  assert.equal(g.submissions.size, 0);
  g.resume();
  b.tick();
  assert.equal(g.submissions.size, 10);
  assert.ok(g.feed.some((x) => x.kind === "chat" || x.text.includes(": ")));
  assert.equal(g.submit(b.managed()[0].id, "other").reason, "locked");
  g.closeQuestion();
  assert.ok(b.managed().every((p) => p.points === 10));
});
test("bots can answer incorrectly or skip without bypassing survival rules", () => {
  const { g, b, advance } = setup(() => 0.99);
  b.configure(true, 10);
  g.start();
  b.tick();
  advance(23000);
  b.tick();
  g.closeQuestion();
  assert.ok(b.managed().every((p) => p.points === 0 && p.strikes === 0));
  const f = setup(() => 0.01);
  f.b.configure(true, 10);
  f.g.start();
  for (let i = 0; i < 3; i++) {
    f.b.tick();
    f.advance(25000);
    f.g.closeQuestion();
    if (i < 2) f.g.next();
  }
  assert.ok(f.b.managed().every((p) => p.zone === "out"));
});
