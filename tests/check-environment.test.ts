import { describe, expect, it } from "vitest";

import { checkEnvironment } from "../scripts/check-environment.mjs";

describe("checkEnvironment", () => {
  it("accepts the declared Node and pnpm versions", () => {
    expect(checkEnvironment({ nodeVersion: "24.18.0", pnpmVersion: "11.20.0" })).toEqual({
      ok: true,
      diagnostics: [],
    });
  });

  it("rejects Node 26 and points to the repository version file", () => {
    const result = checkEnvironment({ nodeVersion: "26.7.0", pnpmVersion: "11.20.0" });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContain(
      "Node.js 26.7.0 is outside the supported range >=24.18.0 <25. Select the version from .node-version with your Node version manager.",
    );
  });

  it("rejects an unexpected pnpm version with the exact package-manager contract", () => {
    const result = checkEnvironment({ nodeVersion: "24.18.0", pnpmVersion: "10.12.0" });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContain(
      "pnpm 10.12.0 is unsupported; this repository requires pnpm 11.20.0 via its packageManager declaration.",
    );
  });
});
