import { mkdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createRenderJob } from "../../engine/src/index.js";
import { renderAudio } from "./index.js";

const referenceProjectRoot = fileURLToPath(
  new URL("../../engine/src/fixtures/reference-project/", import.meta.url),
);
const referencePublicDirectory = fileURLToPath(
  new URL("../../engine/src/fixtures/reference-project/public/", import.meta.url),
);
const referenceAudioPath = fileURLToPath(
  new URL("../../engine/src/fixtures/reference-project/public/reference.wav", import.meta.url),
);

const wavBytes = (): Buffer => {
  const samples = [0.125, -0.25, 0.375, -0.5];
  const bytes = Buffer.alloc(44 + samples.length * 4);
  bytes.write("RIFF", 0);
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(3, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(48_000, 24);
  bytes.writeUInt32LE(48_000 * 4, 28);
  bytes.writeUInt16LE(4, 32);
  bytes.writeUInt16LE(32, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(samples.length * 4, 40);
  samples.forEach((sample, index) => bytes.writeFloatLE(sample, 44 + index * 4));
  return bytes;
};

beforeAll(async () => {
  await mkdir(referencePublicDirectory, { recursive: true });
  await writeFile(referenceAudioPath, wavBytes());
});

afterAll(async () => {
  await rm(referenceAudioPath, { force: true });
  await rm(referencePublicDirectory, { recursive: true, force: true });
});

describe("reference composition", () => {
  it("compiles audio, normalized MIDI, effects, automation, and inputs into a deterministic render", async () => {
    const job = await createRenderJob({
      projectRoot: referenceProjectRoot,
      compositionId: "Reference",
    });
    const repeated = await createRenderJob({
      projectRoot: referenceProjectRoot,
      compositionId: "Reference",
    });
    const changed = await createRenderJob({
      projectRoot: referenceProjectRoot,
      compositionId: "Reference",
      inputs: { mix: 1 },
    });

    expect(job.variant.inputs).toEqual({ mix: 0.5 });
    expect(job.composition.root.children.map((child) => child.type)).toEqual([
      "audio-track",
      "instrument-track",
    ]);
    expect(job.plan.resources).toHaveLength(1);
    expect(job.plan.audioRegions).toEqual([
      expect.objectContaining({
        resource: 0,
        destination: 0,
        startFrame: 0,
        durationFrames: 4,
        sourceOffsetFrame: 0,
      }),
    ]);
    expect(job.plan.events).toHaveLength(4);
    expect(
      job.plan.events.every(
        (event) => event.type === "note-attack" || event.type === "note-release",
      ),
    ).toBe(true);
    expect(JSON.stringify({ composition: job.composition, plan: job.plan })).not.toMatch(
      /note-(?:on|off)/,
    );

    const processorTypes = job.plan.processors.map((processor) => processor.type);
    const gainIndex = processorTypes.indexOf("gain");
    const delayIndex = processorTypes.indexOf("delay");
    expect(gainIndex).toBeGreaterThanOrEqual(0);
    expect(delayIndex).toBeGreaterThan(gainIndex);
    expect(job.plan.automation).toEqual([
      expect.objectContaining({
        type: "gain",
        target: gainIndex,
        points: [
          expect.objectContaining({ frame: 0, value: Math.fround(0.5) }),
          expect.objectContaining({ frame: 24_000, value: Math.fround(0.375) }),
        ],
      }),
    ]);
    expect(job.plan.masterProcessor).toBe(processorTypes.lastIndexOf("sum"));
    expect(job.plan.routes.filter((route) => route.to === job.plan.masterProcessor)).toHaveLength(
      2,
    );

    const rendered = renderAudio(job);
    const repeatedRendered = renderAudio(repeated);
    const changedRendered = renderAudio(changed);
    expect(repeated).toEqual(job);
    expect(repeatedRendered.samples).toEqual(rendered.samples);
    expect(repeatedRendered.wav).toEqual(rendered.wav);
    expect(changed.fingerprint).not.toBe(job.fingerprint);
    expect(changedRendered.samples).not.toEqual(rendered.samples);
    expect(rendered.channels).toBe(2);
    const peak = rendered.samples.reduce(
      (maximum, sample) => Math.max(maximum, Math.abs(sample)),
      0,
    );
    expect(peak).toBeLessThan(1);
  }, 15_000);
});
