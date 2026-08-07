import { execFile } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const wrapperPath = fileURLToPath(new URL("../scripts/resona.mjs", import.meta.url));
const configPath = "examples/cantata-de-las-estaciones/resona.config.ts";
const runWrapper = (args: readonly string[]) =>
  execFileAsync(process.execPath, [wrapperPath, "--", ...args], {
    cwd: repositoryRoot,
    env: { ...process.env, npm_config_user_agent: "pnpm/11.20.0 npm/? node/v24.18.0" },
  });

describe("CantataDeLasEstaciones example", () => {
  it("discovers and validates its single public composition", async () => {
    const compositions = await runWrapper(["compositions", "--config", configPath]);
    expect(compositions.stdout).toContain("CantataDeLasEstaciones");

    const validation = await runWrapper([
      "validate",
      "--config",
      configPath,
      "--composition",
      "CantataDeLasEstaciones",
    ]);
    expect(validation.stdout).toContain("Validated CantataDeLasEstaciones (0 errors, 0 warnings).");
  });

  it("renders a short deterministic smoke range to a WAV artifact", async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), "resona-cantata-"));
    const outputPath = join(outputDirectory, "cantata-smoke.wav");
    try {
      const render = await runWrapper([
        "render",
        "--config",
        configPath,
        "CantataDeLasEstaciones",
        outputPath,
        "--end-frame",
        "4800",
        "--overwrite",
      ]);
      expect(render.stdout).toContain("Rendered");
      expect(render.stdout).toContain("4800 frames");
      expect((await stat(outputPath)).size).toBeGreaterThan(44);
    } finally {
      await rm(outputDirectory, { recursive: true, force: true });
    }
  });
});
