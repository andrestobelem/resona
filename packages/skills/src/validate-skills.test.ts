import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { OFFICIAL_SKILLS, RESONA_RELEASE, validateSkillCorpus } from "./validate-skills.js";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const referencedFiles = [
  "CONTEXT.md",
  "CONTEXT-MAP.md",
  "docs/architecture.md",
  "docs/product.md",
  "docs/adr/0022-node-render-api-is-canonical.md",
  "docs/adr/0023-render-option-precedence-and-provenance.md",
  "docs/adr/0051-loopback-token-protected-studio.md",
  "docs/adr/0053-explicit-atomic-output-publication.md",
  "docs/adr/0054-versioned-agent-skills-for-coding-agents.md",
  "docs/adr/0058-studio-render-numeric-parity-budget.md",
  "docs/research/remotion-agent-skills.md",
  "packages/cli/CONTEXT.md",
  "packages/engine/src/fixtures/reference-project/src/index.tsx",
  "packages/renderer/CONTEXT.md",
] as const;

const copySkillRepository = async (temporaryRoot: string): Promise<void> => {
  await cp(
    join(repositoryRoot, "packages", "skills", "skills"),
    join(temporaryRoot, "packages", "skills", "skills"),
    { recursive: true },
  );
  for (const relativePath of referencedFiles) {
    const target = join(temporaryRoot, relativePath);
    await mkdir(dirname(target), { recursive: true });
    await cp(join(repositoryRoot, relativePath), target);
  }
};

describe("official Agent Skills", () => {
  it("validates the canonical corpus against the current release", async () => {
    const skills = await validateSkillCorpus(repositoryRoot);

    expect(skills.map((skill) => skill.name)).toEqual([...OFFICIAL_SKILLS]);
    expect(skills.every((skill) => skill.release === RESONA_RELEASE)).toBe(true);
    expect(skills.every((skill) => skill.commands.length > 0)).toBe(true);
    expect(skills.every((skill) => skill.references.length > 0)).toBe(true);
    expect(skills.every((skill) => skill.body.includes("No edites artefactos derivados"))).toBe(
      true,
    );
  });

  it("rejects a broken same-repository reference before publication", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "resona-skills-validation-"));
    try {
      await cp(
        join(repositoryRoot, "packages", "skills"),
        join(temporaryRoot, "packages", "skills"),
        {
          recursive: true,
        },
      );
      const sourcePath = join(
        temporaryRoot,
        "packages",
        "skills",
        "skills",
        "resona-compositions",
        "SKILL.md",
      );
      const source = await readFile(sourcePath, "utf8");
      await writeFile(
        sourcePath,
        source.replace(
          "https://github.com/andrestobelem/resona/blob/main/docs/architecture.md",
          "https://github.com/andrestobelem/resona/blob/main/docs/missing.md",
        ),
      );

      await expect(
        validateSkillCorpus(repositoryRoot, join(temporaryRoot, "packages", "skills", "skills")),
      ).rejects.toThrow(/docs\/missing\.md/);
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it("rejects a local reference that escapes the repository root", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "resona-skills-validation-"));
    try {
      await cp(
        join(repositoryRoot, "packages", "skills"),
        join(temporaryRoot, "packages", "skills"),
        { recursive: true },
      );
      const sourcePath = join(
        temporaryRoot,
        "packages",
        "skills",
        "skills",
        "resona-compositions",
        "SKILL.md",
      );
      const source = await readFile(sourcePath, "utf8");
      await writeFile(sourcePath, `${source}\n[escape](../../../../outside.md)\n`);

      await expect(
        validateSkillCorpus(repositoryRoot, join(temporaryRoot, "packages", "skills", "skills")),
      ).rejects.toThrow(/escapes the repository root/);
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it("rejects a symlinked reference whose canonical target is outside the repository", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "resona-skills-validation-"));
    const outsideRoot = await mkdtemp(join(tmpdir(), "resona-skills-outside-"));
    try {
      await copySkillRepository(temporaryRoot);
      const sourcePath = join(
        temporaryRoot,
        "packages",
        "skills",
        "skills",
        "resona-compositions",
        "SKILL.md",
      );
      const linkPath = join(dirname(sourcePath), "outside.md");
      const outsidePath = join(outsideRoot, "outside.md");
      await writeFile(outsidePath, "outside\n");
      await symlink(outsidePath, linkPath);
      const source = await readFile(sourcePath, "utf8");
      await writeFile(sourcePath, `${source}\n[symlinked reference](outside.md)\n`);

      await expect(validateSkillCorpus(temporaryRoot)).rejects.toThrow(
        /escapes the repository root/,
      );
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
      await rm(outsideRoot, { recursive: true, force: true });
    }
  });
});
