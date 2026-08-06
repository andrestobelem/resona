import { describe, expect, it } from "vitest";

import {
  createResonaAudioWorkletProcessor,
  type AudioWorkletCommand,
  type AudioWorkletEvent,
  type AudioWorkletPortLike,
} from "./audio-worklet.js";
import { renderAudio } from "./render-audio.js";

const plan = {
  format: "resona/execution-plan" as const,
  schemaVersion: 1 as const,
  compositionId: "worklet-test",
  sampleRate: 48_000 as const,
  channels: 2 as const,
  nominalDurationFrames: 4,
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
  ],
  automation: [],
};

const stereoResource = {
  type: "wav" as const,
  hash: `sha256:${"b".repeat(64)}` as `sha256:${string}`,
  channels: 2 as const,
  sampleRate: 48_000 as const,
  frameCount: 4,
};

const stereoPlan = {
  ...plan,
  compositionId: "worklet-stereo-test",
  processors: [{ type: "sum" as const }, { type: "sum" as const }],
  routes: [{ from: 0, to: 1 }],
  resources: [stereoResource],
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
  events: [],
};

class FakePort implements AudioWorkletPortLike {
  public onmessage: AudioWorkletPortLike["onmessage"] = null;
  public readonly messages: unknown[] = [];
  public readonly transfers: Array<ArrayBuffer[]> = [];

  public postMessage(message: unknown, transfer?: readonly ArrayBuffer[]): void {
    this.messages.push(message);
    this.transfers.push(transfer === undefined ? [] : [...transfer]);
  }

  public send(command: AudioWorkletCommand): void {
    this.onmessage?.({ data: command });
  }
}

class FakeBase {
  public readonly port = new FakePort();
}

describe("Resona AudioWorklet adapter", () => {
  it("loads structured-clone plans, renders into planar output, and reports readiness/cursor", () => {
    const Processor = createResonaAudioWorkletProcessor(FakeBase);
    const processor = new Processor();
    const port = processor.port as FakePort;
    port.send({ type: "load", plan, resources: [] });
    expect(port.messages).toContainEqual({
      type: "ready",
      sampleRate: 48_000,
      channels: 2,
      nominalDurationFrames: 4,
    } satisfies AudioWorkletEvent);

    port.send({ type: "play" });
    const left = new Float32Array(4);
    const right = new Float32Array(4);
    expect(processor.process([], [[left, right]])).toBe(true);
    expect(left[1]).toBeGreaterThan(0);
    expect(Array.from(left)).toEqual(Array.from(right));
    expect(port.messages).toContainEqual({ type: "ended", cursorFrame: 4 });

    port.send({ type: "pause" });
    left.fill(1);
    right.fill(1);
    processor.process([], [[left, right]]);
    expect(Array.from(left)).toEqual([0, 0, 0, 0]);
    expect(Array.from(right)).toEqual([0, 0, 0, 0]);
  });

  it("keeps the Worklet adapter sample-compatible with the offline renderer", () => {
    const rendered = renderAudio({ plan, runtimeResources: [] } as never);
    const Processor = createResonaAudioWorkletProcessor(FakeBase);
    const processor = new Processor();
    const port = processor.port as FakePort;
    port.send({ type: "load", plan, resources: [] });
    port.send({ type: "play" });
    const left = new Float32Array(4);
    const right = new Float32Array(4);
    processor.process([], [[left, right]]);
    expect(Array.from(left)).toEqual(
      Array.from(rendered.samples).filter((_, index) => index % 2 === 0),
    );
    expect(Array.from(right)).toEqual(
      Array.from(rendered.samples).filter((_, index) => index % 2 === 1),
    );

    const samples = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]);
    const resource = { ...stereoResource, samples };
    const renderedResource = renderAudio({
      plan: stereoPlan,
      runtimeResources: [{ ...resource, sourcePaths: [] }],
    } as never);
    const resourceProcessor = new (createResonaAudioWorkletProcessor(FakeBase))();
    const resourcePort = resourceProcessor.port as FakePort;
    resourcePort.send({ type: "load", plan: stereoPlan, resources: [resource] });
    resourcePort.send({ type: "play" });
    const resourceLeft = new Float32Array(4);
    const resourceRight = new Float32Array(4);
    resourceProcessor.process([], [[resourceLeft, resourceRight]]);
    expect(Array.from(resourceLeft)).toEqual(
      Array.from(renderedResource.samples).filter((_, index) => index % 2 === 0),
    );
    expect(Array.from(resourceRight)).toEqual(
      Array.from(renderedResource.samples).filter((_, index) => index % 2 === 1),
    );
  });

  it("reports a DSP validation error instead of terminating on invalid samples", () => {
    const Processor = createResonaAudioWorkletProcessor(FakeBase);
    const processor = new Processor();
    const port = processor.port as FakePort;
    port.send({
      type: "load",
      plan: {
        ...plan,
        events: [{ ...plan.events[0], semitonesFromA4: Number.NaN }],
      } as never,
      resources: [],
    });
    expect(port.messages).toContainEqual({
      type: "error",
      message: "Audio note events contain invalid pitch or velocity.",
    } satisfies AudioWorkletEvent);
    const left = new Float32Array(4);
    const right = new Float32Array(4);
    processor.process([], [[left, right]]);
    expect(Array.from(left)).toEqual([0, 0, 0, 0]);

    const resourceProcessor = new (createResonaAudioWorkletProcessor(FakeBase))();
    const resourcePort = resourceProcessor.port as FakePort;
    resourcePort.send({
      type: "load",
      plan: stereoPlan,
      resources: [
        { ...stereoResource, samples: new Float32Array([0, Number.NaN, 0, 0, 0, 0, 0, 0]) },
      ],
    });
    expect(resourcePort.messages).toContainEqual({
      type: "error",
      message: "The audio resource contains a non-finite sample.",
    } satisfies AudioWorkletEvent);
  });

  it("reports invalid commands without touching the audio callback", () => {
    const Processor = createResonaAudioWorkletProcessor(FakeBase);
    const processor = new Processor();
    const port = processor.port as FakePort;
    port.onmessage?.({ data: { type: "unknown" } });
    expect(port.messages).toContainEqual({
      type: "error",
      message: "Invalid AudioWorklet command.",
    } satisfies AudioWorkletEvent);
  });
});
