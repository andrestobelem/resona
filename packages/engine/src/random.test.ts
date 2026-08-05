import { describe, expect, it } from "vitest";

import { RANDOM_ALGORITHM_VERSION, deterministicRandom } from "./random.js";

describe("deterministicRandom", () => {
  it("derives a stable unit value from seed, path and key", () => {
    const first = deterministicRandom("seed", ["Composition", "track"], "velocity");

    expect(RANDOM_ALGORITHM_VERSION).toBe(1);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(1);
    expect(deterministicRandom("seed", ["Composition", "track"], "velocity")).toBe(first);
  });

  it("addresses unrelated values independently", () => {
    const original = deterministicRandom("seed", ["Composition", "track"], "velocity");

    expect(deterministicRandom("changed", ["Composition", "track"], "velocity")).not.toBe(original);
    expect(deterministicRandom("seed", ["Composition", "other"], "velocity")).not.toBe(original);
    expect(deterministicRandom("seed", ["Composition", "track"], "pan")).not.toBe(original);
  });
});
