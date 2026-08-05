import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runCli, type CliOutput } from "./cli.js";

const engineModulePath = fileURLToPath(new URL("../../engine/dist/index.js", import.meta.url));
let projectRoot: string;
let nestedCwd: string;

beforeAll(async () => {
  projectRoot = await realpath(await mkdtemp(join(tmpdir(), "resona-cli-")));
  await mkdir(join(projectRoot, "src"), { recursive: true });
  nestedCwd = join(projectRoot, "nested", "work");
  await mkdir(nestedCwd, { recursive: true });
  await writeFile(join(projectRoot, "resona.config.ts"), "export default {};\n");
  await writeFile(
    join(projectRoot, "src", "index.tsx"),
    `import { Composition, EventClip, PolySynth, Sequence, Track, duration, note, pitch, position, rational, registerRoot } from ${JSON.stringify(engineModulePath)};
console.log("project-log");
process.stdout.write("project-write\\n");
const Song = () => <Sequence id="root" from={position.seconds(0n)} />;
const ToneSong = () => <Sequence id="root" from={position.seconds(0n)}><Track id="lead" source={<EventClip id="notes" from={position.seconds(0n)} events={[note({ at: position.seconds(0n), duration: duration.seconds(1n, 10n), pitch: pitch.semitonesFromA4(0) })]} />} instrument={<PolySynth id="synth" oscillator="sine" />} /></Sequence>;
const Root = () => <><Composition id="Smoke" component={Song} duration={duration.seconds(1n)} bpm={rational(120n)} timeSignature={{ beatsPerBar: 4, beatUnit: 4 }} /><Composition id="Tone" component={ToneSong} duration={duration.seconds(1n)} bpm={rational(120n)} timeSignature={{ beatsPerBar: 4, beatUnit: 4 }} /></>;
registerRoot(Root);`,
  );
  await writeFile(
    join(projectRoot, "src", "alternate.tsx"),
    `import { Composition, Sequence, duration, position, rational, registerRoot } from ${JSON.stringify(engineModulePath)};
const Song = () => <Sequence id="root" from={position.seconds(0n)} />;
const Root = () => <Composition id="Alternate" component={Song} duration={duration.seconds(1n)} bpm={rational(120n)} timeSignature={{ beatsPerBar: 4, beatUnit: 4 }} />;
registerRoot(Root);`,
  );
  await writeFile(join(projectRoot, "custom-config.ts"), "export default {};\n");
  await writeFile(join(projectRoot, "broken-config.ts"), "export default {;\n");
});

afterAll(async () => {
  await rm(projectRoot, { force: true, recursive: true });
});

const invoke = async (args: readonly string[], cwd = projectRoot, signal?: AbortSignal) => {
  const output: CliOutput = { stdout: "", stderr: "" };
  const exitCode = await runCli(args, { cwd, output, ...(signal === undefined ? {} : { signal }) });
  return { ...output, exitCode };
};

describe("resona CLI", () => {
  it("lists the shared registry as a versioned JSON document", async () => {
    const result = await invoke(["compositions", "--json"]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      format: "resona/compositions",
      schemaVersion: 1,
      project: {
        configuration: {
          entry: { value: "src/index.tsx", source: "resona-default" },
        },
      },
      compositions: expect.arrayContaining([
        expect.objectContaining({ id: "Smoke", defaultInputs: {} }),
      ]),
    });
  });

  it("validates a variant without rendering audio and keeps JSON stdout protocol-only", async () => {
    const result = await invoke(["validate", "--composition", "Smoke", "--json"]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      format: "resona/validation-result",
      schemaVersion: 1,
      composition: { compositionId: "Smoke" },
      variant: { compositionId: "Smoke" },
      plan: { format: "resona/execution-plan", compositionId: "Smoke" },
      diagnostics: [],
    });
  });

  it("discovers the nearest config from a nested working directory", async () => {
    const result = await invoke(["compositions", "--json"], nestedCwd);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      project: { root: projectRoot },
    });
  });

  it("honors an explicit entry file and a config file with a custom name", async () => {
    const result = await invoke([
      "compositions",
      "src/alternate.tsx",
      "--config",
      "custom-config.ts",
      "--json",
    ]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      project: {
        configuration: {
          entry: { value: "src/alternate.tsx", source: "invocation" },
        },
      },
      compositions: [expect.objectContaining({ id: "Alternate" })],
    });
  });

  it("uses the input schema for invocation JSON and reports domain failures separately", async () => {
    const result = await invoke([
      "validate",
      "--composition",
      "Smoke",
      "--input",
      '{"unsupported":true}',
      "--json",
    ]);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      format: "resona/cli-error",
      schemaVersion: 1,
      exitCode: 1,
      diagnostics: [
        expect.objectContaining({ code: "inputs.validation-failed", phase: "input-validation" }),
      ],
    });
  });

  it("keeps human output readable by default", async () => {
    const result = await invoke(["compositions"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Project:");
    expect(result.stdout).toContain("- Smoke");
  });

  it("starts the protected Studio service until cancellation", async () => {
    const controller = new AbortController();
    const pending = invoke(["studio", "--json"], projectRoot, controller.signal);
    await new Promise<void>((resolve) => setTimeout(resolve, 25));
    controller.abort();
    const result = await pending;

    expect(result.exitCode).toBe(130);
    const documents = result.stdout
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(documents[0]).toMatchObject({
      format: "resona/studio",
      schemaVersion: 1,
      host: "127.0.0.1",
      url: expect.stringMatching(/^http:\/\/127\.0\.0\.1:\d+$/),
      token: expect.any(String),
    });
    expect(documents.at(-1)).toMatchObject({
      format: "resona/cli-error",
      schemaVersion: 1,
      exitCode: 130,
    });
  }, 15_000);

  it("uses the stable usage exit code for an invalid invocation", async () => {
    const result = await invoke(["validate", "--json"]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      format: "resona/cli-error",
      schemaVersion: 1,
      exitCode: 2,
    });
  });

  it("keeps JSON protocol output for parser failures after --json", async () => {
    const result = await invoke(["validate", "--json", "--input"]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      format: "resona/cli-error",
      schemaVersion: 1,
      exitCode: 2,
    });
  });

  it("uses the configuration exit code for an unreadable config", async () => {
    const result = await invoke(["compositions", "--config", "broken-config.ts", "--json"]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      format: "resona/cli-error",
      schemaVersion: 1,
      exitCode: 2,
    });
  });

  it("renders the same job through the positional CLI contract as versioned JSONL", async () => {
    const outputPath = join(projectRoot, "tone.wav");
    const result = await invoke([
      "render",
      "src/index.tsx",
      "Tone",
      outputPath,
      "--json",
      "--block-frames",
      "4096",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    const events = result.stdout
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(events.length).toBeGreaterThan(3);
    expect(events.every((event) => event.format === "resona/render-event")).toBe(true);
    expect(events.every((event) => event.schemaVersion === 1)).toBe(true);
    expect(
      events.some((event) => event.type === "progress" && event.phase === "configuration"),
    ).toBe(true);
    expect(events.at(-1)).toMatchObject({
      type: "result",
      compositionId: "Tone",
      outputPath,
      frames: 48_000,
      sampleRate: 48_000,
      channels: 2,
    });
    const bytes = await readFile(outputPath);
    expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
  }, 20_000);

  it("gives explicit range flags precedence over render options JSON", async () => {
    const outputPath = join(projectRoot, "range.wav");
    const result = await invoke([
      "render",
      "--composition",
      "Tone",
      "--output",
      outputPath,
      "--options",
      '{"endFrame":48000,"tailFrames":100}',
      "--end-frame",
      "24000",
      "--json",
    ]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout.trim().split("\n").at(-1) ?? "{}")).toMatchObject({
      type: "result",
      frames: 24_100,
    });
  }, 20_000);

  it("uses the stable domain failure for an existing render output", async () => {
    const outputPath = join(projectRoot, "existing.wav");
    await writeFile(outputPath, "existing artifact");

    const result = await invoke([
      "render",
      "--composition",
      "Tone",
      "--output",
      outputPath,
      "--json",
    ]);

    expect(result.exitCode).toBe(1);
    const lines = result.stdout
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(lines.at(-1)).toMatchObject({
      format: "resona/render-event",
      schemaVersion: 1,
      type: "error",
      exitCode: 1,
      diagnostics: [expect.objectContaining({ code: "render.output-exists" })],
    });
    await expect(readFile(outputPath, "utf8")).resolves.toBe("existing artifact");
  }, 20_000);

  it("maps an already requested SIGINT to the stable cancellation code", async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await invoke(
      ["render", "--composition", "Tone", "--output", join(projectRoot, "cancel.wav"), "--json"],
      projectRoot,
      controller.signal,
    );

    expect(result.exitCode).toBe(130);
    expect(JSON.parse(result.stdout.trim())).toMatchObject({
      format: "resona/render-event",
      schemaVersion: 1,
      type: "error",
      exitCode: 130,
    });
  });
});
