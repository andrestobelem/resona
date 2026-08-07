import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const wrapperPath = fileURLToPath(new URL("../scripts/resona.mjs", import.meta.url));

const runWrapperScript = (script: string) =>
  execFileAsync(process.execPath, ["--input-type=module", "-e", script], {
    cwd: repositoryRoot,
    env: { ...process.env, npm_config_user_agent: "pnpm/11.20.0 npm/? node/v24.18.0" },
  });

const expectedFailure = async (script: string) => {
  try {
    await runWrapperScript(script);
    throw new Error("Expected the wrapper process to fail.");
  } catch (error) {
    return error as { code?: number; stderr?: string; stdout?: string };
  }
};

describe("root resona wrapper", () => {
  it("forwards the CLI help command after the explicit build", async () => {
    const result = await execFileAsync(
      process.execPath,
      [wrapperPath, "--", "compositions", "--help"],
      {
        cwd: repositoryRoot,
        env: { ...process.env, npm_config_user_agent: "pnpm/11.20.0 npm/? node/v24.18.0" },
      },
    );

    expect(result.stdout).toContain("Usage:");
    expect(result.stderr).toBe("");
  });

  it("reports an incompatible Node version before checking the build in a child process", async () => {
    const failure = await expectedFailure(`
      Object.defineProperty(process, "versions", {
        configurable: true,
        value: { ...process.versions, node: "26.7.0" },
      });
      const { runResona } = await import(${JSON.stringify(wrapperPath)});
      process.exitCode = await runResona({
        argv: ["--", "compositions"],
        env: { ...process.env, npm_config_user_agent: "pnpm/11.20.0 npm/? node/v26.7.0" },
      });
    `);

    expect(failure.code).toBe(1);
    expect(failure.stderr).toContain("Node.js 26.7.0 is outside the supported range");
    expect(failure.stderr).not.toContain("CLI build is missing");
  });

  it("reports a missing build artifact in a child process", async () => {
    const root = await mkdtemp(join(tmpdir(), "resona-wrapper-integration-"));
    try {
      const failure = await expectedFailure(`
        Object.defineProperty(process, "versions", {
          configurable: true,
          value: { ...process.versions, node: "24.18.0" },
        });
        const { runResona } = await import(${JSON.stringify(wrapperPath)});
        process.exitCode = await runResona({
          root: ${JSON.stringify(root)},
          cwd: ${JSON.stringify(root)},
          argv: ["--", "compositions"],
          env: { ...process.env, npm_config_user_agent: "pnpm/11.20.0 npm/? node/v24.18.0" },
        });
      `);

      expect(failure.code).toBe(1);
      expect(failure.stderr).toContain("Resona CLI build is missing");
      expect(failure.stderr).toContain("Run pnpm build before pnpm resona -- ...");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
