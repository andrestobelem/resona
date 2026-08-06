import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createRenderJob, type CreateRenderJobResult } from "@resona/engine";

import {
  createResonaAudioWorkletProcessor,
  type AudioWorkletCommand,
  type AudioWorkletPortLike,
} from "./audio-worklet.js";
import { renderAudio } from "./render-audio.js";

const fixtureSource = fileURLToPath(
  new URL("../../engine/src/fixtures/reference-project/src/index.tsx", import.meta.url),
);
const engineModulePath = fileURLToPath(new URL("../../engine/dist/index.js", import.meta.url));
let projectRoot: string;

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
  projectRoot = await mkdtemp(join(tmpdir(), "resona-studio-parity-"));
  await mkdir(join(projectRoot, "src"), { recursive: true });
  await mkdir(join(projectRoot, "public"), { recursive: true });
  const source = (await readFile(fixtureSource, "utf8")).replace(
    'from "../../../index.js"',
    `from ${JSON.stringify(engineModulePath)}`,
  );
  await writeFile(join(projectRoot, "src", "index.tsx"), source);
  await writeFile(
    join(projectRoot, "resona.config.ts"),
    `import { defineConfig } from ${JSON.stringify(engineModulePath)};
export default defineConfig({ entry: "src/index.tsx", staticDir: "public", seed: "reference-seed" });
`,
  );
  await writeFile(join(projectRoot, "public", "reference.wav"), wavBytes());
});

afterAll(async () => {
  await rm(projectRoot, { recursive: true, force: true });
});

class FakePort implements AudioWorkletPortLike {
  public onmessage: AudioWorkletPortLike["onmessage"] = null;
  public readonly messages: unknown[] = [];

  public postMessage(message: unknown): void {
    this.messages.push(message);
  }

  public send(command: AudioWorkletCommand): void {
    this.onmessage?.({ data: command });
  }
}

class FakeBase {
  public readonly port = new FakePort();
}

const workletSamples = (
  job: CreateRenderJobResult,
  {
    frameCount,
    loop = false,
    startFrame = 0,
  }: Readonly<{
    frameCount: number;
    loop?: boolean;
    startFrame?: number;
  }>,
): { samples: Float32Array; messages: readonly unknown[] } => {
  const Processor = createResonaAudioWorkletProcessor(FakeBase);
  const processor = new Processor();
  const port = processor.port as FakePort;
  const resources = job.runtimeResources.map((resource) => ({
    ...resource,
    samples: Float32Array.from(resource.samples),
  }));
  port.send({ type: "load", plan: job.plan, resources });
  if (startFrame > 0) port.send({ type: "seek", frame: startFrame });
  port.send({ type: "loop", enabled: loop });
  port.send({ type: "play" });
  const samples = new Float32Array(frameCount * job.plan.channels);
  let completedFrames = 0;
  while (completedFrames < frameCount) {
    const frames = Math.min(128, frameCount - completedFrames);
    const left = new Float32Array(frames);
    const right = new Float32Array(frames);
    processor.process([], [[left, right]]);
    for (let frame = 0; frame < frames; frame += 1) {
      samples[(completedFrames + frame) * 2] = left[frame] ?? 0;
      samples[(completedFrames + frame) * 2 + 1] = right[frame] ?? 0;
    }
    completedFrames += frames;
  }
  return { samples, messages: port.messages };
};

const expectParity = (expected: Float32Array, actual: Float32Array): void => {
  expect(actual.length).toBe(expected.length);
  let maximumAbsoluteDifference = 0;
  let squaredDifference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    const expectedSample = expected[index] ?? 0;
    const actualSample = actual[index] ?? 0;
    expect(Number.isFinite(expectedSample)).toBe(true);
    expect(Number.isFinite(actualSample)).toBe(true);
    const difference = actualSample - expectedSample;
    maximumAbsoluteDifference = Math.max(maximumAbsoluteDifference, Math.abs(difference));
    squaredDifference += difference * difference;
  }
  expect(maximumAbsoluteDifference).toBeLessThanOrEqual(1e-5);
  expect(Math.sqrt(squaredDifference / Math.max(1, expected.length))).toBeLessThanOrEqual(1e-6);
};

describe("Studio and Node render parity", () => {
  it("keeps the AudioWorklet preview within the pre-encoder parity budget", async () => {
    const job = await createRenderJob({
      projectRoot,
      compositionId: "Reference",
      inputs: { mix: 0.75 },
    });
    expect(job.variant.inputs).toEqual({ mix: 0.75 });
    expect(job.plan.audioRegions).toEqual([
      expect.objectContaining({ durationFrames: 4, destination: 0 }),
    ]);
    expect(job.plan.events).toHaveLength(4);
    expect(job.plan.processors.map((processor) => processor.type)).toEqual(
      expect.arrayContaining(["poly-synth", "gain", "delay"]),
    );
    expect(job.plan.automation).toHaveLength(1);

    const offline = renderAudio(job);
    const preview = workletSamples(job, { frameCount: offline.frames });
    expectParity(offline.samples, preview.samples);
    expect(preview.messages).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "error" })]),
    );

    const seekStart = 24_000;
    const seekFrames = 4_096;
    const offlineSeek = renderAudio(job, {
      startFrame: seekStart,
      endFrame: seekStart + seekFrames,
      blockFrames: 257,
    });
    const previewSeek = workletSamples(job, {
      startFrame: seekStart,
      frameCount: seekFrames,
    });
    expectParity(offlineSeek.samples, previewSeek.samples);

    const previewLoop = workletSamples(job, {
      frameCount: offline.frames * 2,
      loop: true,
    });
    expectParity(offline.samples, previewLoop.samples.slice(0, offline.samples.length));
    expectParity(offline.samples, previewLoop.samples.slice(offline.samples.length));
  }, 30_000);
});
