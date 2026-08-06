import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { runInNewContext } from "node:vm";

import { afterEach, describe, expect, it } from "vitest";
import { runDocumentationBuild, runDocumentationClean } from "./cli.js";

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
    await expect(stat(join(projectRoot, ".resona-docs", "search-index.js"))).resolves.toBeTruthy();
    await expect(stat(join(projectRoot, ".resona-docs", "docs.js"))).resolves.toBeTruthy();
    await expect(stat(join(projectRoot, ".resona-docs", "manifest.json"))).resolves.toBeTruthy();
    await expect(stat(join(projectRoot, "node_modules", "ignored.html"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(stat(join(projectRoot, "dist", "ignored.html"))).rejects.toMatchObject({
      code: "ENOENT",
    });

    const readmeHtml = await readFile(join(projectRoot, "fixture", "README.html"), "utf8");
    const guideHtml = await readFile(join(projectRoot, "fixture", "docs", "guide.html"), "utf8");
    const indexHtml = await readFile(join(projectRoot, "index.html"), "utf8");
    expect(readmeHtml).toContain('<h1 id="resona-docs-fixture">Resona docs fixture</h1>');
    expect(readmeHtml).toContain("A checked-in fixture for the static documentation bootstrap.");
    expect(readmeHtml).toContain('aria-current="page"');
    expect(guideHtml).toContain("<details open>");
    expect(indexHtml).toContain("All documents");

    const firstOutput = await readGeneratedFiles(projectRoot);
    expect(firstOutput[".resona-docs/docs.js"]).toContain("window.name");
    expect(firstOutput[".resona-docs/docs.js"]).toContain("IntersectionObserver");
    expect(firstOutput[".resona-docs/docs.js"]).toContain("navigator.clipboard");
    expect(firstOutput[".resona-docs/styles.css"]).toContain("@media (max-width: 52rem)");
    expect(firstOutput[".resona-docs/styles.css"]).toContain(':root[data-theme="dark"]');
    expect(firstBuild.orphanedFiles).toEqual([]);
    expect(firstOutput[".resona-docs/manifest.json"]).toContain('"version": 1');
    expect(firstOutput[".resona-docs/manifest.json"]).toMatch(/"sha256": "[a-f0-9]{64}"/u);
    const secondBuild = await runDocumentationBuild(projectRoot);
    const secondOutput = await readGeneratedFiles(projectRoot);

    expect(secondBuild).toEqual(firstBuild);
    expect(secondOutput).toEqual(firstOutput);
  });

  it("rejects a root index Markdown source", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "resona-docs-index-test-"));
    temporaryRoots.push(projectRoot);
    await writeFile(join(projectRoot, "index.md"), "# Reserved\n");

    await expect(runDocumentationBuild(projectRoot)).rejects.toThrow(
      "The root index.md is reserved",
    );
  });

  it("does not publish partial output when a rebuild fails validation", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "resona-docs-atomic-test-"));
    temporaryRoots.push(projectRoot);
    await writeFile(join(projectRoot, "README.md"), "# Docs\n");

    await runDocumentationBuild(projectRoot);
    const previousHtml = await readFile(join(projectRoot, "README.html"), "utf8");
    const previousManifest = await readFile(
      join(projectRoot, ".resona-docs", "manifest.json"),
      "utf8",
    );
    await writeFile(join(projectRoot, "README.md"), "# Docs\n\n[Broken](missing.md)\n");

    await expect(runDocumentationBuild(projectRoot)).rejects.toThrow("missing.md");
    await expect(readFile(join(projectRoot, "README.html"), "utf8")).resolves.toBe(previousHtml);
    await expect(
      readFile(join(projectRoot, ".resona-docs", "manifest.json"), "utf8"),
    ).resolves.toBe(previousManifest);
  });

  it("rejects a manual HTML file instead of overwriting it", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "resona-docs-manual-html-test-"));
    temporaryRoots.push(projectRoot);
    await writeFile(join(projectRoot, "README.md"), "# Docs\n");
    await writeFile(join(projectRoot, "README.html"), "<p>manual</p>\n");

    await expect(runDocumentationBuild(projectRoot)).rejects.toThrow("manual output conflict");
    await expect(readFile(join(projectRoot, "README.html"), "utf8")).resolves.toBe(
      "<p>manual</p>\n",
    );
    await expect(stat(join(projectRoot, ".resona-docs", "manifest.json"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("reports orphaned outputs and cleans only manifest-registered files", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "resona-docs-clean-test-"));
    temporaryRoots.push(projectRoot);
    await writeFile(join(projectRoot, "README.md"), "# Docs\n");
    await writeFile(join(projectRoot, "old.md"), "# Old\n");
    await writeFile(join(projectRoot, "manual.html"), "manual\n");

    await runDocumentationBuild(projectRoot);
    await rm(join(projectRoot, "old.md"));
    const rebuild = await runDocumentationBuild(projectRoot);

    expect(rebuild.orphanedFiles).toEqual(["old.html"]);
    await expect(stat(join(projectRoot, "old.html"))).resolves.toBeTruthy();
    const dryRun = await runDocumentationClean(projectRoot, true);
    expect(dryRun.dryRun).toBe(true);
    expect(dryRun.removedFiles).toContain("old.html");
    await expect(stat(join(projectRoot, "old.html"))).resolves.toBeTruthy();

    const clean = await runDocumentationClean(projectRoot);
    expect(clean.dryRun).toBe(false);
    expect(clean.removedFiles).toContain("old.html");
    await expect(stat(join(projectRoot, "old.html"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(stat(join(projectRoot, ".resona-docs", "manifest.json"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(stat(join(projectRoot, "README.md"))).resolves.toBeTruthy();
    await expect(stat(join(projectRoot, "manual.html"))).resolves.toBeTruthy();
  });

  it("fails clean safely when the manifest is missing or inconsistent", async () => {
    const missingRoot = await mkdtemp(join(tmpdir(), "resona-docs-clean-missing-test-"));
    temporaryRoots.push(missingRoot);
    await writeFile(join(missingRoot, "README.html"), "manual\n");
    await expect(runDocumentationClean(missingRoot)).rejects.toThrow("without");
    await expect(stat(join(missingRoot, "README.html"))).resolves.toBeTruthy();

    const inconsistentRoot = await mkdtemp(join(tmpdir(), "resona-docs-clean-inconsistent-test-"));
    temporaryRoots.push(inconsistentRoot);
    await writeFile(join(inconsistentRoot, "README.md"), "# Docs\n");
    await runDocumentationBuild(inconsistentRoot);
    await writeFile(join(inconsistentRoot, "README.html"), "manual edit\n");

    await expect(runDocumentationClean(inconsistentRoot)).rejects.toThrow("hash mismatch");
    await expect(stat(join(inconsistentRoot, "README.html"))).resolves.toBeTruthy();
  });

  it("renders GFM, frontmatter, safe HTML, links, images, and highlighted code", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "resona-docs-markdown-test-"));
    temporaryRoots.push(projectRoot);
    await mkdir(join(projectRoot, "docs", "assets"), { recursive: true });
    await writeFile(join(projectRoot, "docs", "guide.md"), "# Guide\n\n## Section\n");
    await writeFile(
      join(projectRoot, "docs", "reference.md"),
      "# Reference\n\n[Guide](guide.md)\n",
    );
    await writeFile(join(projectRoot, "docs", "assets", "logo.svg"), "<svg></svg>\n");
    await writeFile(
      join(projectRoot, "README.md"),
      `---
title: Markdown tour
status: accepted
date: 2026-08-06
---

# Document

## Repeat!
## Repeat!

> # Nested

# Outer

## 😀 Emoji

> A blockquote.

- [x] A task
- A list item

| Name | Value |
| --- | ---: |
| answer | 42 |

[Guide](docs/guide.md#section) and [notes](notes.txt).

[External](https://example.com/docs).

![Logo](docs/assets/logo.svg)

\`\`\`typescript
const answer = 42;
\`\`\`

<details><summary>More</summary>Safe details.</details>
`,
    );
    await writeFile(join(projectRoot, "notes.txt"), "plain text\n");

    await runDocumentationBuild(projectRoot);

    const html = await readFile(join(projectRoot, "README.html"), "utf8");
    const guideHtml = await readFile(join(projectRoot, "docs", "guide.html"), "utf8");
    const searchIndex = await readFile(
      join(projectRoot, ".resona-docs", "search-index.js"),
      "utf8",
    );
    expect(html).toContain("Markdown tour");
    expect(html).toContain(
      '<code class="language-yaml">---\ntitle: Markdown tour\nstatus: accepted\ndate: 2026-08-06\n---\n</code>',
    );
    expect(html).toContain('class="badge badge-status">accepted</span>');
    expect(html).toContain('class="badge badge-date">2026-08-06</span>');
    expect(html).toContain("language-yaml");
    expect(html).toContain('id="repeat"');
    expect(html).toContain('id="repeat-1"');
    expect(html).toContain('id="nested"');
    expect(html).toContain('id="outer"');
    expect(html).toContain('id="-emoji"');
    expect(html).toContain("<blockquote>");
    expect(html).toContain("<table>");
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('href="docs/guide.html#section"');
    expect(html).toContain('href="notes.txt"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('src="docs/assets/logo.svg" alt="Logo"');
    expect(html).toContain('class="hljs language-typescript"');
    expect(html).toContain("hljs-keyword");
    expect(html).toContain('class="copy-code-button"');
    expect(html).toContain('data-copy-code="true"');
    expect(html).toContain("<details>");
    expect(html).toContain('class="skip-link" href="#content"');
    expect(html).toContain('aria-label="Breadcrumb"');
    expect(html).toContain('href="README.md">View Markdown source</a>');
    expect(html).toContain('aria-label="On this page"');
    expect(html).toContain('href="#repeat"');
    expect(html).toContain('class="page-navigation"');
    expect(html).toContain('id="theme-select"');
    expect(html).toContain('id="docs-search"');
    expect(html).toContain('id="search-category"');
    expect(html).toContain('id="search-directory"');
    expect(html).toContain('src=".resona-docs/search-index.js"');
    expect(html).toContain('src=".resona-docs/docs.js"');
    expect(guideHtml).toContain('id="backlinks"');
    expect(guideHtml).toContain('href="../README.html"');
    expect(guideHtml).toContain('href="reference.html"');
    expect(searchIndex).toContain("Markdown tour");
    expect(searchIndex).toContain("docs/guide.html");
    expect(searchIndex).toContain("A task");
    expect(searchIndex).toContain("answer");
    expect(searchIndex).toContain("const answer = 42");

    const searchRuntime = loadSearchRuntime(searchIndex);
    expect(searchRuntime.normalizeText("ÁUDIO CAFÉ")).toBe("audio cafe");
    const searchEntries = [
      {
        body: "A body-only reference to café.",
        category: "Other",
        code: "",
        directory: "other",
        headings: [],
        href: "other/body.html",
        path: "other/body.md",
        snippet: "A body-only reference to café.",
        title: "Other",
      },
      {
        body: `${"context ".repeat(30)}café appears here near the end.`,
        category: "Research",
        code: "const answer = 42;",
        directory: "docs",
        headings: ["Concepts"],
        href: "docs/cafe.html",
        path: "docs/cafe.md",
        snippet: "café appears here near the end.",
        title: "Café guide",
      },
    ] as const;
    const results = searchRuntime.search(searchEntries, "CAFE", "", "");
    expect(results.map((result) => result.entry.title)).toEqual(["Café guide", "Other"]);
    expect(results[0]?.snippet).toContain("café appears here");
    expect(results[0]?.snippet).toContain("...");
    expect(searchRuntime.search(searchEntries, "cafe", "Research", "docs")).toHaveLength(1);
    expect(searchRuntime.search(searchEntries, "cafe", "Other", "docs")).toHaveLength(0);
  });

  it("escapes generated navigation paths", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "resona-docs-path-escaping-test-"));
    temporaryRoots.push(projectRoot);
    await mkdir(join(projectRoot, "docs"), { recursive: true });
    await writeFile(join(projectRoot, "docs", 'odd&"name.md'), "# Odd path\n");

    await runDocumentationBuild(projectRoot);

    const indexHtml = await readFile(join(projectRoot, "index.html"), "utf8");
    expect(indexHtml).toContain("href='docs/odd&amp;\"name.html'");
  });

  it("renders the navigable shell and repository categories as static HTML", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "resona-docs-shell-test-"));
    temporaryRoots.push(projectRoot);
    const files = [
      ["README.md", "# Root\n\n## Section\n"],
      ["docs/adr/0001.md", "# ADR\n"],
      ["docs/research/study.md", "# Research\n"],
      [".agents/skills/demo/SKILL.md", "# Skill\n"],
      ["packages/demo/CONTEXT.md", "# Package\n"],
      ["other/note.md", "# Other\n"],
    ] as const;
    await Promise.all(
      files.map(async ([path, source]) => {
        const target = join(projectRoot, path);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, source);
      }),
    );

    await runDocumentationBuild(projectRoot);

    const indexHtml = await readFile(join(projectRoot, "index.html"), "utf8");
    const adrHtml = await readFile(join(projectRoot, "docs", "adr", "0001.html"), "utf8");
    expect(indexHtml).toContain("<summary>adr</summary>");
    expect(indexHtml).toContain("<summary>research</summary>");
    expect(indexHtml).toContain("<summary>.agents</summary>");
    expect(indexHtml).toContain("<summary>packages</summary>");
    expect(indexHtml).toContain("<summary>other</summary>");
    expect(adrHtml).toContain('class="category-badge">ADR</span>');
    expect(adrHtml).toContain('aria-label="Breadcrumb"');
    expect(adrHtml).toContain('class="source-link"');
    expect(adrHtml).toContain('class="page-navigation"');
    expect(adrHtml).toContain('class="back-to-top"');
    expect(adrHtml).toContain('src="../../.resona-docs/docs.js"');
  });

  it("fails on invalid YAML frontmatter", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "resona-docs-yaml-test-"));
    temporaryRoots.push(projectRoot);
    await writeFile(join(projectRoot, "README.md"), "---\nstatus: [broken\n---\n# Docs\n");

    await expect(runDocumentationBuild(projectRoot)).rejects.toThrow("Invalid YAML frontmatter");
  });

  it("fails on broken local links and images", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "resona-docs-reference-test-"));
    temporaryRoots.push(projectRoot);
    await writeFile(
      join(projectRoot, "README.md"),
      "# Docs\n\n[Missing](missing.md)\n\n[Broken fragment](target.md#missing)\n\n![Missing](missing.svg)\n",
    );
    await writeFile(join(projectRoot, "target.md"), "# Target\n");

    await expect(runDocumentationBuild(projectRoot)).rejects.toThrow("missing.md");
    await expect(runDocumentationBuild(projectRoot)).rejects.toThrow("broken fragment");
    await expect(runDocumentationBuild(projectRoot)).rejects.toThrow("missing.svg");
  });

  it("validates fragments in local HTML files", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "resona-docs-html-fragment-test-"));
    temporaryRoots.push(projectRoot);
    await writeFile(
      join(projectRoot, "README.md"),
      "# Docs\n\n[Present](page.html#present)\n\n[Missing](page.html#missing)\n",
    );
    await writeFile(join(projectRoot, "page.html"), '<h1 id="present">Present</h1>\n');

    await expect(runDocumentationBuild(projectRoot)).rejects.toThrow(
      "broken fragment in page.html#missing",
    );
  });

  it("validates generated HTML fragments from current Markdown", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "resona-docs-generated-fragment-test-"));
    temporaryRoots.push(projectRoot);
    await writeFile(join(projectRoot, "README.md"), "# Docs\n");
    await writeFile(join(projectRoot, "guide.md"), "# New heading\n");
    await runDocumentationBuild(projectRoot);
    await writeFile(join(projectRoot, "README.md"), "# Docs\n\n[Guide](guide.html#new-heading)\n");

    await expect(runDocumentationBuild(projectRoot)).resolves.toMatchObject({ sourceCount: 2 });
  });

  it("allows only justified references listed in the versioned allowlist", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "resona-docs-allowlist-test-"));
    temporaryRoots.push(projectRoot);
    await mkdir(join(projectRoot, ".resona-docs"), { recursive: true });
    await writeFile(
      join(projectRoot, "README.md"),
      "# Docs\n\n[Future](missing.md)\n\n[Future section](target.md#future)\n\n![Future image](missing.svg)\n",
    );
    await writeFile(join(projectRoot, "target.md"), "# Target\n");
    await writeFile(
      join(projectRoot, ".resona-docs", "reference-allowlist.json"),
      `${JSON.stringify(
        {
          version: 1,
          entries: [
            { kind: "link", source: "README.md", target: "missing.md", reason: "Planned page." },
            {
              kind: "fragment",
              source: "README.md",
              target: "target.md#future",
              reason: "Planned section.",
            },
            { kind: "image", source: "README.md", target: "missing.svg", reason: "Planned asset." },
          ],
        },
        null,
        2,
      )}\n`,
    );

    await expect(runDocumentationBuild(projectRoot)).resolves.toMatchObject({ sourceCount: 2 });
  });

  it("fails on dangerous raw HTML", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "resona-docs-html-test-"));
    temporaryRoots.push(projectRoot);
    await writeFile(join(projectRoot, "README.md"), "# Docs\n\n<script>alert(1)</script>\n");

    await expect(runDocumentationBuild(projectRoot)).rejects.toThrow("unsafe HTML");
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
    ".resona-docs/search-index.js",
    ".resona-docs/docs.js",
    ".resona-docs/manifest.json",
  ];
  return Object.fromEntries(
    await Promise.all(
      paths.map(async (path) => [path, await readFile(join(projectRoot, path), "utf8")] as const),
    ),
  );
};

const copyMarkdownFixture = async (projectRoot: string): Promise<void> => {
  const paths = ["README.md", ".agents/notes.md", "docs/guide.md"];
  await Promise.all(
    paths.map(async (path) => {
      const target = join(projectRoot, "fixture", path);
      await mkdir(dirname(target), { recursive: true });
      const source = await readFile(new URL(`../test/fixtures/basic/${path}`, import.meta.url));
      await writeFile(target, source);
    }),
  );
};

type SearchEntry = Readonly<{
  body: string;
  category: string;
  code: string;
  directory: string;
  headings: readonly string[];
  href: string;
  path: string;
  snippet: string;
  title: string;
}>;

type SearchRuntime = Readonly<{
  normalizeText: (value: string) => string;
  search: (
    entries: readonly SearchEntry[],
    query: string,
    category: string,
    directory: string,
  ) => readonly Readonly<{ entry: SearchEntry; score: number; snippet: string }>[];
}>;

const loadSearchRuntime = (source: string): SearchRuntime => {
  const window: { __RESONA_DOCS_SEARCH_API__?: SearchRuntime } = {};
  runInNewContext(source, { window });
  if (window.__RESONA_DOCS_SEARCH_API__ === undefined) {
    throw new Error("Search runtime was not generated");
  }
  return window.__RESONA_DOCS_SEARCH_API__;
};
