import { describe, expect, it } from "vitest";

import { createAudioEngine } from "./audio-engine.js";

const plan = {
  format: "resona/execution-plan" as const,
  schemaVersion: 1 as const,
  compositionId: "engine-test",
  sampleRate: 48_000 as const,
  channels: 2 as const,
  nominalDurationFrames: 8,
  masterProcessor: 1,
  processors: [
    {
      type: "poly-synth" as const,
      maxVoices: 1,
      oscillator: "sine" as const,
      attackFrames: 0,
      decayFrames: 0,
      sustain: 1,
      releaseFrames: 0,
    },
    { type: "sum" as const },
  ],
  routes: [{ from: 0, to: 1 }],
  resources: [],
  audioRegions: [],
  events: [
    {
      type: "note-attack" as const,
      frame: 0,
      instrument: 0,
      occurrence: 1,
      semitonesFromA4: 0,
      velocity: 0.5,
    },
    { type: "note-release" as const, frame: 4, instrument: 0, occurrence: 1 },
  ],
  automation: [],
};

const resourcePlan = {
  ...plan,
  compositionId: "resource-test",
  processors: [{ type: "sum" as const }, { type: "sum" as const }],
  resources: [
    {
      type: "wav" as const,
      hash: `sha256:${"a".repeat(64)}` as `sha256:${string}`,
      channels: 1 as const,
      sampleRate: 48_000 as const,
      frameCount: 4,
    },
  ],
  audioRegions: [
    {
      type: "audio-region" as const,
      resource: 0,
      destination: 0,
      startFrame: 0,
      durationFrames: 4,
      sourceOffsetFrame: 0,
      loop: false,
    },
  ],
  routes: [{ from: 0, to: 1 }],
  events: [],
};
const resource = resourcePlan.resources[0]!;

describe("AudioEngine", () => {
  it("processes the same plan across block boundaries and advances its sample cursor", () => {
    const engine = createAudioEngine(plan, []);
    const first = new Float32Array(3 * 2);
    const second = new Float32Array(5 * 2);

    expect(engine.process(first, 3)).toBe(3);
    expect(engine.process(second, 5)).toBe(5);
    expect(engine.cursorFrame).toBe(8);
    const contiguousEngine = createAudioEngine(plan, []);
    const contiguous = new Float32Array(16);
    contiguousEngine.process(contiguous, 8);
    expect(Array.from(first).concat(Array.from(second))).toEqual(Array.from(contiguous));
    expect(first[2]).toBeGreaterThan(0);
    expect(first[2]).toBe(first[3]);
    expect(second[0]).toBeGreaterThan(0);
    expect(second[4]).toBe(0);
    expect(engine.meters()[0]).toBeGreaterThan(0);
    expect(engine.meters()[1]).toBeGreaterThan(0);
  });

  it("reconstructs state on seek and rejects non-finite transferred samples", () => {
    const samples = new Float32Array([0.25, 0.5, 0.75, 1]);
    const fullEngine = createAudioEngine(resourcePlan, [
      {
        ...resource,
        samples,
      },
    ]);
    const full = new Float32Array(8);
    fullEngine.process(full, 4);

    const partialEngine = createAudioEngine(resourcePlan, [
      {
        ...resource,
        samples,
      },
    ]);
    partialEngine.seek(2);
    const partial = new Float32Array(4);
    partialEngine.process(partial, 2);
    expect(Array.from(partial)).toEqual(Array.from(full).slice(4, 8));

    expect(() =>
      createAudioEngine(resourcePlan, [
        {
          ...resource,
          samples: new Float32Array([0, Number.NaN, 0, 0]),
        },
      ]),
    ).toThrow("non-finite");
  });

  it("rejects unsupported processors at the browser boundary", () => {
    const invalidPlan = {
      ...plan,
      processors: [{ type: "unsupported" }, { type: "sum" as const }],
    } as never;
    expect(() => createAudioEngine(invalidPlan, [])).toThrow("unsupported processor");
  });
});
