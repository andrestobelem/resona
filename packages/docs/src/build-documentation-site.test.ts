import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { buildDocumentationSite } from "./index.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
  );
});

describe("buildDocumentationSite", () => {
  it("builds every eligible Markdown file into a sibling HTML site", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "resona-docs-test-"));
    temporaryRoots.push(projectRoot);
    await mkdir(join(projectRoot, ".agents"), { recursive: true });
    await mkdir(join(projectRoot, "docs"), { recursive: true });
    await mkdir(join(projectRoot, "node_modules"), { recursive: true });
    await mkdir(join(projectRoot, "dist"), { recursive: true });
    await writeFile(join(projectRoot, "README.md"), "# Resona\n\nA code-first music framework.\n");
    await writeFile(join(projectRoot, ".agents", "notes.md"), "# Agent notes\n");
    await writeFile(join(projectRoot, "docs", "guide.md"), "# Guide\n\nRead this first.\n");
    await writeFile(join(projectRoot, "node_modules", "ignored.md"), "# Ignored\n");
    await writeFile(join(projectRoot, "dist", "ignored.md"), "# Ignored\n");

    const firstBuild = await buildDocumentationSite({ projectRoot });

    expect(firstBuild.sourceCount).toBe(3);
    await expect(stat(join(projectRoot, "README.html"))).resolves.toBeTruthy();
    await expect(stat(join(projectRoot, ".agents", "notes.html"))).resolves.toBeTruthy();
    await expect(stat(join(projectRoot, "docs", "guide.html"))).resolves.toBeTruthy();
    await expect(stat(join(projectRoot, "index.html"))).resolves.toBeTruthy();
    await expect(stat(join(projectRoot, ".resona-docs", "styles.css"))).resolves.toBeTruthy();
    await expect(stat(join(projectRoot, "node_modules", "ignored.html"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(stat(join(projectRoot, "dist", "ignored.html"))).rejects.toMatchObject({
      code: "ENOENT",
    });

    const readmeHtml = await readFile(join(projectRoot, "README.html"), "utf8");
    expect(readmeHtml).toContain('<h1 id="resona">Resona</h1>');
    expect(readmeHtml).toContain("A code-first music framework.");

    const firstOutput = await readGeneratedFiles(projectRoot);
    const secondBuild = await buildDocumentationSite({ projectRoot });
    const secondOutput = await readGeneratedFiles(projectRoot);

    expect(secondBuild).toEqual(firstBuild);
    expect(secondOutput).toEqual(firstOutput);
  });
});

const readGeneratedFiles = async (
  projectRoot: string,
): Promise<Readonly<Record<string, string>>> => {
  const paths = [
    "README.html",
    ".agents/notes.html",
    "docs/guide.html",
    "index.html",
    ".resona-docs/styles.css",
  ];
  return Object.fromEntries(
    await Promise.all(
      paths.map(async (path) => [path, await readFile(join(projectRoot, path), "utf8")] as const),
    ),
  );
};
