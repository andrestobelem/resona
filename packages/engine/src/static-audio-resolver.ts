import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
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
    isAbsolute(reference.path)
  ) {
    throw new Error("Static audio must be a versioned reference with a relative path.");
  }
  const path = resolve(staticDirectory, reference.path);
  const fromRoot = relative(staticDirectory, path);
  if (fromRoot === ".." || fromRoot.startsWith("../") || fromRoot.startsWith("..\\")) {
    throw new Error("Static audio paths must remain inside the configured static directory.");
  }
  return path;
};

const parseWavMetadata = (bytes: Buffer): Omit<PreparedAudioMetadata, "hash"> => {
  if (
    bytes.length < 12 ||
    bytes.toString("ascii", 0, 4) !== "RIFF" ||
    bytes.toString("ascii", 8, 12) !== "WAVE"
  ) {
    throw new Error("Static audio must be a RIFF/WAVE file.");
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
    if (id === "data") dataLength = size;
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
    dataLength % format.blockAlign !== 0
  ) {
    throw new Error("Static audio must be mono or stereo 48 kHz IEEE float32 WAV.");
  }
  return {
    type: "wav",
    channels: format.channels,
    sampleRate: 48_000,
    frameCount: dataLength / format.blockAlign,
  };
};

export const createStaticAudioPreparationResolver = (
  staticDirectory: string,
  signal: AbortSignal,
): PreparationResourceResolver =>
  Object.freeze({
    audio: async (reference): Promise<PreparedAudioMetadata> => {
      if (signal.aborted) throw new Error("Composition preparation was cancelled.");
      const bytes = await readFile(resolveReferencePath(staticDirectory, reference), { signal });
      const metadata = parseWavMetadata(bytes);
      if (signal.aborted) throw new Error("Composition preparation was cancelled.");
      return deepFreeze({
        ...metadata,
        hash: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
      });
    },
  });
