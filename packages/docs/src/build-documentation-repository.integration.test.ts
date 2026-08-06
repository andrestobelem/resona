import { readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { runDocumentationBuild } from "./cli.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("repository documentation build", () => {
  it("publishes the complete Markdown corpus and its navigable index", async () => {
    const result = await runDocumentationBuild(repositoryRoot);
    const manifest = JSON.parse(
      await readFile(join(repositoryRoot, ".resona-docs", "manifest.json"), "utf8"),
    ) as {
      orphanedOutputs: readonly unknown[];
      outputs: readonly { path: string }[];
      sources: readonly { path: string }[];
    };

    expect(result.sourceCount).toBeGreaterThan(160);
    expect(manifest.sources).toHaveLength(result.sourceCount);
    expect(manifest.orphanedOutputs).toEqual([]);
    expect(manifest.outputs).toHaveLength(result.generatedFiles.length - 1);
    expect(manifest.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "README.md" }),
        expect.objectContaining({ path: "docs/architecture.md" }),
        expect.objectContaining({ path: ".agents/skills/tdd/SKILL.md" }),
      ]),
    );

    for (const source of manifest.sources) {
      const outputPath = `${source.path.slice(0, -3)}.html`;
      expect(manifest.outputs.some((entry) => entry.path === outputPath)).toBe(true);
      await expect(stat(join(repositoryRoot, outputPath))).resolves.toBeTruthy();
    }

    await expect(stat(join(repositoryRoot, "index.html"))).resolves.toBeTruthy();
    await expect(readFile(join(repositoryRoot, "index.html"), "utf8")).resolves.toContain(
      "Resona documentation",
    );
  }, 30_000);
});
