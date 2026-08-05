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

    const duplicateComposition = {
      ...composition,
      root: {
        ...composition.root,
        children: [
          {
            ...composition.root.children[0]!,
            clips: [
              ...composition.root.children[0]!.clips,
              {
                ...composition.root.children[0]!.clips[0]!,
                id: "clip-2",
                path: ["audio", "root", "track", "clip-2"],
                from: position.seconds(3n),
              },
            ],
          },
        ],
      },
    } as typeof composition;
    const duplicatePlan = compileExecutionPlan(duplicateComposition, [resource]).plan;
    expect(duplicatePlan.resources).toHaveLength(1);
    expect(duplicatePlan.audioRegions).toHaveLength(2);
  });

  it("preserves the declared Gain and Delay effect order in the plan", () => {
    const effectComposition = {
      ...composition,
      root: {
        ...composition.root,
        children: [
          {
            ...composition.root.children[0]!,
            effects: [
              ...composition.root.children[0]!.effects,
              {
                type: "delay" as const,
                id: "delay",
                path: ["audio", "root", "track", "delay"] as [string, string, string, string],
                time: duration.seconds(1n, 48_000n),
                feedback: 0.5,
                mix: 0.25,
              },
            ],
          },
        ],
      },
    } as typeof composition;
    const { plan } = compileExecutionPlan(effectComposition, [
      {
        type: "wav",
        hash: `sha256:${"c".repeat(64)}` as `sha256:${string}`,
        channels: 1,
        sampleRate: 48_000,
        frameCount: 96_000,
        sourcePaths: ["tone.wav"],
        samples: [0],
      },
    ]);
    expect(plan.processors.map((processor) => processor.type)).toEqual([
      "sum",
      "gain",
      "delay",
      "sum",
    ]);
    expect(plan.routes).toEqual([
      { from: 0, to: 1 },
      { from: 1, to: 2 },
      { from: 2, to: 3 },
    ]);
  });
});
