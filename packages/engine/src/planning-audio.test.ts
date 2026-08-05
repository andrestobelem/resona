import { describe, expect, it } from "vitest";

import { compileExecutionPlan } from "./planning.js";
import { duration, position, rational } from "./time/rational.js";

const composition = {
  format: "resona/composition-ir" as const,
  schemaVersion: 1 as const,
  compositionId: "audio",
  duration: duration.seconds(5n),
  tempo: {
    type: "constant-tempo" as const,
    bpm: rational(120n),
    timeSignature: { beatsPerBar: 4, beatUnit: 4 },
  },
  metadata: {},
  root: {
    type: "sequence" as const,
    id: "root",
    path: ["audio", "root"] as [string, string],
    from: position.seconds(0n),
    children: [
      {
        type: "audio-track" as const,
        id: "track",
        path: ["audio", "root", "track"] as [string, string, string],
        clips: [
          {
            type: "audio-clip" as const,
            id: "clip",
            path: ["audio", "root", "track", "clip"] as [string, string, string, string],
            from: position.seconds(1n),
            resource: {
              type: "resona/static-audio" as const,
              version: 1 as const,
              path: "tone.wav",
            },
            offset: duration.seconds(1n),
            duration: duration.seconds(2n),
            loop: true,
          },
        ],
        effects: [
          {
            type: "gain" as const,
            id: "gain",
            path: ["audio", "root", "track", "gain"] as [string, string, string, string],
            gain: 1,
          },
        ],
        automation: [],
      },
    ],
  },
};

describe("AudioClip planning", () => {
  it("resolves exact placement and deduplicates the prepared resource", () => {
    const resource = {
      type: "wav" as const,
      hash: `sha256:${"b".repeat(64)}` as `sha256:${string}`,
      channels: 1 as const,
      sampleRate: 48_000 as const,
      frameCount: 240_000,
      sourcePaths: ["tone.wav"],
      samples: [0],
    };
    const { plan } = compileExecutionPlan(composition, [resource]);
    expect(plan.resources).toEqual([
      {
        type: "wav",
        hash: resource.hash,
        channels: 1,
        sampleRate: 48_000,
        frameCount: 240_000,
      },
    ]);
    expect(plan.audioRegions).toEqual([
      {
        type: "audio-region",
        resource: 0,
        destination: 0,
        startFrame: 48_000,
        durationFrames: 96_000,
        sourceOffsetFrame: 48_000,
        loop: true,
      },
    ]);
  });
});
