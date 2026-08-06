import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runCli, type CliOutput } from "../../cli/src/cli.js";

const engineModulePath = fileURLToPath(new URL("../../engine/dist/index.js", import.meta.url));
let projectRoot: string;
let originalSource: string;

beforeAll(async () => {
  projectRoot = await mkdtemp(join(tmpdir(), "resona-skills-workflow-"));
  await mkdir(join(projectRoot, "src"), { recursive: true });
  await mkdir(join(projectRoot, "public"), { recursive: true });
  await writeFile(
    join(projectRoot, "resona.config.ts"),
    `import { defineConfig } from ${JSON.stringify(engineModulePath)};
export default defineConfig({ entry: "src/index.tsx", staticDir: "public", seed: "skills-fixture" });
`,
  );
  originalSource = `import { Composition, EventClip, PolySynth, Sequence, Track, duration, note, pitch, position, rational, registerRoot } from ${JSON.stringify(engineModulePath)};
const Song = () => <Sequence id="root" from={position.seconds(0n)}><Track id="lead" source={<EventClip id="notes" from={position.seconds(0n)} events={[note({ at: position.seconds(0n), duration: duration.seconds(1n, 10n), pitch: pitch.semitonesFromA4(0) })]} />} instrument={<PolySynth id="synth" oscillator="sine" />} /></Sequence>;
const Root = () => <Composition id="SkillFixture" component={Song} duration={duration.seconds(1n)} bpm={rational(120n)} timeSignature={{ beatsPerBar: 4, beatUnit: 4 }} />;
registerRoot(Root);
`;
  await writeFile(join(projectRoot, "src", "index.tsx"), originalSource);
});

afterAll(async () => {
  await rm(projectRoot, { recursive: true, force: true });
});

const invoke = async (args: readonly string[], signal?: AbortSignal) => {
  const output: CliOutput = { stdout: "", stderr: "" };
  const exitCode = await runCli(args, { cwd: projectRoot, output, ...(signal ? { signal } : {}) });
  return { ...output, exitCode };
};

describe("official Agent Skill workflows", () => {
  it("executes discovery, validation, source modification, render, and Studio", async () => {
    const discovered = await invoke(["compositions", "--json"]);
    expect(discovered.exitCode).toBe(0);
    expect(JSON.parse(discovered.stdout)).toMatchObject({
      format: "resona/compositions",
      compositions: [expect.objectContaining({ id: "SkillFixture" })],
    });

    const validated = await invoke(["validate", "--composition", "SkillFixture", "--json"]);
    expect(validated.exitCode).toBe(0);
    expect(JSON.parse(validated.stdout)).toMatchObject({
      format: "resona/validation-result",
      plan: { compositionId: "SkillFixture" },
      diagnostics: [],
    });

    const changedSource = originalSource.replace('id="SkillFixture"', 'id="SkillFixtureChanged"');
    await writeFile(join(projectRoot, "src", "index.tsx"), changedSource);
    const changed = await invoke(["compositions", "--json"]);
    expect(changed.exitCode).toBe(0);
    expect(JSON.parse(changed.stdout)).toMatchObject({
      compositions: [expect.objectContaining({ id: "SkillFixtureChanged" })],
    });

    await writeFile(join(projectRoot, "src", "index.tsx"), originalSource);
    const outputPath = join(projectRoot, "skill-fixture.wav");
    const rendered = await invoke([
      "render",
      "--composition",
      "SkillFixture",
      "--output",
      outputPath,
      "--json",
    ]);
    expect(rendered.exitCode).toBe(0);
    expect(rendered.stdout).toContain('"format":"resona/render-event"');
    await expect(stat(outputPath)).resolves.toBeTruthy();

    const controller = new AbortController();
    const studio = invoke(["studio", "--json"], controller.signal);
    await new Promise<void>((resolve) => setTimeout(resolve, 25));
    controller.abort();
    const studioResult = await studio;
    expect(studioResult.exitCode).toBe(130);
    expect(studioResult.stdout).toContain('"format":"resona/studio"');

    await expect(stat(join(projectRoot, "index.html"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(stat(join(projectRoot, ".resona-docs"))).rejects.toMatchObject({ code: "ENOENT" });
  }, 30_000);

  it("does not leave generated artifacts after a workflow", async () => {
    const source = await readFile(join(projectRoot, "src", "index.tsx"), "utf8");
    expect(source).toBe(originalSource);
    await expect(stat(join(projectRoot, "src", "index.html"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});
