import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { runDocumentationBuild } from "./cli.js";

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
    await copyMarkdownFixture(projectRoot);
    await mkdir(join(projectRoot, "node_modules"), { recursive: true });
    await mkdir(join(projectRoot, "dist"), { recursive: true });
    await writeFile(join(projectRoot, "node_modules", "ignored.md"), "# Ignored\n");
    await writeFile(join(projectRoot, "dist", "ignored.md"), "# Ignored\n");
    await expect(stat(join(projectRoot, "fixture", "README.html"))).rejects.toMatchObject({
      code: "ENOENT",
    });

    const firstBuild = await runDocumentationBuild(projectRoot);

    expect(firstBuild.sourceCount).toBe(3);
    await expect(stat(join(projectRoot, "fixture", "README.html"))).resolves.toBeTruthy();
    await expect(stat(join(projectRoot, "fixture", ".agents", "notes.html"))).resolves.toBeTruthy();
    await expect(stat(join(projectRoot, "fixture", "docs", "guide.html"))).resolves.toBeTruthy();
    await expect(stat(join(projectRoot, "index.html"))).resolves.toBeTruthy();
    await expect(stat(join(projectRoot, ".resona-docs", "styles.css"))).resolves.toBeTruthy();
    await expect(stat(join(projectRoot, "node_modules", "ignored.html"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(stat(join(projectRoot, "dist", "ignored.html"))).rejects.toMatchObject({
      code: "ENOENT",
    });

    const readmeHtml = await readFile(join(projectRoot, "fixture", "README.html"), "utf8");
    expect(readmeHtml).toContain('<h1 id="resona-docs-fixture">Resona docs fixture</h1>');
    expect(readmeHtml).toContain("A checked-in fixture for the static documentation bootstrap.");

    const firstOutput = await readGeneratedFiles(projectRoot);
    const secondBuild = await runDocumentationBuild(projectRoot);
    const secondOutput = await readGeneratedFiles(projectRoot);

    expect(secondBuild).toEqual(firstBuild);
    expect(secondOutput).toEqual(firstOutput);
  });

  it("orders paths with a locale-independent comparator", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "resona-docs-order-test-"));
    temporaryRoots.push(projectRoot);
    await writeFile(join(projectRoot, "a.md"), "# A\n");
    await writeFile(join(projectRoot, "b.md"), "# B\n");
    await writeFile(join(projectRoot, "ä.md"), "# Umlaut\n");

    await runDocumentationBuild(projectRoot);

    const indexHtml = await readFile(join(projectRoot, "index.html"), "utf8");
    expect(indexHtml.indexOf('href="a.html"')).toBeLessThan(indexHtml.indexOf('href="b.html"'));
    expect(indexHtml.indexOf('href="b.html"')).toBeLessThan(indexHtml.indexOf('href="ä.html"'));
  });

  it("rejects a root index Markdown source", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "resona-docs-index-test-"));
    temporaryRoots.push(projectRoot);
    await writeFile(join(projectRoot, "index.md"), "# Reserved\n");

    await expect(runDocumentationBuild(projectRoot)).rejects.toThrow(
      "The root index.md is reserved",
    );
  });

  it("preserves GFM, frontmatter, links, images, and safe HTML", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "resona-docs-semantics-test-"));
    temporaryRoots.push(projectRoot);
    await copyFixture(projectRoot, "semantics", ["README.md", "guide.md", "image.svg"]);

    const result = await runDocumentationBuild(projectRoot);

    expect(result.sourceCount).toBe(2);
    const readmeHtml = await readFile(join(projectRoot, "fixture", "README.html"), "utf8");
    expect(readmeHtml).toContain("<table>");
    expect(readmeHtml).toContain("<blockquote>");
    expect(readmeHtml).toContain("<ul>");
    expect(readmeHtml).toContain('<a href="guide.html#repeated">guide</a>');
    expect(readmeHtml).toContain('<img src="image.svg" alt="Logo" />');
    expect(readmeHtml).toContain("<details>");
    expect(readmeHtml).toContain("status: accepted");
    expect(readmeHtml).toContain('<span class="token keyword">const</span>');
    expect(readmeHtml).toContain('class="language-mermaid"');
    expect(readmeHtml).toContain("&lt;script&gt;");
    expect(readmeHtml).toContain('<span class="note">Safe</span>');

    const guideHtml = await readFile(join(projectRoot, "fixture", "guide.html"), "utf8");
    expect(guideHtml).toContain('<h2 id="repeated">Repeated</h2>');
    expect(guideHtml).toContain('<h2 id="repeated-1">Repeated</h2>');
    expect(guideHtml).toContain('<h2 id="api_v2">API_V2</h2>');
  });

  it("renders a navigable, accessible documentation shell", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "resona-docs-shell-test-"));
    temporaryRoots.push(projectRoot);
    await copyMarkdownFixture(projectRoot);

    await runDocumentationBuild(projectRoot);

    const guideHtml = await readFile(join(projectRoot, "fixture", "docs", "guide.html"), "utf8");
    const styles = await readFile(join(projectRoot, ".resona-docs", "styles.css"), "utf8");
    expect(guideHtml).toContain('<a class="skip-link" href="#content">Saltar al contenido</a>');
    expect(guideHtml).toContain('<aside class="docs-sidebar"');
    expect(guideHtml).toContain('<nav aria-label="Documentación">');
    expect(guideHtml).toContain('aria-label="Breadcrumb"');
    expect(guideHtml).toContain('aria-current="page"');
    expect(guideHtml).toContain('aria-label="En esta página"');
    expect(guideHtml).toContain('href="guide.md"');
    expect(guideHtml).toContain('href="../README.html"');
    expect(guideHtml).toContain('href="#top"');
    expect(guideHtml).toContain('id="theme-select"');
    expect(guideHtml).toContain("localStorage");
    expect(guideHtml).toContain("IntersectionObserver");
    expect(styles).toContain("prefers-color-scheme");
  });

  it("derives navigation categories from repository paths", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "resona-docs-category-test-"));
    temporaryRoots.push(projectRoot);
    const sources = [
      ["README.md", "# Root\n"],
      ["misc.md", "# Other\n"],
      ["docs/adr/decision.md", "# ADR\n"],
      ["docs/research/note.md", "# Research\n"],
      [".agents/skills/demo/SKILL.md", "# Agent skill\n"],
      ["packages/foo/CONTEXT.md", "# Package context\n"],
    ] as const;
    await Promise.all(
      sources.map(async ([path, source]) => {
        const target = join(projectRoot, path);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, source);
      }),
    );

    await runDocumentationBuild(projectRoot);

    const indexHtml = await readFile(join(projectRoot, "index.html"), "utf8");
    for (const category of ["adr", "research", "agent-skill", "package-context", "root", "other"]) {
      expect(indexHtml).toContain(`data-category="${category}"`);
    }
  });

  it("rejects invalid local references", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "resona-docs-reference-test-"));
    temporaryRoots.push(projectRoot);
    await writeFile(join(projectRoot, "README.md"), "# Broken\n\n[missing](missing.md)\n");

    await expect(runDocumentationBuild(projectRoot)).rejects.toThrow("missing.md");
  });

  it("rejects invalid local images", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "resona-docs-image-test-"));
    temporaryRoots.push(projectRoot);
    await writeFile(join(projectRoot, "README.md"), "# Broken\n\n![missing](missing.svg)\n");

    await expect(runDocumentationBuild(projectRoot)).rejects.toThrow("missing.svg");
  });

  it("rejects unresolved GFM reference labels", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "resona-docs-reference-label-test-"));
    temporaryRoots.push(projectRoot);
    await writeFile(
      join(projectRoot, "README.md"),
      "# Broken\n\n[missing][unknown-label]\n\n![missing][unknown-image]\n",
    );

    await expect(runDocumentationBuild(projectRoot)).rejects.toThrow("unknown-label");
  });

  it("rejects unresolved shortcut references", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "resona-docs-shortcut-reference-test-"));
    temporaryRoots.push(projectRoot);
    await writeFile(join(projectRoot, "README.md"), "# Broken\n\n[missing]\n");

    await expect(runDocumentationBuild(projectRoot)).rejects.toThrow("missing");
  });

  it("ignores reference-shaped text in literal blocks", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "resona-docs-literal-reference-test-"));
    temporaryRoots.push(projectRoot);
    await writeFile(
      join(projectRoot, "README.md"),
      "# Literal\n\n    [x][missing]\n\n<div>\n[x][missing]\n</div>\n",
    );

    await expect(runDocumentationBuild(projectRoot)).resolves.toMatchObject({ sourceCount: 1 });
  });

  it("preserves escaped references and autolink text", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "resona-docs-reference-literal-test-"));
    temporaryRoots.push(projectRoot);
    await writeFile(
      join(projectRoot, "README.md"),
      [
        "# Literal",
        "",
        String.raw`\[missing]`,
        String.raw`\[missing][unknown-label]`,
        "<https://example.com/[missing]>",
        "<span>[inside-html]</span>",
      ].join("\n"),
    );

    await expect(runDocumentationBuild(projectRoot)).resolves.toMatchObject({ sourceCount: 1 });
  });

  it("does not hide references after void inline HTML", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "resona-docs-reference-void-html-test-"));
    temporaryRoots.push(projectRoot);
    await writeFile(join(projectRoot, "README.md"), "# Broken\n\nprefix <br> [missing]\n");

    await expect(runDocumentationBuild(projectRoot)).rejects.toThrow("missing");
  });

  it("preserves task-list markers", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "resona-docs-task-list-test-"));
    temporaryRoots.push(projectRoot);
    await writeFile(join(projectRoot, "README.md"), "# Checklist\n\n- [ ] Todo\n- [x] Done\n");

    await expect(runDocumentationBuild(projectRoot)).resolves.toMatchObject({ sourceCount: 1 });
  });

  it.each(["missing.foo", "missing!", "missing/foo", "x"])(
    "rejects unresolved shortcut labels with punctuation: %s",
    async (label) => {
      const projectRoot = await mkdtemp(join(tmpdir(), "resona-docs-shortcut-label-test-"));
      temporaryRoots.push(projectRoot);
      await writeFile(join(projectRoot, "README.md"), `# Broken\n\n[${label}]\n`);

      await expect(runDocumentationBuild(projectRoot)).rejects.toThrow(label);
    },
  );

  it("rejects invalid frontmatter", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "resona-docs-frontmatter-test-"));
    temporaryRoots.push(projectRoot);
    await writeFile(
      join(projectRoot, "README.md"),
      "---\nstatus: [unterminated\n---\n\n# Invalid\n",
    );

    await expect(runDocumentationBuild(projectRoot)).rejects.toThrow("frontmatter");
  });
});

const readGeneratedFiles = async (
  projectRoot: string,
): Promise<Readonly<Record<string, string>>> => {
  const paths = [
    "fixture/README.html",
    "fixture/.agents/notes.html",
    "fixture/docs/guide.html",
    "index.html",
    ".resona-docs/styles.css",
  ];
  return Object.fromEntries(
    await Promise.all(
      paths.map(async (path) => [path, await readFile(join(projectRoot, path), "utf8")] as const),
    ),
  );
};

const copyMarkdownFixture = async (projectRoot: string): Promise<void> => {
  await copyFixture(projectRoot, "basic", ["README.md", ".agents/notes.md", "docs/guide.md"]);
};

const copyFixture = async (
  projectRoot: string,
  fixtureName: string,
  paths: readonly string[],
): Promise<void> => {
  await Promise.all(
    paths.map(async (path) => {
      const target = join(projectRoot, "fixture", path);
      await mkdir(dirname(target), { recursive: true });
      const source = await readFile(
        new URL(`../test/fixtures/${fixtureName}/${path}`, import.meta.url),
      );
      await writeFile(target, source);
    }),
  );
};
