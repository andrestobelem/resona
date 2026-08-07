import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { runCli, type CliOutput } from "./cli.js";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const sourceRoot = join(repositoryRoot, "packages", "skills", "skills");
const skillNames = [
  "resona-best-practices",
  "resona-compositions",
  "resona-audio-midi",
  "resona-studio",
  "resona-rendering",
] as const;

const fakeNpxSource = `#!/usr/bin/env node
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, relative } from "node:path";

const sourceRoot = process.env.RESONA_SKILLS_TEST_SOURCE;
const recordPath = process.env.RESONA_SKILLS_TEST_RECORD;
if (!sourceRoot || !recordPath) throw new Error("test installer environment is incomplete");
const args = process.argv.slice(2);
await writeFile(recordPath, JSON.stringify({ args }, null, 2) + "\\n");
const command = args[2];
const names = [
  "resona-best-practices",
  "resona-compositions",
  "resona-audio-midi",
  "resona-studio",
  "resona-rendering",
];
if (command !== "add" && command !== "update") process.exit(2);
const projectSkills = join(process.cwd(), ".agents", "skills");
await mkdir(projectSkills, { recursive: true });
const lockPath = join(process.cwd(), "skills-lock.json");
let lock = { version: 1, skills: {} };
try { lock = JSON.parse(await readFile(lockPath, "utf8")); } catch {}
const selected = command === "add" ? names : names.filter((name) => args.includes(name));
for (const name of selected) {
  await cp(join(sourceRoot, name), join(projectSkills, name), { recursive: true });
  if (process.env.RESONA_SKILLS_TEST_INVALID === "1" && name === "resona-studio") {
    await writeFile(
      join(projectSkills, name, "SKILL.md"),
      "---\\nname: resona-studio\\ndescription: Valid metadata but invalid workflow fixture\\nresona-release: 0.0.0\\n---\\n",
    );
  }
  const files = [];
  const collect = async (root, current) => {
    for (const entry of await (await import("node:fs/promises")).readdir(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) await collect(root, full);
      else if (entry.isFile()) files.push({ path: relative(root, full).split("\\\\").join("/"), contents: await readFile(full) });
    }
  };
  await collect(join(projectSkills, name), join(projectSkills, name));
  files.sort((a, b) => a.path.localeCompare(b.path));
  const hash = createHash("sha256");
  for (const file of files) { hash.update(file.path); hash.update(file.contents); }
  lock.skills[name] = {
    source: "andrestobelem/resona",
    sourceType: "github",
    ref: "main",
    skillPath: "packages/skills/skills/" + name + "/SKILL.md",
    computedHash: hash.digest("hex"),
  };
}
await writeFile(lockPath, JSON.stringify(lock, null, 2) + "\\n");
`;

const invoke = async (
  args: readonly string[],
  cwd: string,
  environment: NodeJS.ProcessEnv,
): Promise<CliOutput & { exitCode: number }> => {
  const output: CliOutput = { stdout: "", stderr: "" };
  const exitCode = await runCli(args, { cwd, output, environment });
  return { ...output, exitCode };
};

describe("resona skills installation workflow", () => {
  const temporaryRoots: string[] = [];

  afterEach(async () => {
    await Promise.all(
      temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
    );
  });

  const fixture = async (): Promise<{
    projectRoot: string;
    environment: NodeJS.ProcessEnv;
    recordPath: string;
  }> => {
    const projectRoot = await mkdtemp(join(tmpdir(), "resona-skills-install-"));
    temporaryRoots.push(projectRoot);
    const bin = join(projectRoot, "bin");
    await mkdir(bin, { recursive: true });
    const npxPath = join(bin, "npx");
    await writeFile(npxPath, fakeNpxSource);
    await chmod(npxPath, 0o755);
    const recordPath = join(projectRoot, "installer.json");
    return {
      projectRoot,
      recordPath,
      environment: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH ?? ""}`,
        RESONA_SKILLS_TEST_SOURCE: sourceRoot,
        RESONA_SKILLS_TEST_RECORD: recordPath,
      },
    };
  };

  it("installs the standard corpus, preserves release metadata, and reports current", async () => {
    const { projectRoot, environment } = await fixture();

    const result = await invoke(["skills", "add", "--json"], projectRoot, environment);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      format: "resona/skills-result",
      schemaVersion: 1,
      operation: "add",
      release: "0.0.0",
      status: { summary: { current: 5, missing: 0, outdated: 0, modified: 0 } },
    });

    for (const name of skillNames) {
      const document = await readFile(
        join(projectRoot, ".agents", "skills", name, "SKILL.md"),
        "utf8",
      );
      expect(document).toContain("resona-release: 0.0.0");
    }
    const lock = JSON.parse(await readFile(join(projectRoot, "skills-lock.json"), "utf8"));
    expect(lock.version).toBe(1);
    expect(Object.keys(lock.skills)).toEqual([...skillNames]);
  });

  it("distinguishes an outdated release from a local modification", async () => {
    const { projectRoot, environment } = await fixture();
    await invoke(["skills", "add"], projectRoot, environment);

    const stalePath = join(projectRoot, ".agents", "skills", "resona-compositions", "SKILL.md");
    const stale = await readFile(stalePath, "utf8");
    await writeFile(stalePath, stale.replace("resona-release: 0.0.0", "resona-release: 0.0.1"));
    const modifiedPath = join(projectRoot, ".agents", "skills", "resona-studio", "SKILL.md");
    await writeFile(modifiedPath, `${await readFile(modifiedPath, "utf8")}\nlocal customization\n`);

    const result = await invoke(["skills", "status", "--json"], projectRoot, environment);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      format: "resona/skills-status",
      skills: expect.arrayContaining([
        expect.objectContaining({ name: "resona-compositions", state: "outdated" }),
        expect.objectContaining({ name: "resona-studio", state: "modified" }),
      ]),
    });
  });

  it("does not overwrite a modified skill when add is repeated without force", async () => {
    const { projectRoot, environment, recordPath } = await fixture();
    await invoke(["skills", "add"], projectRoot, environment);
    const modifiedPath = join(projectRoot, ".agents", "skills", "resona-compositions", "SKILL.md");
    await writeFile(
      modifiedPath,
      (await readFile(modifiedPath, "utf8")) + "\nlocal customization\n",
    );
    const before = await readFile(recordPath, "utf8");

    const rejected = await invoke(["skills", "add", "--json"], projectRoot, environment);
    expect(rejected.exitCode).toBe(1);
    expect(JSON.parse(rejected.stdout)).toMatchObject({
      format: "resona/cli-error",
      exitCode: 1,
    });
    await expect(readFile(recordPath, "utf8")).resolves.toBe(before);
    await expect(readFile(modifiedPath, "utf8")).resolves.toContain("local customization");
  });

  it("updates a clean installation through the standard installer", async () => {
    const { projectRoot, environment, recordPath } = await fixture();
    await invoke(["skills", "add"], projectRoot, environment);

    const result = await invoke(["skills", "update", "--json"], projectRoot, environment);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      format: "resona/skills-result",
      operation: "update",
      release: "0.0.0",
      status: { summary: { current: 5, missing: 0, outdated: 0, modified: 0 } },
    });
    expect(JSON.parse(await readFile(recordPath, "utf8"))).toMatchObject({
      args: expect.arrayContaining(["skills@1.5.20", "update", "--project", "--yes"]),
    });
  });

  it("revalidates installed metadata and workflow sections after installation", async () => {
    const { projectRoot, environment } = await fixture();
    environment.RESONA_SKILLS_TEST_INVALID = "1";

    const result = await invoke(["skills", "add", "--json"], projectRoot, environment);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      format: "resona/cli-error",
      exitCode: 1,
      message: expect.stringContaining("missing ## Workflow"),
    });
    await expect(
      readFile(join(projectRoot, ".agents", "skills", "resona-studio", "SKILL.md"), "utf8"),
    ).rejects.toThrow();
    await expect(readFile(join(projectRoot, "skills-lock.json"), "utf8")).rejects.toThrow();
  });

  it("revalidates clean updates and restores the previous installation on failure", async () => {
    const { projectRoot, environment } = await fixture();
    await invoke(["skills", "add"], projectRoot, environment);
    const original = await readFile(
      join(projectRoot, ".agents", "skills", "resona-studio", "SKILL.md"),
      "utf8",
    );
    environment.RESONA_SKILLS_TEST_INVALID = "1";

    const result = await invoke(
      ["skills", "update", "--force", "--json"],
      projectRoot,
      environment,
    );
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      format: "resona/cli-error",
      exitCode: 1,
      message: expect.stringContaining("missing ## Workflow"),
    });
    await expect(
      readFile(join(projectRoot, ".agents", "skills", "resona-studio", "SKILL.md"), "utf8"),
    ).resolves.toBe(original);
  });

  it("rejects a non-official lock source even with force", async () => {
    const { projectRoot, environment, recordPath } = await fixture();
    await invoke(["skills", "add"], projectRoot, environment);
    const lockPath = join(projectRoot, "skills-lock.json");
    const lock = JSON.parse(await readFile(lockPath, "utf8"));
    lock.skills["resona-studio"].source = "untrusted/example";
    await writeFile(lockPath, JSON.stringify(lock, null, 2) + "\n");
    const before = await readFile(recordPath, "utf8");

    const result = await invoke(
      ["skills", "update", "resona-studio", "--force", "--json"],
      projectRoot,
      environment,
    );
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      format: "resona/cli-error",
      exitCode: 1,
      message: expect.stringContaining("untrusted source"),
    });
    await expect(readFile(recordPath, "utf8")).resolves.toBe(before);
  });

  it("rejects modified skills without spawning update and allows explicit force", async () => {
    const { projectRoot, environment, recordPath } = await fixture();
    await invoke(["skills", "add"], projectRoot, environment);
    const modifiedPath = join(projectRoot, ".agents", "skills", "resona-studio", "SKILL.md");
    await writeFile(modifiedPath, `${await readFile(modifiedPath, "utf8")}\nlocal customization\n`);
    const before = await readFile(recordPath, "utf8");

    const rejected = await invoke(["skills", "update", "--json"], projectRoot, environment);
    expect(rejected.exitCode).toBe(1);
    expect(JSON.parse(rejected.stdout)).toMatchObject({ format: "resona/cli-error", exitCode: 1 });
    await expect(readFile(recordPath, "utf8")).resolves.toBe(before);
    await expect(readFile(modifiedPath, "utf8")).resolves.toContain("local customization");

    const forced = await invoke(
      ["skills", "update", "--force", "--json"],
      projectRoot,
      environment,
    );
    expect(forced.exitCode).toBe(0);
    expect(JSON.parse(forced.stdout)).toMatchObject({
      format: "resona/skills-result",
      operation: "update",
      status: { summary: { current: 5, missing: 0, outdated: 0, modified: 0 } },
    });
    await expect(readFile(modifiedPath, "utf8")).resolves.not.toContain("local customization");
    expect(JSON.parse(await readFile(recordPath, "utf8"))).toMatchObject({
      args: expect.arrayContaining(["skills@1.5.20", "update", "--project", "--yes"]),
    });
  });

  it("reports an absent installation without mutating the project", async () => {
    const { projectRoot, environment } = await fixture();
    const result = await invoke(["skills", "status", "--json"], projectRoot, environment);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      format: "resona/skills-status",
      summary: { current: 0, missing: 5, outdated: 0, modified: 0 },
    });
    await expect(readFile(join(projectRoot, "skills-lock.json"), "utf8")).rejects.toThrow();
  });

  it("rejects render-only options on the skills command", async () => {
    const { projectRoot, environment } = await fixture();
    const result = await invoke(
      ["skills", "status", "--output", "ignored.wav", "--json"],
      projectRoot,
      environment,
    );
    expect(result.exitCode).toBe(2);
    expect(JSON.parse(result.stdout)).toMatchObject({
      format: "resona/cli-error",
      exitCode: 2,
    });
  });
});
