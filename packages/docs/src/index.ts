import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, relative, resolve } from "node:path";

import { format as formatWithPrettier, resolveConfig } from "prettier";

const excludedDirectories = new Set([
  ".git",
  ".resona-docs",
  "build",
  "coverage",
  "dist",
  "node_modules",
]);

const styles = `:root {
  color-scheme: light dark;
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  line-height: 1.6;
  background: #f7f7f5;
  color: #202124;
}

@media (prefers-color-scheme: dark) {
  :root {
    background: #151515;
    color: #eeeeec;
  }
}

body {
  margin: 0;
}

main {
  box-sizing: border-box;
  max-width: 72rem;
  margin: 0 auto;
  padding: 3rem 1.5rem 5rem;
}

article {
  max-width: 52rem;
  margin: 0 auto;
}

.source-path {
  margin: 0 0 2rem;
  color: #707070;
  font: 0.875rem ui-monospace, SFMono-Regular, Menlo, monospace;
}

h1,
h2,
h3,
h4,
h5,
h6 {
  line-height: 1.2;
}

a {
  color: #7357c7;
}

pre {
  overflow: auto;
  padding: 1rem;
  border-radius: 0.75rem;
  background: #e8e8e4;
}

@media (prefers-color-scheme: dark) {
  pre {
    background: #252525;
  }
}

code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

li + li {
  margin-top: 0.25rem;
}
`;

export type BuildDocumentationSiteOptions = Readonly<{
  projectRoot: string;
}>;

export type BuildDocumentationSiteResult = Readonly<{
  generatedFiles: readonly string[];
  sourceCount: number;
}>;

type MarkdownDocument = Readonly<{
  body: string;
  relativePath: string;
  sourcePath: string;
  title: string;
}>;

export const buildDocumentationSite = async (
  options: BuildDocumentationSiteOptions,
): Promise<BuildDocumentationSiteResult> => {
  const projectRoot = resolve(options.projectRoot);
  const sourcePaths = await discoverMarkdown(projectRoot);
  const documents = await Promise.all(
    sourcePaths.map(async (sourcePath) => {
      const source = await readFile(sourcePath, "utf8");
      const relativePath = toPosix(relative(projectRoot, sourcePath));
      return {
        body: renderMarkdown(source),
        relativePath,
        sourcePath,
        title: titleFrom(source, sourcePath),
      } satisfies MarkdownDocument;
    }),
  );
  const generatedFiles: string[] = [];

  await mkdir(join(projectRoot, ".resona-docs"), { recursive: true });
  await writeFormattedFile(join(projectRoot, ".resona-docs", "styles.css"), styles);
  generatedFiles.push(".resona-docs/styles.css");

  for (const document of documents) {
    const outputPath = join(projectRoot, document.relativePath.replace(/\.md$/u, ".html"));
    await writeFormattedFile(outputPath, renderPage(projectRoot, document));
    generatedFiles.push(toPosix(relative(projectRoot, outputPath)));
  }

  await writeFormattedFile(join(projectRoot, "index.html"), renderIndex(projectRoot, documents));
  generatedFiles.push("index.html");

  return {
    generatedFiles: generatedFiles.sort(),
    sourceCount: documents.length,
  };
};

const writeFormattedFile = async (path: string, source: string): Promise<void> => {
  const config = (await resolveConfig(path)) ?? {};
  const formatted = await formatWithPrettier(source, { ...config, filepath: path });
  await writeFile(path, formatted);
};

const discoverMarkdown = async (projectRoot: string): Promise<string[]> => {
  const paths: string[] = [];

  const visit = async (directory: string): Promise<void> => {
    const entries = (await readdir(directory, { withFileTypes: true })).sort((left, right) =>
      left.name.localeCompare(right.name),
    );

    for (const entry of entries) {
      if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;
      const entryPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(entryPath);
      } else if (entry.isFile() && extname(entry.name) === ".md") {
        paths.push(entryPath);
      }
    }
  };

  await visit(projectRoot);
  return paths.sort((left, right) => left.localeCompare(right));
};

const renderPage = (projectRoot: string, document: MarkdownDocument): string => {
  const outputPath = join(projectRoot, document.relativePath.replace(/\.md$/u, ".html"));
  const stylesheet = toPosix(
    relative(dirname(outputPath), join(projectRoot, ".resona-docs", "styles.css")),
  );
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(document.title)} · Resona</title>
    <link rel="stylesheet" href="${stylesheet}">
  </head>
  <body>
    <main>
      <p class="source-path">${escapeHtml(document.relativePath)}</p>
      <article>
${document.body}
      </article>
    </main>
  </body>
</html>
`;
};

const renderIndex = (projectRoot: string, documents: readonly MarkdownDocument[]): string => {
  const links = documents
    .map((document) => {
      const href = toPosix(document.relativePath.replace(/\.md$/u, ".html"));
      return `        <li><a href="${href}">${escapeHtml(document.title)}</a> <code>${escapeHtml(document.relativePath)}</code></li>`;
    })
    .join("\n");
  const stylesheet = toPosix(
    relative(projectRoot, join(projectRoot, ".resona-docs", "styles.css")),
  );
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Resona documentation</title>
    <link rel="stylesheet" href="${stylesheet}">
  </head>
  <body>
    <main>
      <article>
        <h1>Resona documentation</h1>
        <p>Generated from ${documents.length} Markdown files.</p>
        <ul>
${links}
        </ul>
      </article>
    </main>
  </body>
</html>
`;
};

const renderMarkdown = (source: string): string => {
  const output: string[] = [];
  const paragraph: string[] = [];
  let inCode = false;

  const flushParagraph = (): void => {
    if (paragraph.length === 0) return;
    output.push(`        <p>${escapeHtml(paragraph.join(" "))}</p>`);
    paragraph.length = 0;
  };

  for (const line of source.split(/\r?\n/u)) {
    const fence = /^\s*```(\S*)\s*$/u.exec(line);
    if (fence !== null) {
      flushParagraph();
      if (inCode) {
        output.push("        </code></pre>");
        inCode = false;
      } else {
        const codeLanguage = fence[1] ?? "";
        const className =
          codeLanguage === "" ? "" : ` class="language-${escapeHtml(codeLanguage)}"`;
        output.push(`        <pre><code${className}>`);
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      output.push(escapeHtml(line));
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/u.exec(line);
    if (heading !== null) {
      flushParagraph();
      const depth = heading[1]?.length ?? 1;
      const text = heading[2] ?? "";
      output.push(`        <h${depth} id="${slugify(text)}">${escapeHtml(text)}</h${depth}>`);
    } else if (line.trim() === "") {
      flushParagraph();
    } else {
      paragraph.push(line.trim());
    }
  }

  flushParagraph();
  if (inCode) output.push("        </code></pre>");
  return output.join("\n");
};

const titleFrom = (source: string, sourcePath: string): string => {
  const heading = /^#\s+(.+)$/mu.exec(source);
  return heading?.[1]?.trim() ?? basename(sourcePath, extname(sourcePath));
};

const slugify = (value: string): string =>
  value
    .normalize("NFKD")
    .replace(/\p{Mark}/gu, "")
    .toLocaleLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/gu, "");

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const toPosix = (value: string): string => value.replaceAll("\\", "/");
