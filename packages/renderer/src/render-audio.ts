import { ResonaError, type CreateRenderJobResult } from "@resona/engine";

import {
  createAudioEngine,
  type AudioEngineDiagnostic,
  type AudioRuntimeResource,
} from "./audio-engine.js";

export type RenderProgress =
  | Readonly<{
      phase: "render";
      completedFrames: number;
      totalFrames: number;
    }>
  | Readonly<{
      phase: "publish";
      completedBytes: number;
      totalBytes: number;
    }>;

export type RenderAudioOptions = Readonly<{
  blockFrames?: number;
  startFrame?: number;
  endFrame?: number;
  tailFrames?: number;
  signal?: AbortSignal;
  onProgress?: (progress: RenderProgress) => void;
}>;

export type RenderedAudio = Readonly<{
  wav: Uint8Array;
  samples: Float32Array;
  frames: number;
  sampleRate: number;
  channels: number;
  diagnostics: readonly RenderDiagnostic[];
}>;

export type RenderDiagnostic = AudioEngineDiagnostic;

const cancellationError = (compositionId: string): ResonaError =>
  new ResonaError("Audio rendering was cancelled.", [
    {
      code: "render.cancelled",
      phase: "render",
      severity: "error",
      message: "Audio rendering was cancelled.",
      compositionId,
    },
  ]);

const encodeWav = (samples: Float32Array, sampleRate: number, channels: number): Uint8Array => {
  const bytesPerSample = 4;
  const bytesPerFrame = channels * bytesPerSample;
  const dataBytes = samples.byteLength;
  const output = new Uint8Array(44 + dataBytes);
  const view = new DataView(output.buffer);
  const writeFourCc = (offset: number, value: string): void => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };
  writeFourCc(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeFourCc(8, "WAVE");
  writeFourCc(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 3, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerFrame, true);
  view.setUint16(32, bytesPerFrame, true);
  view.setUint16(34, 32, true);
  writeFourCc(36, "data");
  view.setUint32(40, dataBytes, true);
  new Float32Array(output.buffer, 44, samples.length).set(samples);
  return output;
};

const runtimeResources = (job: CreateRenderJobResult): readonly AudioRuntimeResource[] =>
  job.runtimeResources ?? [];

export const renderAudio = (
  job: CreateRenderJobResult,
  {
    blockFrames = 128,
    startFrame = 0,
    endFrame = job.plan.nominalDurationFrames,
    tailFrames = 0,
    signal,
    onProgress,
  }: RenderAudioOptions = {},
): RenderedAudio => {
  if (signal?.aborted === true) throw cancellationError(job.plan.compositionId);
  if (!Number.isSafeInteger(blockFrames) || blockFrames <= 0) {
    throw new RangeError("blockFrames must be a positive safe integer.");
  }
  if (
    !Number.isSafeInteger(startFrame) ||
    !Number.isSafeInteger(endFrame) ||
    !Number.isSafeInteger(tailFrames) ||
    startFrame < 0 ||
    endFrame <= startFrame ||
    endFrame > job.plan.nominalDurationFrames ||
    tailFrames < 0 ||
    !Number.isSafeInteger(endFrame + tailFrames) ||
    !Number.isSafeInteger(endFrame - startFrame + tailFrames)
  ) {
    throw new RangeError(
      "Render range must be a finite half-open interval with a non-negative tail.",
    );
  }

  const engine = createAudioEngine(job.plan, runtimeResources(job));
  const processEnd = endFrame + tailFrames;
  const outputFrames = endFrame - startFrame + tailFrames;
  const samples = new Float32Array(outputFrames * job.plan.channels);
  const reportProgress = (completedFrames: number): void => {
    onProgress?.({ phase: "render", completedFrames, totalFrames: processEnd });
    if (signal?.aborted === true) throw cancellationError(job.plan.compositionId);
  };
  reportProgress(0);
  if (startFrame > 0) {
    engine.seek(startFrame);
    reportProgress(startFrame);
  }
  let completedFrames = startFrame;
  while (completedFrames < processEnd) {
    const frames = Math.min(blockFrames, processEnd - completedFrames);
    const outputOffset = (completedFrames - startFrame) * job.plan.channels;
    engine.process(samples.subarray(outputOffset), frames);
    completedFrames += frames;
    reportProgress(completedFrames);
  }

  const diagnostics = Object.freeze([...engine.diagnostics()]);
  return Object.freeze({
    wav: encodeWav(samples, job.plan.sampleRate, job.plan.channels),
    samples,
    frames: outputFrames,
    sampleRate: job.plan.sampleRate,
    channels: job.plan.channels,
    diagnostics,
  });
};
