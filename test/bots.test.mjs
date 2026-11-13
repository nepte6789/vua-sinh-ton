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
  advance(19800);
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

function removeBots(b, count) {
  for (const p of b
    .managed()
    .filter((p) => p.zone === "island")
    .slice(0, count)) {
    p.zone = "out";
    p.seat = null;
  }
}
test("replacement waits a random 1–3 minutes and adds only 1–3 departed bots per batch", () => {
  for (const [random, delay, batch] of [
    [() => 0, 60000, 1],
    [() => 0.999999, 180000, 3],
  ]) {
    const { g, b, advance } = setup(random);
    b.configure(true, 10);
    removeBots(b, 5);
    assert.equal(b.state().nextRefillAt - g.now(), delay);
    advance(delay - 1);
    b.tick();
    assert.equal(b.state().active, 5);
    advance(1);
    b.tick();
    assert.equal(b.state().active, 5 + batch);
    assert.equal(b.managed().length, 10);
    assert.equal(b.state().nextRefillAt - g.now(), delay);
  }
});
test("more real players skips the next refill and establishes a new comparison baseline", () => {
  const { g, b, advance } = setup(() => 0);
  b.configure(true, 10);
  removeBots(b, 5);
  g.join({ id: "real", name: "Khách" });
  advance(60000);
  b.tick();
  assert.equal(b.state().active, 5);
  advance(60000);
  b.tick();
  assert.equal(b.state().active, 6);
});
test("refill respects target, pauses, disabling and gives waiting humans priority", () => {
  const { g, b, advance } = setup(() => 0.999999);
  b.configure(true, 10);
  removeBots(b, 1);
  advance(180000);
  b.tick();
  assert.equal(b.state().active, 10);
  removeBots(b, 1);
  g.start();
  g.pause();
  advance(180000);
  b.tick();
  assert.equal(b.state().active, 9);
  g.resume();
  b.tick();
  assert.equal(b.state().active, 10);
  removeBots(b, 3);
  b.configure(false);
  advance(180000);
  b.tick();
  assert.equal(b.state().total, 0);
  assert.equal(b.state().nextRefillAt, null);
  const f = setup(() => 0);
  f.b.configure(true, 10);
  for (let i = 0; i < 191; i++) f.g.join({ id: "real" + i, name: "Khách" });
  removeBots(f.b, 2);
  f.advance(60000);
  f.b.tick();
  assert.equal(f.g.players.get("real190").zone, "island");
  assert.equal(f.b.state().active, 8);
  assert.equal(f.g.island().length, 199);
});
