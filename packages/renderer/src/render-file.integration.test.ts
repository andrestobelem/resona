import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { createRenderJob, type CreateRenderJobResult } from "../../engine/src/index.js";
import { renderAudioToFile } from "./index.js";

const exactProjectRoot = fileURLToPath(
  new URL("../../engine/src/fixtures/exact-project/", import.meta.url),
);

const temporaryDirectories: string[] = [];

const createOutputDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), "resona-render-file-"));
  temporaryDirectories.push(directory);
  return directory;
};

const exactJob = async (): Promise<CreateRenderJobResult> =>
  createRenderJob({ projectRoot: exactProjectRoot, compositionId: "ExactNote" });

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("renderAudioToFile", () => {
  it("publishes a validated WAV atomically and reports render/publication progress", async () => {
    const directory = await createOutputDirectory();
    const outputPath = join(directory, "render.wav");
    const progress: string[] = [];
    const result = await renderAudioToFile(await exactJob(), {
      outputPath,
      onProgress: (event) => progress.push(event.phase),
    });

    const bytes = await readFile(outputPath);
    expect(result.outputPath).toBe(outputPath);
    expect(result.bytes).toBe(bytes.byteLength);
    expect(result.frames).toBe(48_000);
    expect(result.channels).toBe(2);
    expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(bytes.subarray(8, 12).toString("ascii")).toBe("WAVE");
    expect(progress).toContain("render");
    expect(progress.at(-1)).toBe("publish");
    await expect(readdir(directory)).resolves.toEqual(["render.wav"]);
  }, 15_000);

  it("preserves an existing destination unless overwrite is explicit", async () => {
    const directory = await createOutputDirectory();
    const outputPath = join(directory, "render.wav");
    await writeFile(outputPath, "existing artifact");

    await expect(renderAudioToFile(await exactJob(), { outputPath })).rejects.toMatchObject({
      name: "ResonaError",
      diagnostics: [
        expect.objectContaining({
          code: "render.output-exists",
          phase: "render",
          severity: "error",
        }),
      ],
    });
    await expect(readFile(outputPath, "utf8")).resolves.toBe("existing artifact");

    await renderAudioToFile(await exactJob(), { outputPath, overwrite: true });
    await expect(readFile(outputPath)).resolves.toSatisfy((bytes) =>
      bytes.subarray(0, 4).equals(Buffer.from("RIFF")),
    );
  }, 15_000);

  it("cancels idempotently and leaves no temporary or final artifact", async () => {
    const directory = await createOutputDirectory();
    const outputPath = join(directory, "cancelled.wav");
    const controller = new AbortController();
    let calls = 0;

    const render = renderAudioToFile(await exactJob(), {
      outputPath,
      blockFrames: 1,
      signal: controller.signal,
      onProgress: () => {
        calls += 1;
        controller.abort();
        controller.abort();
      },
    });

    await expect(render).rejects.toSatisfy((error) => {
      expect(error).toMatchObject({
        name: "ResonaError",
        diagnostics: [expect.objectContaining({ code: "render.cancelled", phase: "render" })],
      });
      return true;
    });
    expect(calls).toBe(1);
    await expect(readdir(directory)).resolves.toEqual([]);
  }, 15_000);

  it("rejects non-finite render output without publishing a partial file", async () => {
    const directory = await createOutputDirectory();
    const outputPath = join(directory, "invalid.wav");
    const job = await exactJob();
    const invalidJob: CreateRenderJobResult = {
      ...job,
      plan: {
        ...job.plan,
        events: job.plan.events.map((event) =>
          event.type === "note-attack" ? { ...event, semitonesFromA4: Number.NaN } : event,
        ),
      },
    };

    await expect(renderAudioToFile(invalidJob, { outputPath })).rejects.toThrow();
    await expect(readdir(directory)).resolves.toEqual([]);
  }, 15_000);
});
