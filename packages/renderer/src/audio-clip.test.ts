import { describe, expect, it } from "vitest";

import { renderAudio } from "./render-audio.js";

const audioJob = (
  resource: Readonly<{ channels: 1 | 2; samples: readonly number[] }>,
  loop = false,
) =>
  ({
    variant: { resources: [] },
    runtimeResources: [
      {
        type: "wav" as const,
        hash: ("sha256:" + "a".repeat(64)) as `sha256:${string}`,
        channels: resource.channels,
        sampleRate: 48_000 as const,
        frameCount: resource.samples.length / resource.channels,
        samples: resource.samples,
      },
    ],
    plan: {
      format: "resona/execution-plan" as const,
      schemaVersion: 1 as const,
      compositionId: "audio-clip",
      sampleRate: 48_000 as const,
      channels: 2 as const,
      nominalDurationFrames: 5,
      masterProcessor: 2,
      processors: [
        { type: "sum" as const },
        { type: "gain" as const, gain: 1 },
        { type: "sum" as const },
      ],
      routes: [
        { from: 0, to: 1 },
        { from: 1, to: 2 },
      ],
      resources: [
        {
          type: "wav" as const,
          hash: ("sha256:" + "a".repeat(64)) as `sha256:${string}`,
          channels: resource.channels,
          sampleRate: 48_000 as const,
          frameCount: resource.samples.length / resource.channels,
        },
      ],
      audioRegions: [
        {
          type: "audio-region" as const,
          resource: 0,
          destination: 0,
          startFrame: 0,
          durationFrames: 5,
          sourceOffsetFrame: 1,
          loop,
        },
      ],
      events: [],
      automation: [],
    },
  }) as never;

describe("AudioClip rendering", () => {
  it("duplicates mono and places exact frames from the offset", () => {
    const rendered = renderAudio(audioJob({ channels: 1, samples: [0.1, 0.2, 0.3, 0.4] }));
    expect(Array.from(rendered.samples)).toEqual(
      [0.2, 0.2, 0.3, 0.3, 0.4, 0.4, 0, 0, 0, 0].map(Math.fround),
    );
  });

  it("preserves stereo channels and loops the exact region", () => {
    const rendered = renderAudio(
      audioJob({ channels: 2, samples: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6] }, true),
    );
    expect(Array.from(rendered.samples)).toEqual(
      [0.3, 0.4, 0.5, 0.6, 0.3, 0.4, 0.5, 0.6, 0.3, 0.4].map(Math.fround),
    );
  });
});
