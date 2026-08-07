import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runCli, type CliOutput } from "../../cli/src/cli.js";
import { validateSkillCorpus } from "./validate-skills.js";

const engineModulePath = fileURLToPath(new URL("../../engine/dist/index.js", import.meta.url));
const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
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

const commandArguments = (command: string, outputPath: string): readonly string[] => {
  if (!command.startsWith("resona ")) throw new Error(`Not a Resona CLI command: ${command}`);
  return command
    .split(/\s+/u)
    .slice(1)
    .map((argument) =>
      argument
        .replaceAll("<entry>", "src/index.tsx")
        .replaceAll("<id>", "SkillFixture")
        .replaceAll("<composition-id>", "SkillFixture")
        .replaceAll("<path>", outputPath)
        .replaceAll("<output.wav>", outputPath),
    );
};

const documentedCommand = async (prefix: string): Promise<string> => {
  const skills = await validateSkillCorpus(repositoryRoot);
  const command = skills
    .flatMap((skill) => skill.commands)
    .find((value) => value.startsWith(prefix));
  if (command === undefined) throw new Error(`Missing documented command ${prefix}.`);
  return command;
};

const runDocumentedStudio = async (command: string): Promise<void> => {
  const output: CliOutput = { stdout: "", stderr: "" };
  let flushed = "";
  const controller = new AbortController();
  const pending = runCli(commandArguments(command, join(projectRoot, "studio-skill.wav")), {
    cwd: projectRoot,
    output,
    signal: controller.signal,
    flush: () => {
      flushed += output.stdout;
      output.stdout = "";
    },
  });
  try {
    let startupLine: string | undefined;
    for (let attempt = 0; attempt < 100 && startupLine === undefined; attempt += 1) {
      startupLine = flushed.split("\n").find((line) => line.includes('"format":"resona/studio"'));
      if (startupLine === undefined) await new Promise<void>((resolve) => setTimeout(resolve, 10));
    }
    if (startupLine === undefined) throw new Error("Studio did not publish startup metadata.");
    const startup = JSON.parse(startupLine) as { format: string; url: string; token: string };
    expect(startup).toMatchObject({
      format: "resona/studio",
      url: expect.stringMatching(/^http:\/\/127\.0\.0\.1:\d+$/),
      token: expect.any(String),
    });
    const headers = {
      Authorization: `Bearer ${startup.token}`,
      Origin: startup.url,
    };

    const session = await fetch(`${startup.url}/api/v1/session`, { headers });
    expect(session.status).toBe(200);
    await expect(session.json()).resolves.toMatchObject({ type: "session" });

    const compositions = await fetch(`${startup.url}/api/v1/compositions`, { headers });
    expect(compositions.status).toBe(200);
    await expect(compositions.json()).resolves.toMatchObject({
      type: "compositions",
      compositions: [expect.objectContaining({ id: "SkillFixture" })],
    });

    const variantResponse = await fetch(`${startup.url}/api/v1/variants`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ compositionId: "SkillFixture", requestId: "skills-variant" }),
    });
    expect(variantResponse.status).toBe(201);
    const variant = (await variantResponse.json()) as { variantId: string };
    expect(variant.variantId).toMatch(/^variant-/);

    const plan = await fetch(`${startup.url}/api/v1/variants/${variant.variantId}/plan`, {
      headers,
    });
    expect(plan.status).toBe(200);
    await expect(plan.json()).resolves.toMatchObject({
      type: "plan",
      payload: { format: "resona/execution-plan", compositionId: "SkillFixture" },
    });

    const render = await fetch(`${startup.url}/api/v1/variants/${variant.variantId}/render`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ outputPath: "studio-skill.wav", requestId: "skills-render" }),
    });
    expect(render.status).toBe(201);
    await expect(render.json()).resolves.toMatchObject({
      type: "render",
      variantId: variant.variantId,
      payload: { outputPath: "<project>/studio-skill.wav" },
    });
    await expect(stat(join(projectRoot, "studio-skill.wav"))).resolves.toBeTruthy();
  } finally {
    controller.abort();
    await expect(pending).resolves.toBe(130);
  }
};

describe("official Agent Skill workflows", () => {
  it("executes discovery, validation, source modification, render, and Studio", async () => {
    const skills = await validateSkillCorpus(repositoryRoot);
    const cliCommands = [
      ...new Set(
        skills
          .flatMap((skill) => skill.commands)
          .filter((command) => command.startsWith("resona ")),
      ),
    ];
    expect(cliCommands).toEqual(
      expect.arrayContaining([
        "resona compositions --json",
        "resona validate --composition <id> --json",
        "resona render <entry> <composition-id> <path> --json",
        "resona studio --json",
      ]),
    );

    const discovered = await invoke(
      commandArguments(await documentedCommand("resona compositions"), "unused.wav"),
    );
    expect(discovered.exitCode).toBe(0);
    expect(JSON.parse(discovered.stdout)).toMatchObject({
      format: "resona/compositions",
      compositions: [expect.objectContaining({ id: "SkillFixture" })],
    });

    const validated = await invoke(
      commandArguments(await documentedCommand("resona validate"), "unused.wav"),
    );
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
    const rendered = await invoke(
      commandArguments(await documentedCommand("resona render"), outputPath),
    );
    expect(rendered.exitCode).toBe(0);
    expect(rendered.stdout).toContain('"format":"resona/render-event"');
    await expect(stat(outputPath)).resolves.toBeTruthy();

    await runDocumentedStudio(await documentedCommand("resona studio"));

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
