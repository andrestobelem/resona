import { randomUUID } from "node:crypto";
import { open, link, lstat, readFile, rename, rm, unlink } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

import { ResonaError, type CreateRenderJobResult } from "@resona/engine";

import {
  renderAudio,
  type RenderAudioOptions,
  type RenderedAudio,
  type RenderProgress,
} from "./render-audio.js";

export type RenderAudioToFileOptions = RenderAudioOptions &
  Readonly<{
    outputPath: string;
    overwrite?: boolean;
  }>;

export type PublishedAudio = Readonly<{
  outputPath: string;
  bytes: number;
  frames: number;
  sampleRate: number;
  channels: number;
  diagnostics: RenderedAudio["diagnostics"];
}>;

const exists = async (path: string): Promise<boolean> => {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
};

const publicationError = (compositionId: string, code: string, message: string): ResonaError =>
  new ResonaError(message, [
    {
      code,
      phase: "render",
      severity: "error",
      message,
      compositionId,
    },
  ]);

const cancellationError = (compositionId: string): ResonaError =>
  publicationError(compositionId, "render.cancelled", "Audio rendering was cancelled.");

const validateWav = (
  bytes: Uint8Array,
  rendered: Pick<RenderedAudio, "frames" | "sampleRate" | "channels">,
  compositionId: string,
): void => {
  const invalid = (message: string): ResonaError =>
    publicationError(compositionId, "render.wav-invalid", message);
  if (bytes.byteLength < 44) throw invalid("Rendered WAV is shorter than its header.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const fourCc = (offset: number): string =>
    String.fromCharCode(
      view.getUint8(offset),
      view.getUint8(offset + 1),
      view.getUint8(offset + 2),
      view.getUint8(offset + 3),
    );
  const dataBytes = view.getUint32(40, true);
  if (
    fourCc(0) !== "RIFF" ||
    fourCc(8) !== "WAVE" ||
    fourCc(12) !== "fmt " ||
    fourCc(36) !== "data" ||
    view.getUint32(4, true) !== bytes.byteLength - 8 ||
    dataBytes !== bytes.byteLength - 44 ||
    view.getUint32(16, true) !== 16 ||
    view.getUint16(20, true) !== 3 ||
    view.getUint16(22, true) !== rendered.channels ||
    view.getUint32(24, true) !== rendered.sampleRate ||
    view.getUint32(28, true) !== rendered.sampleRate * rendered.channels * 4 ||
    view.getUint16(32, true) !== rendered.channels * 4 ||
    view.getUint16(34, true) !== 32 ||
    dataBytes !== rendered.frames * rendered.channels * 4
  ) {
    throw invalid("Rendered WAV header or payload dimensions are invalid.");
  }
  for (let offset = 44; offset < bytes.byteLength; offset += 4) {
    if (!Number.isFinite(view.getFloat32(offset, true))) {
      throw invalid("Rendered WAV contains a non-finite sample.");
    }
  }
};

const writeAndSync = async (path: string, bytes: Uint8Array): Promise<void> => {
  const handle = await open(path, "wx");
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
};

const removeIfPresent = async (path: string | undefined): Promise<void> => {
  if (path === undefined) return;
  await rm(path, { force: true }).catch(() => undefined);
};

const outputExistsError = (compositionId: string): ResonaError =>
  publicationError(
    compositionId,
    "render.output-exists",
    "Render output already exists; pass overwrite: true to replace it.",
  );

export const renderAudioToFile = async (
  job: CreateRenderJobResult,
  {
    outputPath: requestedOutputPath,
    overwrite = false,
    signal,
    onProgress,
    ...renderOptions
  }: RenderAudioToFileOptions,
): Promise<PublishedAudio> => {
  const outputPath = resolve(requestedOutputPath);
  const compositionId = job.plan.compositionId;
  const shouldOverwrite = overwrite === true;
  const isAborted = (): boolean => signal?.aborted === true;
  if (isAborted()) throw cancellationError(compositionId);

  const temporaryPath = `${joinTempPath(outputPath)}.${randomUUID()}.tmp`;
  try {
    if (!shouldOverwrite && (await exists(outputPath))) throw outputExistsError(compositionId);
    const rendered = renderAudio(job, {
      ...renderOptions,
      ...(signal === undefined ? {} : { signal }),
      ...(onProgress === undefined ? {} : { onProgress }),
    });
    validateWav(rendered.wav, rendered, compositionId);
    await writeAndSync(temporaryPath, rendered.wav);
    const persisted = await readFile(temporaryPath);
    validateWav(persisted, rendered, compositionId);
    if (isAborted()) throw cancellationError(compositionId);
    if (!shouldOverwrite && (await exists(outputPath))) throw outputExistsError(compositionId);
    onProgress?.({
      phase: "publish",
      completedBytes: persisted.byteLength,
      totalBytes: persisted.byteLength,
    });
    if (isAborted()) throw cancellationError(compositionId);
    if (shouldOverwrite) {
      await rename(temporaryPath, outputPath);
    } else {
      try {
        await link(temporaryPath, outputPath);
      } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "EEXIST") {
          throw outputExistsError(compositionId);
        }
        throw error;
      }
      await unlink(temporaryPath).catch(() => undefined);
    }
    return Object.freeze({
      outputPath,
      bytes: persisted.byteLength,
      frames: rendered.frames,
      sampleRate: rendered.sampleRate,
      channels: rendered.channels,
      diagnostics: rendered.diagnostics,
    });
  } catch (error) {
    await removeIfPresent(temporaryPath);
    if (error instanceof ResonaError) throw error;
    if (error instanceof Error) {
      throw publicationError(compositionId, "render.failed", error.message);
    }
    throw error;
  }
};

const joinTempPath = (outputPath: string): string =>
  join(dirname(outputPath), `.${basename(outputPath)}.resona`);

export type { RenderProgress };
