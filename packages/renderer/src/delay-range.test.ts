import { describe, expect, it } from "vitest";

import { renderAudio } from "./render-audio.js";

const job = () =>
  ({
    variant: { resources: [] },
    runtimeResources: [
      {
        type: "wav" as const,
        hash: `sha256:${"d".repeat(64)}` as `sha256:${string}`,
        channels: 1 as const,
        sampleRate: 48_000 as const,
        frameCount: 1,
        sourcePaths: ["impulse.wav"],
        samples: [1],
      },
    ],
    plan: {
      format: "resona/execution-plan" as const,
      schemaVersion: 1 as const,
      compositionId: "delay",
      sampleRate: 48_000 as const,
      channels: 2 as const,
      nominalDurationFrames: 4,
      masterProcessor: 2,
      processors: [
        { type: "sum" as const },
        { type: "delay" as const, delayFrames: 2, feedback: 0.5, mix: 0.5 },
        { type: "sum" as const },
      ],
      routes: [
        { from: 0, to: 1 },
        { from: 1, to: 2 },
      ],
      resources: [
        {
          type: "wav" as const,
          hash: `sha256:${"d".repeat(64)}` as `sha256:${string}`,
          channels: 1 as const,
          sampleRate: 48_000 as const,
          frameCount: 1,
        },
      ],
      audioRegions: [
        {
          type: "audio-region" as const,
          resource: 0,
          destination: 0,
          startFrame: 0,
          durationFrames: 1,
          sourceOffsetFrame: 0,
          loop: false,
        },
      ],
      events: [],
      automation: [],
    },
  }) as never;

describe("Delay and finite ranges", () => {
  it("keeps integer-frame feedback deterministic and reconstructs a partial range with preroll", () => {
    const full = renderAudio(job());
    expect(Array.from(full.samples)).toEqual([0.5, 0.5, 0, 0, 0.5, 0.5, 0, 0].map(Math.fround));
    const partial = renderAudio(job(), { startFrame: 2, endFrame: 4 });
    expect(Array.from(partial.samples)).toEqual(Array.from(full.samples).slice(4, 8));
  });

  it("adds only an explicit tail to the requested range", () => {
    const tailed = renderAudio(job(), { endFrame: 1, tailFrames: 3 });
    expect(tailed.frames).toBe(4);
    expect(Array.from(tailed.samples)).toEqual(Array.from(renderAudio(job()).samples));
  });
});
