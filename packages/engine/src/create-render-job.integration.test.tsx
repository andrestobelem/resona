import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { createRenderJob } from "./index.js";

const exactProjectRoot = fileURLToPath(new URL("./fixtures/exact-project/", import.meta.url));
const configuredProjectRoot = fileURLToPath(
  new URL("./fixtures/configured-project/", import.meta.url),
);
const invalidConfigProjectRoot = fileURLToPath(
  new URL("./fixtures/invalid-config-project/", import.meta.url),
);
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

  it("resolves a typed project config and identifies its immutable authoring build", async () => {
    const job = await createRenderJob({
      projectRoot: configuredProjectRoot,
      compositionId: "Configured",
    });

    expect(job.project).toEqual({
      root: configuredProjectRoot,
      buildId: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      configuration: {
        entry: { value: "music.tsx", source: "project-config" },
        staticDir: { value: "assets", source: "project-config" },
      },
    });
    expect(Object.isFrozen(job.project)).toBe(true);
    expect(job.composition.duration).toEqual({
      type: "absolute-duration",
      seconds: { numerator: "2", denominator: "1" },
    });
    expect(job.composition.tempo).toEqual({
      type: "constant-tempo",
      bpm: { numerator: "90", denominator: "1" },
      timeSignature: { beatsPerBar: 3, beatUnit: 4 },
    });
    expect(job.composition.metadata).toEqual({
      title: "Prepared",
      nested: { source: "dynamic" },
      retained: true,
    });
    expect(job.variant).toMatchObject({
      compositionId: "Configured",
      duration: job.composition.duration,
      tempo: {
        bpm: job.composition.tempo.bpm,
        timeSignature: job.composition.tempo.timeSignature,
      },
      metadata: job.composition.metadata,
      resources: [],
      provenance: {
        duration: "prepare",
        tempo: "prepare",
        metadata: {
          title: "prepare",
          nested: "prepare",
          retained: "static-declaration",
        },
      },
    });
    expect(job.variant.inputs).toBe(job.inputs);

    const repeated = await createRenderJob({
      projectRoot: configuredProjectRoot,
      compositionId: "Configured",
    });
    expect(repeated.project).toEqual(job.project);
  });

  it("rejects invalid project configuration with a structured diagnostic", async () => {
    await expect(
      createRenderJob({
        projectRoot: invalidConfigProjectRoot,
        compositionId: "Configured",
      }),
    ).rejects.toMatchObject({
      diagnostics: [
        {
          code: "configuration.invalid",
          phase: "configuration",
          severity: "error",
          compositionId: "Configured",
        },
      ],
    });
  });

  it("rejects invalid preparation before evaluating authoring", async () => {
    await expect(
      createRenderJob({
        projectRoot: configuredProjectRoot,
        compositionId: "InvalidPreparation",
      }),
    ).rejects.toMatchObject({
      diagnostics: [
        {
          code: "preparation.failed",
          phase: "preparation",
          severity: "error",
          compositionId: "InvalidPreparation",
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
      project: {
        root: exactProjectRoot,
        buildId: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
        configuration: {
          entry: { value: "src/index.tsx", source: "resona-default" },
          staticDir: { value: "public", source: "resona-default" },
        },
      },
      variant: {
        compositionId: "ExactNote",
        inputs: {},
        inputSchema: {
          format: "resona/input-schema",
          schemaVersion: 1,
          jsonSchema: {
            $schema: "https://json-schema.org/draft/2020-12/schema",
            type: "object",
            additionalProperties: false,
          },
        },
        duration: {
          type: "absolute-duration",
          seconds: { numerator: "1", denominator: "1" },
        },
        tempo: {
          bpm: { numerator: "120", denominator: "1" },
          timeSignature: { beatsPerBar: 4, beatUnit: 4 },
        },
        metadata: { title: "Exact note" },
        resources: [],
        provenance: {
          duration: "static-declaration",
          tempo: "static-declaration",
          metadata: { title: "static-declaration" },
        },
      },
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
      inputs: {},
      inputSchema: {
        format: "resona/input-schema",
        schemaVersion: 1,
        jsonSchema: {
          $schema: "https://json-schema.org/draft/2020-12/schema",
          type: "object",
          additionalProperties: false,
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

  it("rejects invalid effective inputs before authoring evaluation", async () => {
    await expect(
      createRenderJob({
        projectRoot: exactProjectRoot,
        compositionId: "InputVariant",
        inputs: { intensity: 2 },
      }),
    ).rejects.toMatchObject({
      name: "ResonaError",
      diagnostics: [
        {
          code: "inputs.validation-failed",
          phase: "input-validation",
          severity: "error",
          compositionId: "InputVariant",
          cause: {
            issues: [
              {
                code: "invalid-input",
                path: [],
                message: "Invalid variant inputs.",
              },
            ],
          },
        },
      ],
    });
  });

  it("replaces nested input values instead of merging them recursively", async () => {
    await expect(
      createRenderJob({
        projectRoot: exactProjectRoot,
        compositionId: "InputVariant",
        inputs: { voice: {} },
      }),
    ).rejects.toMatchObject({
      diagnostics: [
        {
          code: "inputs.validation-failed",
          phase: "input-validation",
          compositionId: "InputVariant",
        },
      ],
    });
  });

  it.each(["RemoteSchemaVariant", "RemoteDynamicSchemaVariant"])(
    "rejects remote references in the serializable input schema for %s",
    async (compositionId) => {
      await expect(
        createRenderJob({
          projectRoot: exactProjectRoot,
          compositionId,
        }),
      ).rejects.toMatchObject({
        diagnostics: [
          {
            code: "inputs.schema-description-invalid",
            phase: "input-validation",
            compositionId,
          },
        ],
      });
    },
  );

  it("passes a canonical input named key through React authoring", async () => {
    const job = await createRenderJob({
      projectRoot: exactProjectRoot,
      compositionId: "KeyInputVariant",
    });

    expect(job.inputs).toEqual({ key: "canonical" });
    expect(job.diagnostics).toEqual([]);
  });

  it("protects the canonical candidate from a mutating input validator", async () => {
    const job = await createRenderJob({
      projectRoot: exactProjectRoot,
      compositionId: "MutatingInputVariant",
    });

    expect(job.inputs).toEqual({ intensity: 0.25 });
    expect(job.diagnostics).toEqual([]);
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
