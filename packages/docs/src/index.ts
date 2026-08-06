import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, relative, resolve } from "node:path";

import { load as parseYaml } from "js-yaml";
import MarkdownIt, { type MarkdownItAttribute, type MarkdownItToken } from "markdown-it";
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
  color-scheme: light;
  --bg: #f6f7fb;
  --surface: #ffffff;
  --surface-muted: #eef0f6;
  --text: #202332;
  --muted: #536078;
  --border: #d7dce8;
  --link: #5535a8;
  --accent: #7357c7;
  --accent-soft: #e9e3ff;
  --code-bg: #eef0f6;
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  line-height: 1.6;
  background: var(--bg);
  color: var(--text);
}

:root[data-theme="dark"] {
  color-scheme: dark;
  --bg: #11141c;
  --surface: #1b202b;
  --surface-muted: #252c3a;
  --text: #f1f3f7;
  --muted: #b8c1d2;
  --border: #3a4354;
  --link: #c7b9ff;
  --accent: #b5a1ff;
  --accent-soft: #342a5b;
  --code-bg: #252c3a;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    --bg: #11141c;
    --surface: #1b202b;
    --surface-muted: #252c3a;
    --text: #f1f3f7;
    --muted: #b8c1d2;
    --border: #3a4354;
    --link: #c7b9ff;
    --accent: #b5a1ff;
    --accent-soft: #342a5b;
    --code-bg: #252c3a;
  }
}

* {
  box-sizing: border-box;
}

html {
  scroll-behavior: smooth;
}

body {
  min-width: 18rem;
  margin: 0;
  background: var(--bg);
  color: var(--text);
}

a {
  color: var(--link);
}

a:focus-visible,
button:focus-visible,
select:focus-visible,
summary:focus-visible {
  outline: 0.2rem solid var(--accent);
  outline-offset: 0.2rem;
}

.skip-link {
  position: absolute;
  z-index: 10;
  top: 0.75rem;
  left: 0.75rem;
  padding: 0.5rem 0.75rem;
  border-radius: 0.5rem;
  background: var(--accent);
  color: #fff;
  transform: translateY(-150%);
}

.skip-link:focus {
  transform: translateY(0);
}

.docs-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  max-width: 92rem;
  margin: 0 auto;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid var(--border);
}

.brand {
  font-size: 1.25rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  text-decoration: none;
}

.brand span {
  color: var(--muted);
  font-weight: 500;
}

.theme-control {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--muted);
  font-size: 0.875rem;
}

.theme-control select {
  min-height: 2rem;
  padding: 0.25rem 0.5rem;
  border: 1px solid var(--border);
  border-radius: 0.4rem;
  background: var(--surface);
  color: var(--text);
}

.docs-layout {
  display: grid;
  grid-template-columns: minmax(15rem, 20rem) minmax(0, 1fr);
  gap: 2rem;
  max-width: 92rem;
  margin: 0 auto;
  padding: 1.5rem;
}

.docs-sidebar {
  position: sticky;
  top: 1rem;
  align-self: start;
  max-height: calc(100vh - 2rem);
  overflow: auto;
  padding: 1rem;
  border: 1px solid var(--border);
  border-radius: 0.75rem;
  background: var(--surface);
}

.sidebar-title,
.eyebrow {
  margin: 0 0 0.75rem;
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.navigation-tree ul,
.document-index ul,
.table-of-contents ol,
.breadcrumbs ol {
  margin: 0;
  padding: 0;
  list-style: none;
}

.navigation-tree li + li {
  margin-top: 0.25rem;
}

.nav-directory details {
  border-radius: 0.4rem;
}

.nav-directory summary {
  padding: 0.35rem 0.5rem;
  color: var(--muted);
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 700;
}

.nav-directory > details > ul {
  padding-left: 0.85rem;
}

.nav-document a {
  display: block;
  padding: 0.35rem 0.5rem;
  border-radius: 0.4rem;
  text-decoration: none;
}

.nav-document a:hover,
.nav-current a {
  background: var(--accent-soft);
}

.nav-document-title,
.nav-document-path {
  display: block;
}

.nav-document-title {
  font-size: 0.875rem;
  font-weight: 700;
}

.nav-document-path {
  overflow: hidden;
  color: var(--muted);
  font: 0.7rem ui-monospace, SFMono-Regular, Menlo, monospace;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.docs-main {
  min-width: 0;
  padding: 1rem 0 4rem;
}

.breadcrumbs {
  margin-bottom: 1.5rem;
  color: var(--muted);
  font-size: 0.875rem;
}

.breadcrumbs ol {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.breadcrumbs li + li::before {
  margin-right: 0.35rem;
  content: "/";
  color: var(--border);
}

.page-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.source-path {
  flex-basis: 100%;
  margin: 0;
  color: var(--muted);
  font: 0.8rem ui-monospace, SFMono-Regular, Menlo, monospace;
}

.source-link {
  font-size: 0.875rem;
}

.category-badge {
  display: inline-flex;
  align-items: center;
  min-height: 1.5rem;
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--text);
  font-size: 0.75rem;
  font-weight: 700;
}

.document-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(12rem, 15rem);
  gap: 2rem;
  align-items: start;
}

.doc-content {
  min-width: 0;
  max-width: 55rem;
}

.doc-content h1,
.doc-content h2,
.doc-content h3,
.doc-content h4,
.doc-content h5,
.doc-content h6 {
  scroll-margin-top: 1rem;
  line-height: 1.2;
}

.doc-content h1 {
  margin-top: 0;
  font-size: clamp(1.8rem, 4vw, 2.6rem);
}

.doc-content h2 {
  margin-top: 2.5rem;
}

.doc-content h3 {
  margin-top: 2rem;
}

.doc-content img {
  max-width: 100%;
  height: auto;
}

.doc-content table {
  width: 100%;
  border-collapse: collapse;
}

.doc-content th,
.doc-content td {
  padding: 0.5rem;
  border: 1px solid var(--border);
  text-align: left;
}

.doc-content blockquote {
  margin: 1rem 0;
  padding: 0.25rem 1rem;
  border-left: 0.25rem solid var(--accent);
  color: var(--muted);
}

.doc-content pre {
  overflow: auto;
  padding: 1rem;
  border-radius: 0.75rem;
  background: var(--code-bg);
}

.doc-content code,
.nav-document-path {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.frontmatter {
  margin: 0 0 2rem;
  padding: 1rem;
  border: 1px solid var(--border);
  border-radius: 0.75rem;
  background: var(--surface);
}

.frontmatter-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin: 0 0 0.75rem;
}

.frontmatter-badge {
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
  background: var(--surface-muted);
  font-size: 0.875rem;
}

.table-of-contents {
  position: sticky;
  top: 1rem;
  max-height: calc(100vh - 2rem);
  overflow: auto;
  padding: 1rem;
  border-left: 1px solid var(--border);
  color: var(--muted);
  font-size: 0.875rem;
}

.table-of-contents h2 {
  margin: 0 0 0.5rem;
  color: var(--text);
  font-size: 0.875rem;
}

.table-of-contents li + li {
  margin-top: 0.35rem;
}

.table-of-contents .toc-level-3 {
  padding-left: 0.75rem;
}

.table-of-contents a {
  text-decoration: none;
}

.page-navigation {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  margin-top: 3rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border);
}

.page-nav-link {
  display: block;
  padding: 0.75rem;
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  text-decoration: none;
}

.page-nav-link span,
.page-nav-link strong {
  display: block;
}

.page-nav-link span {
  color: var(--muted);
  font-size: 0.75rem;
  text-transform: uppercase;
}

.page-nav-next {
  text-align: right;
}

.back-to-top {
  display: inline-block;
  margin-top: 1.5rem;
  font-size: 0.875rem;
}

.index-intro {
  max-width: 48rem;
  padding: 2rem 0;
}

.index-intro h1 {
  margin: 0;
  font-size: clamp(2rem, 5vw, 3.5rem);
  line-height: 1.1;
}

.document-index {
  max-width: 64rem;
}

.document-index li {
  display: grid;
  grid-template-columns: max-content minmax(10rem, 1fr) minmax(12rem, 0.8fr);
  gap: 0.75rem;
  align-items: center;
  padding: 0.75rem 0;
  border-top: 1px solid var(--border);
}

.document-index li a {
  font-weight: 700;
}

.document-index code {
  overflow: hidden;
  color: var(--muted);
  font: 0.75rem ui-monospace, SFMono-Regular, Menlo, monospace;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.token.comment {
  color: var(--muted);
}

.token.keyword {
  color: var(--accent);
  font-weight: 700;
}

.token.string {
  color: #237a57;
}

.token.number {
  color: #a35c00;
}

@media (max-width: 64rem) {
  .document-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .table-of-contents {
    position: static;
    max-height: none;
    border-top: 1px solid var(--border);
    border-left: 0;
  }
}

@media (max-width: 48rem) {
  .docs-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .docs-layout {
    display: block;
    padding: 1rem;
  }

  .docs-sidebar {
    position: static;
    max-height: none;
    margin-bottom: 1.5rem;
  }

  .document-index li {
    grid-template-columns: 1fr;
    gap: 0.35rem;
  }

  .page-navigation {
    grid-template-columns: 1fr;
  }

  .page-nav-next {
    text-align: left;
  }
}

@media (prefers-reduced-motion: reduce) {
  html {
    scroll-behavior: auto;
  }
}
`;

const knownCodeLanguages = new Set([
  "bash",
  "css",
  "html",
  "javascript",
  "js",
  "json",
  "jsx",
  "md",
  "shell",
  "text",
  "ts",
  "tsx",
  "typescript",
  "xml",
  "yaml",
  "yml",
]);

const codeKeywords = new Set([
  "async",
  "await",
  "class",
  "const",
  "else",
  "export",
  "extends",
  "from",
  "function",
  "if",
  "implements",
  "import",
  "interface",
  "let",
  "new",
  "return",
  "throw",
  "type",
  "var",
]);

const safeHtmlTags = new Set([
  "abbr",
  "b",
  "br",
  "code",
  "del",
  "details",
  "div",
  "em",
  "i",
  "ins",
  "kbd",
  "mark",
  "p",
  "pre",
  "q",
  "s",
  "samp",
  "small",
  "span",
  "strong",
  "sub",
  "summary",
  "sup",
  "u",
]);

const safeHtmlAttributes = new Set(["class", "id", "open", "role", "title"]);

const htmlVoidTags = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

const escapedLeftBracket = "\uE000";
const escapedRightBracket = "\uE001";

export type BuildDocumentationSiteOptions = Readonly<{
  projectRoot: string;
}>;

export type BuildDocumentationSiteResult = Readonly<{
  generatedFiles: readonly string[];
  sourceCount: number;
}>;

type Frontmatter = Readonly<{
  raw: string;
  values: Readonly<Record<string, unknown>>;
}>;

type DocumentationCategory =
  "adr" | "research" | "agent-skill" | "package-context" | "root" | "other";

type Heading = Readonly<{
  level: 2 | 3;
  slug: string;
  title: string;
}>;

type MarkdownDocument = Readonly<{
  body: string;
  category: DocumentationCategory;
  frontmatter: Frontmatter | null;
  headings: readonly Heading[];
  markdown: string;
  relativePath: string;
  sourcePath: string;
  title: string;
}>;

type DocumentationDocument = Omit<MarkdownDocument, "body">;

type NavigationNode =
  | Readonly<{
      children: readonly NavigationNode[];
      kind: "directory";
      name: string;
      relativePath: string;
    }>
  | Readonly<{
      document: DocumentationDocument;
      kind: "document";
    }>;

type MutableNavigationNode =
  | {
      children: MutableNavigationNode[];
      kind: "directory";
      name: string;
      relativePath: string;
    }
  | {
      document: DocumentationDocument;
      kind: "document";
    };

type DocumentationContext = Readonly<{
  headingsByRelativePath: ReadonlyMap<string, ReadonlySet<string>>;
  navigation: NavigationNode;
  documents: readonly DocumentationDocument[];
  projectRoot: string;
  sourceByRelativePath: ReadonlyMap<string, string>;
}>;

export const buildDocumentationSite = async (
  options: BuildDocumentationSiteOptions,
): Promise<BuildDocumentationSiteResult> => {
  const projectRoot = resolve(options.projectRoot);
  const sourcePaths = await discoverMarkdown(projectRoot);
  if (sourcePaths.some((sourcePath) => relative(projectRoot, sourcePath) === "index.md")) {
    throw new Error("The root index.md is reserved for the generated documentation index.");
  }

  const sourceByRelativePath = new Map(
    sourcePaths.map((sourcePath) => [toPosix(relative(projectRoot, sourcePath)), sourcePath]),
  );
  const documents = await Promise.all(
    sourcePaths.map(async (sourcePath) => {
      const source = await readFile(sourcePath, "utf8");
      const relativePath = toPosix(relative(projectRoot, sourcePath));
      const parsed = parseFrontmatter(source, relativePath);
      return {
        category: categoryForPath(relativePath),
        frontmatter: parsed.frontmatter,
        headings: collectHeadings(parsed.markdown),
        markdown: parsed.markdown,
        relativePath,
        sourcePath,
        title: titleFrom(parsed.markdown, sourcePath, parsed.frontmatter),
      } satisfies Omit<MarkdownDocument, "body">;
    }),
  );
  const headingsByRelativePath = new Map(
    documents.map((document) => [
      document.relativePath,
      new Set(document.headings.map(({ slug }) => slug)),
    ]),
  );
  const navigation = buildNavigationTree(documents);
  const context: DocumentationContext = {
    headingsByRelativePath,
    navigation,
    documents,
    projectRoot,
    sourceByRelativePath,
  };
  const renderedDocuments: MarkdownDocument[] = [];
  for (const document of documents) {
    renderedDocuments.push({
      ...document,
      body: await renderMarkdown(document.markdown, document, context),
    });
  }
  const generatedFiles: string[] = [];

  await mkdir(join(projectRoot, ".resona-docs"), { recursive: true });
  await writeFormattedFile(join(projectRoot, ".resona-docs", "styles.css"), styles);
  generatedFiles.push(".resona-docs/styles.css");

  for (const document of renderedDocuments) {
    const outputPath = join(projectRoot, document.relativePath.replace(/\.md$/u, ".html"));
    await writeFormattedFile(outputPath, renderPage(projectRoot, document, context));
    generatedFiles.push(toPosix(relative(projectRoot, outputPath)));
  }

  await writeFormattedFile(
    join(projectRoot, "index.html"),
    renderIndex(projectRoot, renderedDocuments, context),
  );
  generatedFiles.push("index.html");

  return {
    generatedFiles: generatedFiles.sort(compareDeterministically),
    sourceCount: renderedDocuments.length,
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
      compareDeterministically(left.name, right.name),
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
  return paths.sort(compareDeterministically);
};

const parseFrontmatter = (
  source: string,
  relativePath: string,
): Readonly<{ frontmatter: Frontmatter | null; markdown: string }> => {
  if (!source.startsWith("---\n") && !source.startsWith("---\r\n")) {
    return { frontmatter: null, markdown: source };
  }
  const match = /^---\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)\r?(?:\n|$)/u.exec(source);
  if (match === null) {
    throw new Error(`Invalid frontmatter in ${relativePath}: closing delimiter not found.`);
  }
  const raw = match[0].replace(/\r?\n$/u, "");
  let parsed: unknown;
  try {
    parsed = parseYaml(match[1] ?? "");
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid frontmatter in ${relativePath}: ${detail}`, { cause: error });
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Invalid frontmatter in ${relativePath}: expected a YAML object.`);
  }
  return {
    frontmatter: { raw, values: parsed as Readonly<Record<string, unknown>> },
    markdown: source.slice(match[0].length),
  };
};

const renderPage = (
  projectRoot: string,
  document: MarkdownDocument,
  context: DocumentationContext,
): string => {
  const outputPath = join(projectRoot, document.relativePath.replace(/\.md$/u, ".html"));
  const previous = adjacentDocument(document, context.documents, -1);
  const next = adjacentDocument(document, context.documents, 1);
  const sourceHref = relativeHref(outputPath, document.sourcePath);
  const previousHref =
    previous === null ? null : relativeHref(outputPath, outputPathFor(projectRoot, previous));
  const nextHref =
    next === null ? null : relativeHref(outputPath, outputPathFor(projectRoot, next));
  const toc = renderTableOfContents(document.headings);
  return renderShell({
    content: `      <nav class="breadcrumbs" aria-label="Breadcrumb">
        <ol>
          <li><a href="${escapeHtml(relativeHref(outputPath, join(projectRoot, "index.html")))}">Documentación</a></li>
${renderBreadcrumbs(document)}
        </ol>
      </nav>
      <div class="page-heading">
        <p class="source-path">${escapeHtml(document.relativePath)}</p>
        <span class="category-badge" data-category="${document.category}">${escapeHtml(categoryLabel(document.category))}</span>
        <a class="source-link" href="${escapeHtml(sourceHref)}">Ver Markdown fuente</a>
      </div>
      <div class="document-layout">
        <article class="doc-content">
${renderFrontmatter(document.frontmatter)}${document.body}
        </article>
        ${toc}
      </div>
      <nav class="page-navigation" aria-label="Paginación de documentación">
${renderAdjacentLink("Anterior", previous, previousHref)}${renderAdjacentLink("Siguiente", next, nextHref)}
      </nav>
      <a class="back-to-top" href="#top">Volver arriba</a>`,
    currentRelativePath: document.relativePath,
    navigation: context.navigation,
    outputPath,
    projectRoot,
    title: `${document.title} · Resona`,
  });
};

const renderIndex = (
  projectRoot: string,
  documents: readonly MarkdownDocument[],
  context: DocumentationContext,
): string => {
  const links = documents
    .map((document) => {
      const href = relativeHref(
        join(projectRoot, "index.html"),
        outputPathFor(projectRoot, document),
      );
      return `          <li data-category="${document.category}">
            <span class="category-badge">${escapeHtml(categoryLabel(document.category))}</span>
            <a href="${escapeHtml(href)}">${escapeHtml(document.title)}</a>
            <code>${escapeHtml(document.relativePath)}</code>
          </li>`;
    })
    .join("\n");
  return renderShell({
    content: `      <div class="index-intro">
        <p class="eyebrow">Resona · documentación</p>
        <h1>Resona documentation</h1>
        <p>Un recorrido navegable por ${documents.length} documentos Markdown.</p>
      </div>
      <section aria-labelledby="documents-title" class="document-index">
        <h2 id="documents-title">Documentos</h2>
        <ul>
${links}
        </ul>
      </section>
      <a class="back-to-top" href="#top">Volver arriba</a>`,
    currentRelativePath: null,
    navigation: context.navigation,
    outputPath: join(projectRoot, "index.html"),
    projectRoot,
    title: "Resona documentation",
  });
};

type ShellOptions = Readonly<{
  content: string;
  currentRelativePath: string | null;
  navigation: NavigationNode;
  outputPath: string;
  projectRoot: string;
  title: string;
}>;

const renderShell = ({
  content,
  currentRelativePath,
  navigation,
  outputPath,
  projectRoot,
  title,
}: ShellOptions): string => {
  const homeHref = relativeHref(outputPath, join(projectRoot, "index.html"));
  return renderHtmlDocument({
    body: `    <a class="skip-link" href="#content">Saltar al contenido</a>
    <header class="docs-header">
      <a class="brand" href="${escapeHtml(homeHref)}">Resona <span>docs</span></a>
      <label class="theme-control" for="theme-select">
        <span>Tema</span>
        <select id="theme-select" name="theme">
          <option value="system">Sistema</option>
          <option value="light">Claro</option>
          <option value="dark">Oscuro</option>
        </select>
      </label>
    </header>
    <div class="docs-layout">
      <aside class="docs-sidebar">
        <nav aria-label="Documentación">
          <p class="sidebar-title">Explorar</p>
${renderNavigation(projectRoot, outputPath, currentRelativePath, navigation)}
        </nav>
      </aside>
      <main id="content" class="docs-main" tabindex="-1">
${content}
      </main>
    </div>`,
    stylesheet: toPosix(
      relative(dirname(outputPath), join(projectRoot, ".resona-docs", "styles.css")),
    ),
    title,
  });
};

const outputPathFor = (projectRoot: string, document: DocumentationDocument): string =>
  join(projectRoot, document.relativePath.replace(/\.md$/u, ".html"));

const relativeHref = (fromOutputPath: string, targetPath: string): string =>
  toPosix(relative(dirname(fromOutputPath), targetPath)) || basename(targetPath);

const adjacentDocument = (
  document: DocumentationDocument,
  documents: readonly DocumentationDocument[],
  offset: -1 | 1,
): DocumentationDocument | null => {
  const index = documents.indexOf(document);
  return index === -1 ? null : (documents[index + offset] ?? null);
};

const categoryLabel = (category: DocumentationCategory): string => {
  const labels: Record<DocumentationCategory, string> = {
    adr: "ADR",
    "agent-skill": "Agent skill",
    other: "Other",
    "package-context": "Package context",
    research: "Research",
    root: "Root",
  };
  return labels[category];
};

const renderBreadcrumbs = (document: MarkdownDocument): string => {
  const segments = document.relativePath.split("/");
  const crumbs: string[] = [];
  for (const [index, segment] of segments.entries()) {
    const isDocument = index === segments.length - 1;
    if (isDocument) {
      crumbs.push(`          <li aria-current="page">${escapeHtml(document.title)}</li>`);
      continue;
    }
    crumbs.push(`          <li><span>${escapeHtml(segment)}</span></li>`);
  }
  return crumbs.join("\n");
};

const renderTableOfContents = (headings: readonly Heading[]): string => {
  const items = headings
    .map(
      ({ level, slug, title }) =>
        `          <li class="toc-level-${level}"><a href="#${escapeHtml(slug)}">${escapeHtml(title)}</a></li>`,
    )
    .join("\n");
  return `        <nav class="table-of-contents" aria-label="En esta página">
          <h2>En esta página</h2>
          <ol>
${items}
          </ol>
        </nav>`;
};

const renderAdjacentLink = (
  label: string,
  document: DocumentationDocument | null,
  href: string | null,
): string => {
  if (document === null || href === null) {
    return `        <span class="page-nav-placeholder" aria-hidden="true"></span>`;
  }
  const direction = label === "Anterior" ? "previous" : "next";
  return `        <a class="page-nav-link page-nav-${direction}" href="${escapeHtml(href)}">
          <span>${label}</span>
          <strong>${escapeHtml(document.title)}</strong>
        </a>`;
};

const renderNavigation = (
  projectRoot: string,
  outputPath: string,
  currentRelativePath: string | null,
  root: NavigationNode,
): string => {
  const renderNodes = (nodes: readonly NavigationNode[]): string =>
    nodes.map(renderNode).join("\n");
  const renderNode = (node: NavigationNode): string => {
    if (node.kind === "document") {
      const current = node.document.relativePath === currentRelativePath;
      return `            <li class="nav-document${current ? " nav-current" : ""}" data-category="${node.document.category}">
              <a href="${escapeHtml(relativeHref(outputPath, outputPathFor(projectRoot, node.document)))}"${current ? ' aria-current="page"' : ""}>
                <span class="nav-document-title">${escapeHtml(node.document.title)}</span>
                <span class="nav-document-path">${escapeHtml(node.document.relativePath)}</span>
              </a>
            </li>`;
    }
    const open =
      node.relativePath === "" ||
      (currentRelativePath !== null &&
        (currentRelativePath === node.relativePath ||
          currentRelativePath.startsWith(`${node.relativePath}/`)));
    return `            <li class="nav-directory">
              <details${open ? " open" : ""}>
                <summary>${escapeHtml(node.name || "Todos los documentos")}</summary>
                <ul>
${renderNodes(node.children)}
                </ul>
              </details>
            </li>`;
  };
  return `<div class="navigation-tree">
    <ul>
${renderNode(root)}
    </ul>
  </div>`;
};

type HtmlDocumentOptions = Readonly<{
  body: string;
  stylesheet: string;
  title: string;
}>;

const renderHtmlDocument = ({
  body,
  stylesheet,
  title,
}: HtmlDocumentOptions): string => `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <link rel="stylesheet" href="${escapeHtml(stylesheet)}">
  </head>
  <body id="top">
${body}
${themeScript}
  </body>
</html>
`;

const themeScript = `<script>
(() => {
  const key = "resona-docs-theme";
  const root = document.documentElement;
  const select = document.getElementById("theme-select");
  const apply = (theme) => {
    root.dataset.theme = theme;
    if (select) select.value = theme;
  };
  let stored = "system";
  try {
    stored = window.localStorage.getItem(key) || "system";
  } catch {}
  apply(["system", "light", "dark"].includes(stored) ? stored : "system");
  select?.addEventListener("change", () => {
    const theme = select.value;
    apply(theme);
    try {
      window.localStorage.setItem(key, theme);
    } catch {}
  });
})();
</script>`;

const renderFrontmatter = (frontmatter: Frontmatter | null): string => {
  if (frontmatter === null) return "";
  const metadata = ["status", "date"]
    .map((key) => {
      const value = frontmatter.values[key];
      if (value === undefined || value === null) return "";
      return `        <span class="frontmatter-badge">${escapeHtml(key)}: ${escapeHtml(formatMetadataValue(value))}</span>`;
    })
    .filter((value) => value !== "")
    .join("\n");
  return `        <aside class="frontmatter">
${metadata === "" ? "" : `          <div class="frontmatter-meta">\n${metadata}\n          </div>`}
          <details>
            <summary>Frontmatter</summary>
            <pre><code>${escapeHtml(frontmatter.raw)}</code></pre>
          </details>
        </aside>
`;
};

const formatMetadataValue = (value: unknown): string => {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "string") return value;
  return JSON.stringify(value) ?? String(value);
};

const renderMarkdown = async (
  source: string,
  document: Omit<MarkdownDocument, "body">,
  context: DocumentationContext,
): Promise<string> => {
  validateReferenceLabels(source, document.relativePath);
  const markdown = createMarkdownIt();
  const tokens = markdown.parse(source, {});
  await validateAndRewriteReferences(tokens, document, context);
  return markdown.renderer.render(tokens, markdown.options, {});
};

const validateReferenceLabels = (source: string, relativePath: string): void => {
  const markdown = new MarkdownIt({ html: true });
  const tokens = markdown.parse(maskEscapedBrackets(source), {});
  const ignoredLines = new Set<number>();
  const sourceLines = source.split(/\r?\n/u);
  const textSegments: string[] = [];
  for (const token of tokens) {
    if (token.type === "code_block" || token.type === "fence" || token.type === "html_block") {
      if (token.map !== null) {
        for (let line = token.map[0]; line < token.map[1]; line += 1) ignoredLines.add(line);
      }
      continue;
    }
    if (token.type !== "inline" || token.children === null || token.children === undefined) {
      continue;
    }
    let htmlDepth = 0;
    let autolinkDepth = 0;
    const firstSourceLine = token.map === null ? "" : (sourceLines[token.map[0]] ?? "");
    const isTaskListItem = /^\s*(?:>\s*)*(?:[-+*]|\d+[.)])\s+\[[ xX]\](?=\s)/u.test(
      firstSourceLine,
    );
    for (const child of token.children) {
      if (child.type === "link_open" && child.markup === "autolink") {
        autolinkDepth += 1;
        continue;
      }
      if (child.type === "link_close" && autolinkDepth > 0) {
        autolinkDepth -= 1;
        continue;
      }
      if (child.type === "html_inline") {
        const html = child.content.trim();
        if (/^<\//u.test(html)) htmlDepth = Math.max(0, htmlDepth - 1);
        else if (/^<[^!/?][^>]*>$/u.test(html) && !/\/\s*>$/u.test(html)) {
          const tagName = /^<\s*([a-z][\w-]*)/iu.exec(html)?.[1]?.toLowerCase();
          if (tagName !== undefined && !htmlVoidTags.has(tagName)) htmlDepth += 1;
        }
        continue;
      }
      if (child.type === "text" && htmlDepth === 0 && autolinkDepth === 0) {
        textSegments.push(
          isTaskListItem ? child.content.replace(/^\[[ xX]\](?=\s)/u, "") : child.content,
        );
      }
    }
  }
  const definitionSource = source
    .split(/\r?\n/u)
    .filter((_line, index) => !ignoredLines.has(index))
    .join("\n");
  const definitions = new Set<string>();
  const definitionPattern = /^\s{0,3}\[([^\]]+)\]:\s+\S.*$/gmu;
  for (const match of definitionSource.matchAll(definitionPattern)) {
    const label = match[1];
    if (label !== undefined) definitions.add(normalizeReferenceLabel(label));
  }
  const referenceSource = textSegments.join("\n");
  const referencePattern = /(?<!\\)(!?)\[([^\]]+)\]\[([^\]]*)\]/gu;
  for (const match of referenceSource.matchAll(referencePattern)) {
    const label = normalizeReferenceLabel(match[3] === "" ? (match[2] ?? "") : (match[3] ?? ""));
    if (!definitions.has(label)) {
      throw new Error(`Invalid reference label in ${relativePath}: ${label}`);
    }
  }
  const shortcutPattern = /(?<![!\\[])\[([^\u005B\u005D\n]+)\](?![[(])/gu;
  for (const match of referenceSource.matchAll(shortcutPattern)) {
    const label = normalizeReferenceLabel(match[1] ?? "");
    if (label === "") continue;
    if (!definitions.has(label)) {
      throw new Error(`Invalid reference label in ${relativePath}: ${label}`);
    }
  }
};

const maskEscapedBrackets = (source: string): string => {
  const characters = source.split("");
  const isEscaped = (index: number): boolean => {
    let slashCount = 0;
    for (let cursor = index - 1; cursor >= 0 && source[cursor] === "\\"; cursor -= 1) {
      slashCount += 1;
    }
    return slashCount % 2 === 1;
  };
  const mark = (index: number): void => {
    if (source[index] === "[") characters[index] = escapedLeftBracket;
    if (source[index] === "]") characters[index] = escapedRightBracket;
  };
  const findClosingBracket = (start: number): number => {
    for (let index = start; index < source.length; index += 1) {
      if (source[index] === "\n") return -1;
      if (source[index] === "]" && !isEscaped(index)) return index;
    }
    return -1;
  };

  for (let index = 0; index < source.length; index += 1) {
    if (source[index] !== "[" && source[index] !== "]") continue;
    if (!isEscaped(index)) continue;
    mark(index);
    if (source[index] !== "[") continue;
    const closing = findClosingBracket(index + 1);
    if (closing === -1) continue;
    mark(closing);
    const adjacentOpening = closing + 1;
    if (source[adjacentOpening] !== "[") continue;
    const adjacentClosing = findClosingBracket(adjacentOpening + 1);
    if (adjacentClosing !== -1) {
      mark(adjacentOpening);
      mark(adjacentClosing);
    }
  }
  return characters.join("");
};

const normalizeReferenceLabel = (value: string): string =>
  value.trim().replace(/\s+/gu, " ").toLowerCase();

const createMarkdownIt = (): MarkdownIt => {
  const markdown = new MarkdownIt({ html: true, highlight: highlightCode });
  const headingSlugs = new Set<string>();
  const defaultHeadingOpen = markdown.renderer.rules.heading_open;
  const defaultHtmlBlock = markdown.renderer.rules.html_block;
  const defaultHtmlInline = markdown.renderer.rules.html_inline;
  markdown.renderer.rules.heading_open = (tokens, index, options, environment, self) => {
    const token = tokens[index];
    if (token === undefined) return "";
    const headingText = tokens[index + 1]?.content ?? "";
    setAttribute(token, "id", uniqueSlug(headingText, headingSlugs));
    if (defaultHeadingOpen !== undefined) {
      return defaultHeadingOpen(tokens, index, options, environment, self);
    }
    return self.renderToken(tokens, index, options);
  };
  markdown.renderer.rules.html_block = (tokens, index) =>
    sanitizeEmbeddedHtml(tokens[index]?.content ?? "");
  markdown.renderer.rules.html_inline = (tokens, index) =>
    sanitizeEmbeddedHtml(tokens[index]?.content ?? "");
  if (defaultHtmlBlock === undefined || defaultHtmlInline === undefined) {
    throw new Error("Markdown renderer does not expose HTML rules.");
  }
  return markdown;
};

const collectHeadings = (source: string): readonly Heading[] => {
  const markdown = new MarkdownIt();
  const tokens = markdown.parse(source, {});
  const slugs = new Set<string>();
  const headings: Heading[] = [];
  tokens.forEach((token, index) => {
    if (token.type !== "heading_open") return;
    const level = Number(token.tag.slice(1));
    const title = tokens[index + 1]?.content ?? "";
    const slug = uniqueSlug(title, slugs);
    if (level === 2 || level === 3) headings.push({ level, slug, title });
  });
  return headings;
};

const categoryForPath = (relativePath: string): DocumentationCategory => {
  const path = relativePath.toLowerCase();
  if (path.startsWith("docs/adr/") || path.startsWith("adr/")) return "adr";
  if (path.startsWith("docs/research/") || path.startsWith("research/")) return "research";
  if (path.startsWith(".agents/skills/")) return "agent-skill";
  if (path.startsWith("packages/") && relativePath.toLowerCase().endsWith("/context.md")) {
    return "package-context";
  }
  if (
    !relativePath.includes("/") &&
    new Set(["agents.md", "context.md", "readme.md"]).has(basename(path))
  ) {
    return "root";
  }
  return "other";
};

const buildNavigationTree = (documents: readonly DocumentationDocument[]): NavigationNode => {
  const root: Extract<MutableNavigationNode, { kind: "directory" }> = {
    children: [],
    kind: "directory",
    name: "",
    relativePath: "",
  };
  for (const document of documents) {
    const segments = document.relativePath.split("/");
    let currentChildren = root.children;
    let directoryPath = "";
    for (const segment of segments.slice(0, -1)) {
      directoryPath = directoryPath === "" ? segment : `${directoryPath}/${segment}`;
      let directory = currentChildren.find(
        (node): node is Extract<MutableNavigationNode, { kind: "directory" }> =>
          node.kind === "directory" && node.relativePath === directoryPath,
      );
      if (directory === undefined) {
        directory = {
          children: [],
          kind: "directory",
          name: segment,
          relativePath: directoryPath,
        };
        currentChildren.push(directory);
      }
      currentChildren = directory.children;
    }
    currentChildren.push({ document, kind: "document" });
  }

  const sortNodes = (nodes: readonly MutableNavigationNode[]): NavigationNode[] =>
    [...nodes]
      .sort((left, right) => {
        if (left.kind !== right.kind) return left.kind === "directory" ? -1 : 1;
        const leftName = left.kind === "directory" ? left.name : left.document.title;
        const rightName = right.kind === "directory" ? right.name : right.document.title;
        return compareDeterministically(leftName, rightName);
      })
      .map((node) =>
        node.kind === "directory" ? { ...node, children: sortNodes(node.children) } : node,
      );
  return { children: sortNodes(root.children), kind: "directory", name: "", relativePath: "" };
};

const validateAndRewriteReferences = async (
  tokens: MarkdownItToken[],
  document: Omit<MarkdownDocument, "body">,
  context: DocumentationContext,
): Promise<void> => {
  for (const token of tokens) {
    if (token.type === "inline" && token.children !== null && token.children !== undefined) {
      await validateAndRewriteReferences(token.children, document, context);
    }
    if (token.type === "link_open") {
      const href = getAttribute(token, "href");
      if (href !== undefined) {
        setAttribute(token, "href", await resolveReference(href, "link", document, context));
      }
    }
    if (token.type === "image") {
      const source = getAttribute(token, "src");
      if (source !== undefined) {
        setAttribute(token, "src", await resolveReference(source, "image", document, context));
      }
    }
  }
};

type ReferenceKind = "image" | "link";

const resolveReference = async (
  reference: string,
  kind: ReferenceKind,
  document: Omit<MarkdownDocument, "body">,
  context: DocumentationContext,
): Promise<string> => {
  if (/^javascript:/iu.test(reference)) {
    throw new Error(`Invalid ${kind} reference in ${document.relativePath}: ${reference}`);
  }
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/iu.test(reference)) return reference;
  const { fragment, path, query } = splitReference(reference);
  const decodedPath = decodeReferencePath(path, document.relativePath);
  const sourceDirectory = dirname(document.sourcePath);
  const targetPath =
    decodedPath === ""
      ? document.sourcePath
      : decodedPath.startsWith("/")
        ? resolve(context.projectRoot, `.${decodedPath}`)
        : resolve(sourceDirectory, decodedPath);
  const targetRelativePath = toPosix(relative(context.projectRoot, targetPath));
  if (targetRelativePath === ".." || targetRelativePath.startsWith("../")) {
    throw new Error(`Invalid ${kind} reference in ${document.relativePath}: ${reference}`);
  }
  if (kind === "image") {
    await assertFileExists(targetPath, document.relativePath, reference, kind);
    return reference;
  }
  if (path === "" && fragment === "") return reference;
  if (targetRelativePath.toLowerCase().endsWith(".md")) {
    if (!context.sourceByRelativePath.has(targetRelativePath)) {
      throw new Error(`Invalid link in ${document.relativePath}: ${reference}`);
    }
    if (fragment !== "") {
      const headings = context.headingsByRelativePath.get(targetRelativePath);
      const normalizedFragment = slugify(decodeReferencePath(fragment, document.relativePath));
      if (headings === undefined || !headings.has(normalizedFragment)) {
        throw new Error(`Invalid fragment in ${document.relativePath}: ${reference}`);
      }
    }
    const targetOutput = targetRelativePath.replace(/\.md$/iu, ".html");
    const currentOutput = document.relativePath.replace(/\.md$/iu, ".html");
    const outputPath =
      toPosix(relative(dirname(currentOutput), targetOutput)) || basename(targetOutput);
    return `${outputPath}${query}${fragment === "" ? "" : `#${fragment}`}`;
  }
  await assertFileExists(targetPath, document.relativePath, reference, kind);
  return reference;
};

const assertFileExists = async (
  path: string,
  source: string,
  reference: string,
  kind: ReferenceKind,
): Promise<void> => {
  try {
    const details = await stat(path);
    if (!details.isFile()) throw new Error("not a file");
  } catch (error) {
    throw new Error(`Invalid ${kind} reference in ${source}: ${reference}`, { cause: error });
  }
};

const splitReference = (
  reference: string,
): Readonly<{ fragment: string; path: string; query: string }> => {
  const hashIndex = reference.indexOf("#");
  const withoutFragment = hashIndex === -1 ? reference : reference.slice(0, hashIndex);
  const fragment = hashIndex === -1 ? "" : reference.slice(hashIndex + 1);
  const queryIndex = withoutFragment.indexOf("?");
  return {
    fragment,
    path: queryIndex === -1 ? withoutFragment : withoutFragment.slice(0, queryIndex),
    query: queryIndex === -1 ? "" : withoutFragment.slice(queryIndex),
  };
};

const decodeReferencePath = (value: string, source: string): string => {
  try {
    return decodeURIComponent(value);
  } catch (error) {
    throw new Error(`Invalid reference in ${source}: ${value}`, { cause: error });
  }
};

const highlightCode = (source: string, languageInfo: string): string => {
  const language = languageInfo.trim().split(/\s+/u)[0]?.toLowerCase() ?? "";
  if (!knownCodeLanguages.has(language)) return escapeHtml(source);
  if (language === "text" || language === "md") return escapeHtml(source);
  const tokenPattern =
    /(\/\/[^\r\n]*|#[^\r\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b\d+(?:\.\d+)?\b|\b[A-Za-z_$][\w$]*\b)/gu;
  let output = "";
  let cursor = 0;
  for (const match of source.matchAll(tokenPattern)) {
    const value = match[0] ?? "";
    const start = match.index ?? cursor;
    output += escapeHtml(source.slice(cursor, start));
    const className =
      value.startsWith("//") || value.startsWith("#") || value.startsWith("/*")
        ? "comment"
        : value.startsWith('"') || value.startsWith("'") || value.startsWith("`")
          ? "string"
          : /^\d/u.test(value)
            ? "number"
            : codeKeywords.has(value)
              ? "keyword"
              : "";
    output +=
      className === ""
        ? escapeHtml(value)
        : `<span class="token ${className}">${escapeHtml(value)}</span>`;
    cursor = start + value.length;
  }
  return output + escapeHtml(source.slice(cursor));
};

const sanitizeEmbeddedHtml = (source: string): string => {
  if (
    /<\s*(?:script|iframe|style|object|embed|form|link|meta|base)\b|\son\w+\s*=|\sstyle\s*=/iu.test(
      source,
    )
  ) {
    return escapeHtml(source);
  }
  return source.replace(
    /<\s*(\/?)\s*([a-z][\w-]*)([^>]*)>/giu,
    (full, closing: string, rawName: string, rawAttributes: string) => {
      const name = rawName.toLowerCase();
      if (!safeHtmlTags.has(name)) return escapeHtml(full);
      if (closing !== "") return `</${name}>`;
      return `<${name}${sanitizeAttributes(rawAttributes)}>`;
    },
  );
};

const sanitizeAttributes = (source: string): string => {
  const output: string[] = [];
  const attributePattern =
    /\s+([A-Za-z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gu;
  for (const match of source.matchAll(attributePattern)) {
    const name = match[1] ?? "";
    if (!safeHtmlAttributes.has(name.toLowerCase()) && !name.toLowerCase().startsWith("aria-")) {
      continue;
    }
    const value = match[2] ?? match[3] ?? match[4];
    output.push(value === undefined ? ` ${name}` : ` ${name}="${escapeHtml(value)}"`);
  }
  return output.join("");
};

const titleFrom = (source: string, sourcePath: string, frontmatter: Frontmatter | null): string => {
  const frontmatterTitle = frontmatter?.values.title;
  if (typeof frontmatterTitle === "string" && frontmatterTitle.trim() !== "") {
    return frontmatterTitle.trim();
  }
  const heading = /^#\s+(.+)$/mu.exec(source);
  return heading?.[1]?.trim() ?? basename(sourcePath, extname(sourcePath));
};

const uniqueSlug = (value: string, used: Set<string>): string => {
  const base = slugify(value) || "section";
  let candidate = base;
  let suffix = 0;
  while (used.has(candidate)) {
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
  used.add(candidate);
  return candidate;
};

const slugify = (value: string): string =>
  value
    .replace(/<[^>]*>/gu, "")
    .replace(/!?\[([^\]]+)\]\([^)]*\)/gu, "$1")
    .normalize("NFKD")
    .replace(/\p{Mark}/gu, "")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}_\s-]+/gu, "")
    .trim()
    .replace(/\s+/gu, "-")
    .replace(/-+/gu, "-");

const getAttribute = (token: MarkdownItToken, name: string): string | undefined =>
  token.attrs?.find(([attribute]) => attribute === name)?.[1];

const setAttribute = (token: MarkdownItToken, name: string, value: string): void => {
  const attrs = token.attrs ?? [];
  const existing = attrs.findIndex(([attribute]) => attribute === name);
  const next: MarkdownItAttribute = [name, value];
  if (existing === -1) {
    attrs.push(next);
  } else {
    attrs[existing] = next;
  }
  token.attrs = attrs;
};

const compareDeterministically = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const toPosix = (value: string): string => value.replaceAll("\\", "/");
