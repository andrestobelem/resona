import { describe, expect, it } from "vitest";

import { hashCanonicalJson } from "./render-spec.js";

describe("hashCanonicalJson", () => {
  it("is insensitive to object insertion order and sensitive to musical data", () => {
    const first = hashCanonicalJson({ alpha: 1, nested: { beta: true, gamma: [1, 2] } });
    const reordered = hashCanonicalJson({ nested: { gamma: [1, 2], beta: true }, alpha: 1 });
    const changed = hashCanonicalJson({ alpha: 2, nested: { beta: true, gamma: [1, 2] } });

    expect(reordered).toBe(first);
    expect(changed).not.toBe(first);
    expect(first).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
});
