import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { OFFICIAL_SKILLS, RESONA_RELEASE, validateSkillCorpus } from "./validate-skills.js";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));

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
});
