import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { createRenderJob } from "../../engine/src/index.js";
import { renderAudio } from "./index.js";

const exactProjectRoot = fileURLToPath(
  new URL("../../engine/src/fixtures/exact-project/", import.meta.url),
);

describe("renderAudio", () => {
  it("renders the compiled sine note as an exact stereo float32 WAV", async () => {
    const job = await createRenderJob({
      projectRoot: exactProjectRoot,
      compositionId: "ExactNote",
    });

    const rendered = renderAudio(job);
    const view = new DataView(
      rendered.wav.buffer,
      rendered.wav.byteOffset,
      rendered.wav.byteLength,
    );

    expect(rendered.frames).toBe(48_000);
    expect(rendered.sampleRate).toBe(48_000);
    expect(rendered.channels).toBe(2);
    expect(rendered.samples.length).toBe(96_000);
    expect(rendered.wav.byteLength).toBe(44 + 48_000 * 2 * 4);
    expect(new TextDecoder().decode(rendered.wav.slice(0, 4))).toBe("RIFF");
    expect(new TextDecoder().decode(rendered.wav.slice(8, 12))).toBe("WAVE");
    expect(view.getUint16(20, true)).toBe(3);
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint32(24, true)).toBe(48_000);
    expect(view.getUint16(34, true)).toBe(32);
    expect(view.getUint32(40, true)).toBe(48_000 * 2 * 4);
    expect(rendered.samples[24_000 * 2]).toBe(0);
    expect(rendered.samples[24_001 * 2]).toBeGreaterThan(0);
    expect(rendered.samples[24_001 * 2]).toBe(rendered.samples[24_001 * 2 + 1]);
  });

  it("is bit-identical when the same plan is partitioned into different block sizes", async () => {
    const job = await createRenderJob({
      projectRoot: exactProjectRoot,
      compositionId: "ExactNote",
    });

    const byOne = renderAudio(job, { blockFrames: 1 });
    const byLargeBlocks = renderAudio(job, { blockFrames: 1024 });

    expect(byOne.samples).toEqual(byLargeBlocks.samples);
    expect(byOne.wav).toEqual(byLargeBlocks.wav);
  });
});
