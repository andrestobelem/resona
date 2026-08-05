import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { createRenderJob } from "./index.js";

const exactProjectRoot = fileURLToPath(new URL("./fixtures/exact-project/", import.meta.url));
describe("createRenderJob", () => {
  it("rejects a relative project root with a structured registration diagnostic", async () => {
    await expect(
      createRenderJob({ projectRoot: "relative-project", compositionId: "ExactNote" }),
    ).rejects.toMatchObject({
      name: "ResonaError",
      diagnostics: [
        {
          code: "registration.project-root-not-absolute",
          phase: "registration",
          severity: "error",
          compositionId: "ExactNote",
        },
      ],
    });
  });

  it("compiles nested exact time from a registered TSX project into inspectable artifacts", async () => {
    const job = await createRenderJob({
      projectRoot: exactProjectRoot,
      compositionId: "ExactNote",
    });

    expect(job).toEqual({
      composition: {
        format: "resona/composition-ir",
        schemaVersion: 1,
        compositionId: "ExactNote",
        duration: {
          type: "absolute-duration",
          seconds: { numerator: "1", denominator: "1" },
        },
        tempo: {
          type: "constant-tempo",
          bpm: { numerator: "120", denominator: "1" },
          timeSignature: { beatsPerBar: 4, beatUnit: 4 },
        },
        metadata: { title: "Exact note" },
        root: {
          type: "sequence",
          id: "root",
          path: ["ExactNote", "root"],
          from: {
            type: "absolute-position",
            seconds: { numerator: "0", denominator: "1" },
          },
          duration: {
            type: "absolute-duration",
            seconds: { numerator: "1", denominator: "1" },
          },
          children: [
            {
              type: "sequence",
              id: "section",
              path: ["ExactNote", "root", "section"],
              from: {
                type: "musical-position",
                quarterNotes: {
                  numerator: "9007199254740992",
                  denominator: "9007199254740993",
                },
              },
              children: [
                {
                  type: "sequence",
                  id: "phrase",
                  path: ["ExactNote", "root", "section", "phrase"],
                  from: {
                    type: "musical-position",
                    quarterNotes: {
                      numerator: "1",
                      denominator: "9007199254740993",
                    },
                  },
                  children: [
                    {
                      type: "instrument-track",
                      id: "lead",
                      path: ["ExactNote", "root", "section", "phrase", "lead"],
                      clips: [
                        {
                          type: "event-clip",
                          id: "note-clip",
                          path: ["ExactNote", "root", "section", "phrase", "lead", "note-clip"],
                          from: {
                            type: "absolute-position",
                            seconds: { numerator: "1", denominator: "96000" },
                          },
                          events: [
                            {
                              type: "note",
                              at: {
                                type: "absolute-position",
                                seconds: { numerator: "0", denominator: "1" },
                              },
                              duration: {
                                type: "absolute-duration",
                                seconds: { numerator: "1", denominator: "48000" },
                              },
                              pitch: { type: "twelve-tet", semitonesFromA4: 0 },
                              velocity: 1,
                            },
                          ],
                        },
                      ],
                      instrument: {
                        type: "poly-synth",
                        id: "synth",
                        path: ["ExactNote", "root", "section", "phrase", "lead", "synth"],
                        maxVoices: 32,
                        oscillator: "sine",
                        envelope: {
                          attack: {
                            type: "absolute-duration",
                            seconds: { numerator: "1", denominator: "100" },
                          },
                          decay: {
                            type: "absolute-duration",
                            seconds: { numerator: "1", denominator: "10" },
                          },
                          sustain: 0.8,
                          release: {
                            type: "absolute-duration",
                            seconds: { numerator: "1", denominator: "5" },
                          },
                        },
                      },
                      effects: [],
                      automation: [],
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
      plan: {
        format: "resona/execution-plan",
        schemaVersion: 1,
        compositionId: "ExactNote",
        sampleRate: 48_000,
        channels: 2,
        nominalDurationFrames: 48_000,
        masterProcessor: 1,
        processors: [
          {
            type: "poly-synth",
            maxVoices: 32,
            oscillator: "sine",
            attackFrames: 480,
            decayFrames: 4_800,
            sustain: 0.800000011920929,
            releaseFrames: 9_600,
          },
          { type: "sum" },
        ],
        routes: [{ from: 0, to: 1 }],
        resources: [],
        audioRegions: [],
        events: [
          {
            type: "note-attack",
            frame: 24_000,
            instrument: 0,
            occurrence: 0,
            semitonesFromA4: 0,
            velocity: 1,
          },
          { type: "note-release", frame: 24_002, instrument: 0, occurrence: 0 },
        ],
        automation: [],
      },
      diagnostics: [],
    });

    const serializedJob = JSON.stringify(job);
    const parsedJob: unknown = JSON.parse(serializedJob);
    expect(parsedJob).toEqual(job);
    expect(structuredClone(job)).toEqual(job);
    expect(Object.isFrozen(job)).toBe(true);
    expect(Object.isFrozen(job.composition.root.children)).toBe(true);
    expect(Object.isFrozen(job.plan.events)).toBe(true);
    expect(Reflect.set(job.plan, "sampleRate", 44_100)).toBe(false);

    const repeatedJob = await createRenderJob({
      projectRoot: exactProjectRoot,
      compositionId: "ExactNote",
    });
    expect(repeatedJob).toEqual(job);
    // The fixture changes its pitch on a second evaluation in the same JS realm.
    // Equality proves that each variant was evaluated in a fresh Worker.
  });

  it("validates an invalid note before pruning its offscreen clip", async () => {
    await expect(
      createRenderJob({
        projectRoot: exactProjectRoot,
        compositionId: "InvalidOffscreenNote",
      }),
    ).rejects.toMatchObject({
      name: "ResonaError",
      diagnostics: [
        {
          code: "plan.note-duration-non-positive",
          phase: "planning",
          severity: "error",
          compositionId: "InvalidOffscreenNote",
          nodePath: ["InvalidOffscreenNote", "root", "lead", "invalid-clip"],
          cause: { eventIndex: 0 },
        },
      ],
    });
  });

  it("reports every invalid offscreen note value before pruning", async () => {
    await expect(
      createRenderJob({
        projectRoot: exactProjectRoot,
        compositionId: "InvalidOffscreenValues",
      }),
    ).rejects.toMatchObject({
      name: "ResonaError",
      diagnostics: [
        {
          code: "plan.pitch-outside-executable-range",
          phase: "planning",
          severity: "error",
          compositionId: "InvalidOffscreenValues",
          nodePath: ["InvalidOffscreenValues", "root", "lead", "invalid-values"],
          cause: { eventIndex: 0 },
        },
        {
          code: "plan.note-velocity-out-of-range",
          phase: "planning",
          severity: "error",
          compositionId: "InvalidOffscreenValues",
          nodePath: ["InvalidOffscreenValues", "root", "lead", "invalid-values"],
          cause: { eventIndex: 1 },
        },
        {
          code: "plan.frame-out-of-safe-range",
          phase: "planning",
          severity: "error",
          compositionId: "InvalidOffscreenValues",
          nodePath: ["InvalidOffscreenValues", "root", "lead", "invalid-values"],
          cause: { eventIndex: 2 },
        },
      ],
    });
  });

  it("validates PolySynth parameters before producing a non-serializable plan", async () => {
    await expect(
      createRenderJob({ projectRoot: exactProjectRoot, compositionId: "InvalidSynth" }),
    ).rejects.toMatchObject({
      name: "ResonaError",
      diagnostics: [
        {
          code: "plan.poly-synth-max-voices-invalid",
          phase: "planning",
          nodePath: ["InvalidSynth", "root", "lead", "synth"],
        },
        {
          code: "plan.poly-synth-sustain-invalid",
          phase: "planning",
          nodePath: ["InvalidSynth", "root", "lead", "synth"],
        },
      ],
    });
  });

  it("reports an aggregated warning when a positive note rounds to zero frames", async () => {
    const job = await createRenderJob({
      projectRoot: exactProjectRoot,
      compositionId: "RoundedAwayNote",
    });

    expect(job.plan.events).toEqual([]);
    expect(job.diagnostics).toEqual([
      {
        code: "plan.note-rounded-to-zero-frames",
        phase: "planning",
        severity: "warning",
        message: "One or more positive notes rounded to no executable frames.",
        compositionId: "RoundedAwayNote",
        nodePath: ["RoundedAwayNote", "root", "lead", "short-note"],
        cause: { count: 1 },
      },
    ]);
  });
});
