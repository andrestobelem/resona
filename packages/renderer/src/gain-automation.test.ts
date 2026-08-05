import { describe, expect, it } from "vitest";

import { renderAudio } from "./render-audio.js";

const job = (blockFrames: number) =>
  renderAudio(
    {
      plan: {
        format: "resona/execution-plan",
        schemaVersion: 1,
        compositionId: "gain-test",
        sampleRate: 48_000,
        channels: 2,
        nominalDurationFrames: 8,
        masterProcessor: 2,
        processors: [
          {
            type: "poly-synth",
            maxVoices: 1,
            oscillator: "sine",
            attackFrames: 0,
            decayFrames: 0,
            sustain: 1,
            releaseFrames: 0,
          },
          { type: "gain", gain: 1 },
          { type: "sum" },
        ],
        routes: [
          { from: 0, to: 1 },
          { from: 1, to: 2 },
        ],
        resources: [],
        audioRegions: [],
        events: [
          {
            type: "note-attack",
            frame: 0,
            instrument: 0,
            occurrence: 0,
            semitonesFromA4: 0,
            velocity: 1,
          },
        ],
        automation: [
          {
            type: "gain",
            target: 1,
            points: [
              { frame: 2, value: 0, interpolation: "hold" },
              { frame: 4, value: 1, interpolation: "linear" },
            ],
          },
        ],
      },
    } as never,
    { blockFrames },
  );

describe("Gain automation", () => {
  it("is invariant to render block partitioning", () => {
    expect(Array.from(job(1).samples)).toEqual(Array.from(job(8).samples));
  });
});
