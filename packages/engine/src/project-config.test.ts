import { describe, expect, it } from "vitest";

import { resolveProjectConfiguration } from "./project-config.js";

describe("resolveProjectConfiguration", () => {
  it("rejects opaque configuration instances", () => {
    expect(() => resolveProjectConfiguration("/project", new Date(0))).toThrow(
      "Project config must export a plain object.",
    );
  });
});
