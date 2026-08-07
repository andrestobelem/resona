import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createRenderJob, type CreateRenderJobResult } from "../../engine/src/index.js";
import { renderAudio } from "./index.js";

const exactProjectRoot = fileURLToPath(
  new URL("../../engine/src/fixtures/exact-project/", import.meta.url),
);
const configuredProjectSourceRoot = fileURLToPath(
  new URL("../../engine/src/fixtures/configured-project/", import.meta.url),
);
const engineModulePath = fileURLToPath(new URL("../../engine/src/index.js", import.meta.url));
let configuredProjectRoot: string;

const wavBytes = (): Buffer => {
  const bytes = Buffer.alloc(48);
  bytes.write("RIFF", 0);
  bytes.writeUInt32LE(40, 4);
  bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(3, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(48_000, 24);
  bytes.writeUInt32LE(192_000, 28);
  bytes.writeUInt16LE(4, 32);
  bytes.writeUInt16LE(32, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(4, 40);
  bytes.writeFloatLE(0.25, 44);
  return bytes;
};

beforeAll(async () => {
  configuredProjectRoot = await mkdtemp(join(tmpdir(), "resona-render-audio-configured-"));
  const source = (await readFile(join(configuredProjectSourceRoot, "music.tsx"), "utf8")).replace(
    'from "../../index.js"',
    `from ${JSON.stringify(engineModulePath)}`,
  );
  await writeFile(join(configuredProjectRoot, "music.tsx"), source);
  await writeFile(
    join(configuredProjectRoot, "resona.config.ts"),
    `import { defineConfig } from ${JSON.stringify(engineModulePath)};
export default defineConfig({ entry: "music.tsx", staticDir: "assets", seed: "configured-seed" });
`,
  );
  await mkdir(join(configuredProjectRoot, "assets"), { recursive: true });
  await writeFile(join(configuredProjectRoot, "assets", "tone.wav"), wavBytes());
});

afterAll(async () => {
  await rm(configuredProjectRoot, { recursive: true, force: true });
});

const withSynthPlan = (
  job: CreateRenderJobResult,
  {
    maxVoices = 2,
    oscillator = "sine",
    attackFrames = 0,
    decayFrames = 0,
    sustain = 1,
    releaseFrames = 4,
    nominalDurationFrames = 16,
    events,
  }: Readonly<{
    maxVoices?: number;
    oscillator?: "saw" | "sine" | "square";
    attackFrames?: number;
    decayFrames?: number;
    sustain?: number;
    releaseFrames?: number;
    nominalDurationFrames?: number;
    events: CreateRenderJobResult["plan"]["events"];
  }>,
): CreateRenderJobResult => ({
  ...job,
  plan: {
    ...job.plan,
    nominalDurationFrames,
    masterProcessor: 1,
    processors: [
      {
        type: "poly-synth",
        maxVoices,
        oscillator,
        attackFrames,
        decayFrames,
        sustain,
        releaseFrames,
      },
      { type: "sum" },
    ],
    routes: [{ from: 0, to: 1 }],
    events,
  },
});

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
    expect(job.fingerprint).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("renders an audible variant from validated composition inputs", async () => {
    const defaultJob = await createRenderJob({
      projectRoot: exactProjectRoot,
      compositionId: "InputVariant",
    });
    const louderJob = await createRenderJob({
      projectRoot: exactProjectRoot,
      compositionId: "InputVariant",
      inputs: { intensity: 0.75 },
    });
    const repeatedLouderJob = await createRenderJob({
      projectRoot: exactProjectRoot,
      compositionId: "InputVariant",
      inputs: { intensity: 0.75 },
    });

    expect(defaultJob.variant.inputs).toEqual({
      intensity: 0.25,
      voice: { semitonesFromA4: 0 },
    });
    expect(louderJob.variant.inputs).toEqual({ intensity: 0.75, voice: { semitonesFromA4: 0 } });
    expect(Object.isFrozen(louderJob.variant.inputs)).toBe(true);
    expect(Object.isFrozen(louderJob.variant.inputs.voice)).toBe(true);
    expect(louderJob.project).toEqual(defaultJob.project);
    expect(repeatedLouderJob).toEqual(louderJob);
    expect(louderJob.fingerprint).not.toBe(defaultJob.fingerprint);
    expect(repeatedLouderJob.fingerprint).toBe(louderJob.fingerprint);

    const defaultAudio = renderAudio(defaultJob);
    const louderAudio = renderAudio(louderJob);
    const repeatedLouderAudio = renderAudio(repeatedLouderJob);
    const defaultAttack = defaultJob.plan.events.find((event) => event.type === "note-attack");
    const louderAttack = louderJob.plan.events.find((event) => event.type === "note-attack");

    expect(defaultAttack?.velocity).toBe(0.25);
    expect(louderAttack?.velocity).toBe(0.75);
    expect(defaultAudio.samples[2]).toBeGreaterThan(0);
    expect(louderAudio.samples[2]).toBeGreaterThan(defaultAudio.samples[2]! * 2.9);
    expect(louderAudio.samples[2]).toBeLessThan(defaultAudio.samples[2]! * 3.1);
    expect(repeatedLouderAudio.samples).toEqual(louderAudio.samples);
  });

  it("renders an AudioClip through preparation, planning, and the shared renderer", async () => {
    const job = await createRenderJob({
      projectRoot: configuredProjectRoot,
      compositionId: "AudioClip",
    });
    const rendered = renderAudio(job);
    expect(job.plan.resources).toHaveLength(1);
    expect(job.plan.audioRegions).toEqual([
      expect.objectContaining({
        resource: 0,
        startFrame: 0,
        durationFrames: 1,
        sourceOffsetFrame: 0,
      }),
    ]);
    expect(job.runtimeResources[0]?.samples).toEqual([Math.fround(0.25)]);
    expect(rendered.samples[0]).toBe(Math.fround(0.25));
    expect(rendered.samples[1]).toBe(Math.fround(0.25));
  });

  it("derives reproducible audio and fingerprints from an explicit seed", async () => {
    const first = await createRenderJob({
      projectRoot: configuredProjectRoot,
      compositionId: "Seeded",
      seed: "alpha",
    });
    const repeated = await createRenderJob({
      projectRoot: configuredProjectRoot,
      compositionId: "Seeded",
      seed: "alpha",
    });
    const changed = await createRenderJob({
      projectRoot: configuredProjectRoot,
      compositionId: "Seeded",
      seed: "beta",
    });

    expect(repeated.spec).toEqual(first.spec);
    expect(repeated.fingerprint).toBe(first.fingerprint);
    expect(renderAudio(repeated).samples).toEqual(renderAudio(first).samples);
    expect(changed.spec.seed).toEqual({ value: "beta", source: "invocation" });
    expect(changed.fingerprint).not.toBe(first.fingerprint);
    expect(renderAudio(changed).samples).not.toEqual(renderAudio(first).samples);
  });

  it("renders overlapping occurrences deterministically and ignores a stolen release", async () => {
    const base = await createRenderJob({
      projectRoot: exactProjectRoot,
      compositionId: "ExactNote",
    });
    const events: CreateRenderJobResult["plan"]["events"] = [
      {
        type: "note-attack",
        frame: 0,
        instrument: 0,
        occurrence: 0,
        semitonesFromA4: 0,
        velocity: 0.25,
      },
      {
        type: "note-attack",
        frame: 1,
        instrument: 0,
        occurrence: 1,
        semitonesFromA4: 12,
        velocity: 0.5,
      },
      {
        type: "note-attack",
        frame: 2,
        instrument: 0,
        occurrence: 2,
        semitonesFromA4: 24,
        velocity: 1,
      },
      { type: "note-release", frame: 3, instrument: 0, occurrence: 0 },
      { type: "note-release", frame: 6, instrument: 0, occurrence: 1 },
      { type: "note-release", frame: 7, instrument: 0, occurrence: 2 },
    ];
    const withStaleRelease = withSynthPlan(base, { events });
    const withoutStaleRelease = withSynthPlan(base, {
      events: events.filter((event) => event.occurrence !== 0 || event.type !== "note-release"),
    });

    const first = renderAudio(withStaleRelease, { blockFrames: 1 });
    const repeated = renderAudio(withStaleRelease, { blockFrames: 7 });
    const withoutStale = renderAudio(withoutStaleRelease, { blockFrames: 16 });

    expect(first.samples).toEqual(repeated.samples);
    expect(first.samples).toEqual(withoutStale.samples);
    expect(first.samples[2 * 2]).toBeGreaterThan(0);
    expect(first.diagnostics).toEqual([
      {
        code: "render.poly-synth-voice-stealing",
        phase: "render",
        severity: "warning",
        message: "PolySynth stole one voice while rendering.",
        compositionId: "ExactNote",
        cause: { instrument: 0, voiceSteals: 1 },
      },
    ]);
  });

  it("scales oscillator output linearly by velocity", async () => {
    const base = await createRenderJob({
      projectRoot: exactProjectRoot,
      compositionId: "ExactNote",
    });
    const noteAtVelocity = (velocity: number) =>
      withSynthPlan(base, {
        nominalDurationFrames: 4,
        events: [
          {
            type: "note-attack",
            frame: 0,
            instrument: 0,
            occurrence: 0,
            semitonesFromA4: 0,
            velocity,
          },
        ],
      });

    const quiet = renderAudio(noteAtVelocity(0.25));
    const loud = renderAudio(noteAtVelocity(0.5));

    expect(loud.samples[2]).toBe(Math.fround(quiet.samples[2]! * 2));
  });

  it("steals the releasing voice with the lowest instantaneous amplitude", async () => {
    const base = await createRenderJob({
      projectRoot: exactProjectRoot,
      compositionId: "ExactNote",
    });
    const target = withSynthPlan(base, {
      maxVoices: 3,
      events: [
        {
          type: "note-attack",
          frame: 0,
          instrument: 0,
          occurrence: 0,
          semitonesFromA4: 0,
          velocity: 1,
        },
        {
          type: "note-attack",
          frame: 0,
          instrument: 0,
          occurrence: 1,
          semitonesFromA4: 12,
          velocity: 0.8,
        },
        {
          type: "note-attack",
          frame: 0,
          instrument: 0,
          occurrence: 2,
          semitonesFromA4: 24,
          velocity: 0.2,
        },
        { type: "note-release", frame: 1, instrument: 0, occurrence: 1 },
        { type: "note-release", frame: 1, instrument: 0, occurrence: 2 },
        {
          type: "note-attack",
          frame: 2,
          instrument: 0,
          occurrence: 3,
          semitonesFromA4: -12,
          velocity: 0.6,
        },
      ],
    });
    const expectedAfterSteal = withSynthPlan(base, {
      maxVoices: 3,
      events: [
        {
          type: "note-attack",
          frame: 0,
          instrument: 0,
          occurrence: 0,
          semitonesFromA4: 0,
          velocity: 1,
        },
        {
          type: "note-attack",
          frame: 0,
          instrument: 0,
          occurrence: 1,
          semitonesFromA4: 12,
          velocity: 0.8,
        },
        { type: "note-release", frame: 1, instrument: 0, occurrence: 1 },
        {
          type: "note-attack",
          frame: 2,
          instrument: 0,
          occurrence: 3,
          semitonesFromA4: -12,
          velocity: 0.6,
        },
      ],
    });

    const actual = renderAudio(target);
    const expected = renderAudio(expectedAfterSteal);

    expect(actual.samples.slice(2 * 2)).toEqual(expected.samples.slice(2 * 2));
    expect(actual.diagnostics[0]?.cause.voiceSteals).toBe(1);
  });

  it("starts release from the instantaneous attack level", async () => {
    const base = await createRenderJob({
      projectRoot: exactProjectRoot,
      compositionId: "ExactNote",
    });
    const job = withSynthPlan(base, {
      maxVoices: 1,
      attackFrames: 4,
      releaseFrames: 2,
      nominalDurationFrames: 5,
      events: [
        {
          type: "note-attack",
          frame: 0,
          instrument: 0,
          occurrence: 0,
          semitonesFromA4: 0,
          velocity: 1,
        },
        { type: "note-release", frame: 2, instrument: 0, occurrence: 0 },
      ],
    });

    const rendered = renderAudio(job);
    const phaseDelta = 440 / 48_000;

    expect(rendered.samples[2 * 2]).toBe(Math.fround(Math.sin(Math.PI * 2 * phaseDelta * 2) * 0.5));
    expect(rendered.samples[3 * 2]).toBe(
      Math.fround(Math.sin(Math.PI * 2 * phaseDelta * 3) * 0.25),
    );
    expect(rendered.samples[4 * 2]).toBe(0);
  });

  it("keeps a zero-velocity voice occupied until its release envelope ends", async () => {
    const base = await createRenderJob({
      projectRoot: exactProjectRoot,
      compositionId: "ExactNote",
    });
    const job = withSynthPlan(base, {
      maxVoices: 1,
      releaseFrames: 4,
      events: [
        {
          type: "note-attack",
          frame: 0,
          instrument: 0,
          occurrence: 0,
          semitonesFromA4: 0,
          velocity: 0,
        },
        { type: "note-release", frame: 1, instrument: 0, occurrence: 0 },
        {
          type: "note-attack",
          frame: 2,
          instrument: 0,
          occurrence: 1,
          semitonesFromA4: 12,
          velocity: 1,
        },
      ],
    });

    const rendered = renderAudio(job);

    expect(rendered.diagnostics[0]?.cause.voiceSteals).toBe(1);
  });

  it.each(["sine", "saw", "square"] as const)(
    "renders a finite, bounded %s oscillator signal",
    async (oscillator) => {
      const base = await createRenderJob({
        projectRoot: exactProjectRoot,
        compositionId: "ExactNote",
      });
      const job = withSynthPlan(base, {
        oscillator,
        nominalDurationFrames: 64,
        events: [
          {
            type: "note-attack",
            frame: 0,
            instrument: 0,
            occurrence: 0,
            semitonesFromA4: 57,
            velocity: 1,
          },
        ],
      });

      const rendered = renderAudio(job);
      const mono = rendered.samples.filter((_, index) => index % 2 === 0);

      expect([...mono].every(Number.isFinite)).toBe(true);
      expect(Math.max(...mono.map(Math.abs))).toBeLessThanOrEqual(1);
      expect(mono[0]).toBe(0);
    },
  );
});
