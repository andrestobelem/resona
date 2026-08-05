import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createStaticAudioPreparationResolver } from "./static-audio-resolver.js";

const wav = (channels = 1, sampleRate = 48_000): Buffer => {
  const bytes = Buffer.alloc(44 + channels * 4);
  bytes.write("RIFF", 0);
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(3, 20);
  bytes.writeUInt16LE(channels, 22);
  bytes.writeUInt32LE(sampleRate, 24);
  bytes.writeUInt32LE(sampleRate * channels * 4, 28);
  bytes.writeUInt16LE(channels * 4, 32);
  bytes.writeUInt16LE(32, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(channels * 4, 40);
  bytes.writeFloatLE(-0, 44);
  return bytes;
};

describe("static audio resolver", () => {
  it("retains canonical finite Float32 PCM and rejects unsupported profiles/paths", async () => {
    const root = await mkdtemp(join(tmpdir(), "resona-audio-"));
    try {
      await writeFile(join(root, "ok.wav"), wav());
      await writeFile(join(root, "bad.wav"), wav(1, 44_100));
      const resolver = createStaticAudioPreparationResolver(root, new AbortController().signal);
      const resource = await resolver.audio({
        type: "resona/static-audio",
        version: 1,
        path: "ok.wav",
      });
      expect(resource).toMatchObject({ channels: 1, sampleRate: 48_000, frameCount: 1 });
      expect((resource as { samples?: readonly number[] }).samples).toEqual([0]);
      await expect(
        resolver.audio({ type: "resona/static-audio", version: 1, path: "bad.wav" }),
      ).rejects.toThrow();
      await expect(
        resolver.audio({ type: "resona/static-audio", version: 1, path: "../bad.wav" }),
      ).rejects.toThrow();
      await expect(
        resolver.audio({ type: "resona/static-audio", version: 1, path: "/tmp/bad.wav" }),
      ).rejects.toThrow();
      await expect(
        resolver.audio({ type: "resona/static-audio", version: 1, path: "\\tmp\\bad.wav" }),
      ).rejects.toThrow();
      await expect(
        resolver.audio({ type: "resona/static-audio", version: 1, path: "" }),
      ).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
