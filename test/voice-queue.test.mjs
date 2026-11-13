import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
test("speech completion callback fires after playback, with original report token", async () => {
  const context = { window: {}, setTimeout, clearTimeout };
  vm.runInNewContext(
    fs.readFileSync(
      new URL("../public/assets/voice-queue.js", import.meta.url),
      "utf8",
    ),
    context,
  );
  let finishAudio;
  const completed = [];
  const queue = new context.window.FestivalVoiceQueue({
    duck() {},
    onWarning() {},
    onFinish: (m) => completed.push(m.reportToken),
  });
  queue.audio = () => new Promise((r) => (finishAudio = r));
  queue.enqueue({ url: "/test.mp3", text: "Top ba", reportToken: "round1:q1" });
  assert.deepEqual(completed, []);
  finishAudio();
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(completed, ["round1:q1"]);
});
