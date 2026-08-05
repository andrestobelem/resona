import { createHash } from "node:crypto";

export const RANDOM_ALGORITHM_VERSION = 1 as const;

export const deterministicRandom = (seed: string, path: readonly string[], key: string): number => {
  if (key.length === 0) throw new Error("Random keys must not be empty.");
  const digest = createHash("sha256")
    .update(JSON.stringify(["resona/random", RANDOM_ALGORITHM_VERSION, seed, path, key]))
    .digest();
  const bits = digest.readBigUInt64BE(0) >> 11n;
  return Number(bits) / 2 ** 53;
};
