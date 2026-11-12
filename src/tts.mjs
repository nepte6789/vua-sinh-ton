import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

export function splitSpeech(text, limit = 160) {
  const words = String(text).trim().split(/\s+/u),
    parts = [];
  let part = "";
  for (const word of words) {
    if (part && part.length + word.length + 1 > limit) {
      parts.push(part);
      part = "";
    }
    part += (part ? " " : "") + word;
  }
  if (part) parts.push(part);
  return parts;
}
const escapeXML = (s) =>
  s.replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c],
  );

// Never accept 'close' as success: only readable end means turn.end was received.
export async function completeSpeech(
  text,
  settings,
  {
    createClient = () =>
      new MsEdgeTTS({ connectionTimeoutMs: 10000, synthesisTimeoutMs: 15000 }),
    wait = (ms) => new Promise((r) => setTimeout(r, ms)),
    attempts = 2,
    deadlineMs = 18000,
  } = {},
) {
  const output = [];
  for (const part of splitSpeech(text)) {
    let completed = false,
      lastError;
    for (let attempt = 0; attempt < attempts; attempt++) {
      const client = createClient();
      let audioStream,
        timer,
        cancelled = false;
      try {
        const work = (async () => {
          await client.setMetadata(
            settings.voice,
            OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3,
          );
          if (cancelled) throw Error("TTS đã hết thời gian chờ");
          ({ audioStream } = await client.toStream(escapeXML(part), {
            pitch: `${settings.pitch >= 0 ? "+" : ""}${settings.pitch}Hz`,
            rate: `${settings.rate >= 0 ? "+" : ""}${settings.rate}%`,
          }));
          const chunks = [];
          for await (const chunk of audioStream)
            chunks.push(Buffer.from(chunk));
          const audio = Buffer.concat(chunks);
          if (!audio.length) throw Error("TTS trả âm thanh rỗng");
          return audio;
        })();
        const timeout = new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(Error("TTS vượt thời gian chờ")),
            deadlineMs,
          );
        });
        output.push(await Promise.race([work, timeout]));
        completed = true;
        break;
      } catch (error) {
        lastError = error;
      } finally {
        cancelled = true;
        clearTimeout(timer);
        audioStream?.destroy();
        try {
          client.close();
        } catch {}
      }
      if (attempt + 1 < attempts) await wait(300 * (attempt + 1));
    }
    if (!completed) throw lastError;
  }
  return Buffer.concat(output);
}
