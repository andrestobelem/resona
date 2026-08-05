import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
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
    `import { Composition, Sequence, duration, position, rational, registerRoot } from ${JSON.stringify(engineModulePath)};
console.log("project-log");
const Song = () => <Sequence id="root" from={position.seconds(0n)} />;
const Root = () => <Composition id="Smoke" component={Song} duration={duration.seconds(1n)} bpm={rational(120n)} timeSignature={{ beatsPerBar: 4, beatUnit: 4 }} />;
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
});

afterAll(async () => {
  await rm(projectRoot, { force: true, recursive: true });
});

const invoke = async (args: readonly string[], cwd = projectRoot) => {
  const output: CliOutput = { stdout: "", stderr: "" };
  const exitCode = await runCli(args, { cwd, output });
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
});
