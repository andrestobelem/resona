import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { cliEntrypoint, missingBuildMessage, runResona } from "../scripts/resona.mjs";

describe("runResona", () => {
  it("reports the explicit build prerequisite when the CLI artifact is absent", async () => {
    const root = await mkdtemp(join(tmpdir(), "resona-wrapper-"));
    let stderr = "";
    try {
      const exitCode = await runResona({
        root,
        cwd: root,
        env: { ...process.env, npm_config_user_agent: "pnpm/11.20.0 npm/? node/v24.18.0" },
        output: { write: (chunk) => (stderr += chunk) },
      });

      expect(exitCode).toBe(1);
      expect(stderr).toBe(`${missingBuildMessage(cliEntrypoint(root))}\n`);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("reports an incompatible Node version before checking the build", async () => {
    const root = await mkdtemp(join(tmpdir(), "resona-wrapper-"));
    let stderr = "";
    try {
      const exitCode = await runResona({
        root,
        cwd: root,
        env: { ...process.env, npm_config_user_agent: "pnpm/11.20.0 npm/? node/v26.7.0" },
        nodeVersion: "26.7.0",
        output: { write: (chunk) => (stderr += chunk) },
      });

      expect(exitCode).toBe(1);
      expect(stderr).toContain("Node.js 26.7.0 is outside the supported range");
      expect(stderr).not.toContain("CLI build is missing");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
