import { describe, expect, it } from "vitest";

import { roundRationalToNearestEven } from "./round-rational-to-nearest-even.js";

describe("roundRationalToNearestEven", () => {
  it("rounds values on either side of the halfway point", () => {
    expect(roundRationalToNearestEven(1n, 3n)).toBe(0n);
    expect(roundRationalToNearestEven(2n, 3n)).toBe(1n);
  });

  it("rounds exact ties toward the even integer", () => {
    expect(roundRationalToNearestEven(5n, 2n)).toBe(2n);
    expect(roundRationalToNearestEven(7n, 2n)).toBe(4n);
  });

  it("preserves exact integers", () => {
    expect(roundRationalToNearestEven(6n, 3n)).toBe(2n);
  });

  it("remains exact beyond Number.MAX_SAFE_INTEGER", () => {
    expect(roundRationalToNearestEven(90_071_992_547_409_935n, 10n)).toBe(9_007_199_254_740_994n);
  });

  it.each([
    [-1n, 1n],
    [1n, 0n],
    [1n, -1n],
  ])("rejects the invalid rational %s/%s", (numerator, denominator) => {
    expect(() => roundRationalToNearestEven(numerator, denominator)).toThrow(RangeError);
  });
});
