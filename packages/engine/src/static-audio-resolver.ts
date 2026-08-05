import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

import { deepFreeze } from "./deep-freeze.js";
import type {
  PreparationResourceResolver,
  PreparedAudioMetadata,
  StaticAudioReference,
} from "./preparation.js";

const resolveReferencePath = (staticDirectory: string, reference: StaticAudioReference): string => {
  const prototype = Object.getPrototypeOf(reference);
  if (
    reference === null ||
    typeof reference !== "object" ||
    (prototype !== Object.prototype && prototype !== null) ||
    reference.type !== "resona/static-audio" ||
    reference.version !== 1 ||
    typeof reference.path !== "string" ||
    reference.path.length === 0 ||
    isAbsolute(reference.path) ||
    reference.path.startsWith("\\") ||
    /^[A-Za-z]:/.test(reference.path)
  ) {
    throw new Error("Static audio must be a versioned reference with a relative path.");
  }
  let depth = 0;
  for (const segment of reference.path.split(/[\\/]+/)) {
    if (segment === "..") {
      depth -= 1;
      if (depth < 0)
        throw new Error("Static audio paths must remain inside the configured static directory.");
    } else if (segment !== "" && segment !== ".") depth += 1;
  }
  const path = resolve(staticDirectory, reference.path.replaceAll("\\", "/"));
  const fromRoot = relative(staticDirectory, path);
  if (fromRoot === ".." || fromRoot.startsWith("../") || fromRoot.startsWith("..\\")) {
    throw new Error("Static audio paths must remain inside the configured static directory.");
  }
  return path;
};

const parseWavMetadata = (
  bytes: Buffer,
): Omit<PreparedAudioMetadata, "hash" | "samples"> & { dataOffset: number } => {
  if (
    bytes.length < 12 ||
    bytes.toString("ascii", 0, 4) !== "RIFF" ||
    bytes.toString("ascii", 8, 12) !== "WAVE"
  ) {
    throw new Error("Static audio must be a RIFF/WAVE file.");
  }
  if (bytes.readUInt32LE(4) + 8 > bytes.length) {
    throw new Error("Static audio contains a truncated RIFF payload.");
  }
  let format:
    | Readonly<{
        audioFormat: number;
        channels: number;
        sampleRate: number;
        blockAlign: number;
        bitsPerSample: number;
      }>
    | undefined;
  let dataLength: number | undefined;
  let dataOffset: number | undefined;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const id = bytes.toString("ascii", offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + size;
    if (end > bytes.length) throw new Error("Static audio contains a truncated WAV chunk.");
    if (id === "fmt " && size >= 16) {
      format = {
        audioFormat: bytes.readUInt16LE(start),
        channels: bytes.readUInt16LE(start + 2),
        sampleRate: bytes.readUInt32LE(start + 4),
        blockAlign: bytes.readUInt16LE(start + 12),
        bitsPerSample: bytes.readUInt16LE(start + 14),
      };
    }
    if (id === "data") {
      dataLength = size;
      dataOffset = start;
    }
    offset = end + (size % 2);
  }
  if (
    format === undefined ||
    dataLength === undefined ||
    format.audioFormat !== 3 ||
    (format.channels !== 1 && format.channels !== 2) ||
    format.sampleRate !== 48_000 ||
    format.bitsPerSample !== 32 ||
    format.blockAlign !== format.channels * 4 ||
    dataLength === 0 ||
    dataLength % format.blockAlign !== 0 ||
    dataOffset === undefined
  ) {
    throw new Error("Static audio must be mono or stereo 48 kHz IEEE float32 WAV.");
  }
  return {
    type: "wav",
    channels: format.channels,
    sampleRate: 48_000,
    frameCount: dataLength / format.blockAlign,
    dataOffset,
  };
};

export const createStaticAudioPreparationResolver = (
  staticDirectory: string,
  signal: AbortSignal,
): PreparationResourceResolver & {
  audio(
    reference: StaticAudioReference,
  ): Promise<PreparedAudioMetadata & { samples: readonly number[] }>;
} =>
  Object.freeze({
    audio: async (reference): Promise<PreparedAudioMetadata & { samples: readonly number[] }> => {
      if (signal.aborted) throw new Error("Composition preparation was cancelled.");
      const staticRoot = await realpath(staticDirectory);
      const candidatePath = await realpath(resolveReferencePath(staticRoot, reference));
      const candidateRelative = relative(staticRoot, candidatePath);
      if (
        candidateRelative === ".." ||
        candidateRelative.startsWith("../") ||
        candidateRelative.startsWith("..\\")
      ) {
        throw new Error("Static audio paths must remain inside the configured static directory.");
      }
      const bytes = await readFile(candidatePath, { signal });
      const metadata = parseWavMetadata(bytes);
      if (signal.aborted) throw new Error("Composition preparation was cancelled.");
      return deepFreeze({
        type: metadata.type,
        channels: metadata.channels,
        sampleRate: metadata.sampleRate,
        frameCount: metadata.frameCount,
        hash: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
        samples: Array.from({ length: metadata.frameCount * metadata.channels }, (_, index) => {
          const value = bytes.readFloatLE(metadata.dataOffset + index * 4);
          if (!Number.isFinite(value))
            throw new Error("Static audio contains a non-finite sample.");
          const canonical = Math.fround(value);
          return Object.is(canonical, -0) ? 0 : canonical;
        }),
      });
    },
  });
