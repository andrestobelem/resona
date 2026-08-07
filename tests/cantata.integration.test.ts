import { execFile } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
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

const spawnWrapper = (args: readonly string[]) =>
  spawn(process.execPath, [wrapperPath, "--", ...args], {
    cwd: repositoryRoot,
    env: { ...process.env, npm_config_user_agent: "pnpm/11.20.0 npm/? node/v24.18.0" },
    stdio: ["ignore", "pipe", "pipe"],
  });

const readWav = async (path: string) => {
  const bytes = await readFile(path);
  expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
  expect(bytes.subarray(8, 12).toString("ascii")).toBe("WAVE");
  let formatOffset = -1;
  let dataOffset = -1;
  let dataSize = -1;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const chunkId = bytes.subarray(offset, offset + 4).toString("ascii");
    const chunkSize = bytes.readUInt32LE(offset + 4);
    if (chunkId === "fmt ") formatOffset = offset + 8;
    if (chunkId === "data") {
      dataOffset = offset + 8;
      dataSize = chunkSize;
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }
  expect(formatOffset).toBeGreaterThan(0);
  expect(dataOffset).toBeGreaterThan(0);
  expect(dataSize).toBe(4800 * 2 * 4);
  expect(bytes.length).toBe(dataOffset + dataSize);
  return {
    bytes,
    audioFormat: bytes.readUInt16LE(formatOffset),
    channels: bytes.readUInt16LE(formatOffset + 2),
    sampleRate: bytes.readUInt32LE(formatOffset + 4),
    bitsPerSample: bytes.readUInt16LE(formatOffset + 14),
    frames: dataSize / (2 * 4),
  };
};

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

  it("renders a short deterministic smoke range to a reproducible WAV artifact", async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), "resona-cantata-"));
    const outputPath = join(outputDirectory, "cantata-smoke.wav");
    const repeatOutputPath = join(outputDirectory, "cantata-smoke-repeat.wav");
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
      await runWrapper([
        "render",
        "--config",
        configPath,
        "CantataDeLasEstaciones",
        repeatOutputPath,
        "--end-frame",
        "4800",
        "--overwrite",
      ]);
      expect(render.stdout).toContain("Rendered");
      expect(render.stdout).toContain("4800 frames");
      expect((await stat(outputPath)).size).toBeGreaterThan(44);
      const first = await readWav(outputPath);
      const repeat = await readWav(repeatOutputPath);
      expect(first.audioFormat).toBe(3);
      expect(first.channels).toBe(2);
      expect(first.sampleRate).toBe(48_000);
      expect(first.bitsPerSample).toBe(32);
      expect(first.frames).toBe(4800);
      expect(first.bytes.equals(repeat.bytes)).toBe(true);
    } finally {
      await rm(outputDirectory, { recursive: true, force: true });
    }
  });

  it("starts Studio for the cantata and forwards Ctrl-C to the child process", async () => {
    const studio = spawnWrapper(["studio", "--config", configPath, "--json"]);
    let output = "";
    try {
      const document = await new Promise<{ format: string; url: string }>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error("Studio did not announce its URL.")),
          10_000,
        );
        studio.stdout.setEncoding("utf8");
        studio.stdout.on("data", (chunk: string) => {
          output += chunk;
          for (const line of output.split("\n")) {
            if (!line.startsWith("{")) continue;
            try {
              const candidate = JSON.parse(line) as { format?: string; url?: string };
              if (candidate.format === "resona/studio" && candidate.url !== undefined) {
                clearTimeout(timeout);
                resolve({ format: candidate.format, url: candidate.url });
                return;
              }
            } catch {
              // Wait for the complete JSON line.
            }
          }
        });
        studio.once("error", (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
      expect(document.format).toBe("resona/studio");
      expect(document.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      studio.kill("SIGINT");
      const [exitCode] = await once(studio, "close");
      expect(exitCode).toBe(130);
    } finally {
      if (studio.exitCode === null && studio.signalCode === null) studio.kill("SIGTERM");
    }
  });
});
