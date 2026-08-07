import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const wrapperPath = fileURLToPath(new URL("../scripts/resona.mjs", import.meta.url));

describe("root resona wrapper", () => {
  it("forwards the CLI help command after the explicit build", async () => {
    const result = await execFileAsync(process.execPath, [wrapperPath, "compositions", "--help"], {
      cwd: repositoryRoot,
      env: { ...process.env, npm_config_user_agent: "pnpm/11.20.0 npm/? node/v24.18.0" },
    });

    expect(result.stdout).toContain("Usage:");
    expect(result.stderr).toBe("");
  });
});
