import { createAudioEngine, type AudioEngine, type AudioRuntimeResource } from "./audio-engine.js";
import type { ExecutionPlan } from "@resona/engine";

export type AudioWorkletResource = AudioRuntimeResource & Readonly<{ samples: Float32Array }>;

export type AudioWorkletCommand =
  | Readonly<{
      type: "load";
      plan: Parameters<typeof createAudioEngine>[0];
      resources: readonly AudioWorkletResource[];
    }>
  | Readonly<{ type: "play" }>
  | Readonly<{ type: "pause" }>
  | Readonly<{ type: "loop"; enabled: boolean }>
  | Readonly<{ type: "seek"; frame: number }>;

export type AudioWorkletEvent =
  | Readonly<{
      type: "ready";
      sampleRate: 48_000;
      channels: 2;
      nominalDurationFrames: number;
    }>
  | Readonly<{ type: "snapshot"; cursorFrame: number }>
  | Readonly<{ type: "meter"; levels: readonly number[] }>
  | Readonly<{ type: "ended"; cursorFrame: number }>
  | Readonly<{
      type: "underrun";
      cursorFrame: number;
      diagnostic: Readonly<{
        code: "audio.underrun";
        phase: "render";
        severity: "error";
        message: string;
        compositionId: string;
        cause: Readonly<{ requestedFrames: number; producedFrames: number }>;
      }>;
    }>
  | Readonly<{ type: "error"; message: string }>;

export type AudioWorkletPortLike = {
  onmessage: ((event: Readonly<{ data: unknown }>) => void) | null;
  postMessage(message: unknown, transfer?: readonly ArrayBuffer[]): void;
};

export type AudioWorkletProcessorInstance = Readonly<{
  port: AudioWorkletPortLike;
  process(inputs: readonly Float32Array[][], outputs: Float32Array[][]): boolean;
}>;

export type AudioWorkletProcessorConstructor = new () => AudioWorkletProcessorInstance;

const quantumFrames = 128;

type AudioEngineFactory = (
  plan: Parameters<typeof createAudioEngine>[0],
  resources: readonly AudioRuntimeResource[],
) => AudioEngine;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const asCommand = (value: unknown): AudioWorkletCommand | undefined => {
  if (!isRecord(value) || typeof value.type !== "string") return undefined;
  if (value.type === "play" || value.type === "pause") return { type: value.type };
  if (value.type === "loop" && typeof value.enabled === "boolean") {
    return { type: "loop", enabled: value.enabled };
  }
  if (
    value.type === "seek" &&
    typeof value.frame === "number" &&
    Number.isSafeInteger(value.frame) &&
    value.frame >= 0
  ) {
    return { type: "seek", frame: value.frame };
  }
  if (value.type !== "load" || !isRecord(value.plan) || !Array.isArray(value.resources)) {
    return undefined;
  }
  const resources = value.resources.filter(
    (resource): resource is AudioWorkletResource =>
      isRecord(resource) && resource.samples instanceof Float32Array,
  );
  if (resources.length !== value.resources.length) return undefined;
  return {
    type: "load",
    plan: value.plan as ExecutionPlan,
    resources,
  };
};

export const createResonaAudioWorkletProcessor = (
  Base: new () => { port: AudioWorkletPortLike },
  createEngine: AudioEngineFactory = createAudioEngine,
): AudioWorkletProcessorConstructor => {
  return class ResonaAudioWorkletProcessor extends Base {
    private engine: AudioEngine | undefined;
    private compositionId = "";
    private nominalDurationFrames = Number.POSITIVE_INFINITY;
    private playing = false;
    private looping = false;
    private readonly interleaved = new Float32Array(quantumFrames * 2);
    private readonly snapshotMessage = { type: "snapshot" as const, cursorFrame: 0 };
    private readonly endedMessage = { type: "ended" as const, cursorFrame: 0 };

    public constructor() {
      super();
      this.port.onmessage = (event) => {
        const command = asCommand(event.data);
        if (command === undefined) {
          this.port.postMessage({ type: "error", message: "Invalid AudioWorklet command." });
          return;
        }
        try {
          if (command.type === "load") {
            this.engine = createEngine(command.plan, command.resources);
            this.compositionId = command.plan.compositionId;
            this.nominalDurationFrames = command.plan.nominalDurationFrames;
            this.playing = false;
            this.looping = false;
            this.port.postMessage({
              type: "ready",
              sampleRate: 48_000,
              channels: 2,
              nominalDurationFrames: command.plan.nominalDurationFrames,
            } satisfies AudioWorkletEvent);
          } else if (command.type === "play") {
            if (this.engine === undefined) throw new Error("AudioWorklet is not ready.");
            this.playing = true;
          } else if (command.type === "pause") {
            this.playing = false;
          } else if (command.type === "loop") {
            if (this.engine === undefined) throw new Error("AudioWorklet is not ready.");
            this.looping = command.enabled;
          } else {
            if (this.engine === undefined) throw new Error("AudioWorklet is not ready.");
            this.engine.seek(command.frame);
            this.playing = false;
            this.snapshotMessage.cursorFrame = this.engine.cursorFrame;
            this.port.postMessage(this.snapshotMessage satisfies AudioWorkletEvent);
          }
        } catch (error) {
          this.playing = false;
          this.port.postMessage({
            type: "error",
            message: error instanceof Error ? error.message : "AudioWorklet command failed.",
          } satisfies AudioWorkletEvent);
        }
      };
    }

    public process(_inputs: readonly Float32Array[][], outputs: Float32Array[][]): boolean {
      const output = outputs[0];
      if (output === undefined || output.length !== 2) {
        this.playing = false;
        this.port.postMessage({
          type: "error",
          message: "AudioWorklet requires exactly two output channels.",
        } satisfies AudioWorkletEvent);
        return true;
      }
      const left = output[0];
      const right = output[1];
      if (left === undefined || right === undefined) return true;
      left.fill(0);
      right.fill(0);
      if (!this.playing || this.engine === undefined) return true;
      if (left.length > quantumFrames || right.length !== left.length) {
        this.playing = false;
        this.port.postMessage({
          type: "error",
          message: "AudioWorklet quantum is larger than the supported block size.",
        } satisfies AudioWorkletEvent);
        return true;
      }
      try {
        let outputFrame = 0;
        while (outputFrame < left.length) {
          if (this.engine.cursorFrame >= this.nominalDurationFrames) {
            if (!this.looping) break;
            this.engine.seek(0);
            this.snapshotMessage.cursorFrame = 0;
            this.port.postMessage(this.snapshotMessage satisfies AudioWorkletEvent);
          }
          const remaining = Math.max(0, this.nominalDurationFrames - this.engine.cursorFrame);
          const frames = Math.min(left.length - outputFrame, remaining);
          if (frames <= 0) break;
          const produced = this.engine.process(this.interleaved, frames);
          if (produced !== frames) {
            this.playing = false;
            this.port.postMessage({
              type: "underrun",
              cursorFrame: this.engine.cursorFrame,
              diagnostic: {
                code: "audio.underrun",
                phase: "render",
                severity: "error",
                message: "AudioWorklet could not produce the requested audio quantum.",
                compositionId: this.compositionId,
                cause: { requestedFrames: frames, producedFrames: produced },
              },
            } satisfies AudioWorkletEvent);
            return true;
          }
          for (let frame = 0; frame < frames; frame += 1) {
            left[outputFrame + frame] = this.interleaved[frame * 2] ?? 0;
            right[outputFrame + frame] = this.interleaved[frame * 2 + 1] ?? 0;
          }
          outputFrame += frames;
        }
      } catch (error) {
        this.playing = false;
        this.port.postMessage({
          type: "error",
          message: error instanceof Error ? error.message : "AudioWorklet processing failed.",
        } satisfies AudioWorkletEvent);
        return true;
      }
      this.snapshotMessage.cursorFrame = this.engine.cursorFrame;
      this.port.postMessage(this.snapshotMessage satisfies AudioWorkletEvent);
      this.port.postMessage({
        type: "meter",
        levels: Array.from(this.engine.meters()),
      } satisfies AudioWorkletEvent);
      if (!this.looping && this.engine.cursorFrame >= this.nominalDurationFrames) {
        this.playing = false;
        this.endedMessage.cursorFrame = this.engine.cursorFrame;
        this.port.postMessage(this.endedMessage satisfies AudioWorkletEvent);
      }
      return true;
    }
  };
};

export const installResonaAudioWorklet = (
  register: (name: string, processor: AudioWorkletProcessorConstructor) => void,
  Base: new () => { port: AudioWorkletPortLike },
): void => {
  register("resona-audio", createResonaAudioWorkletProcessor(Base));
};

declare const AudioWorkletProcessor: new () => { port: AudioWorkletPortLike };
declare const registerProcessor: (
  name: string,
  processor: AudioWorkletProcessorConstructor,
) => void;

if (typeof registerProcessor === "function" && typeof AudioWorkletProcessor !== "undefined") {
  installResonaAudioWorklet(registerProcessor, AudioWorkletProcessor);
}
