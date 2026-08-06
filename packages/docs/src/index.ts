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

.frontmatter {
  margin: 0 0 2rem;
  padding: 1rem;
  border: 1px solid #d0d0ca;
  border-radius: 0.75rem;
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
  background: #e8e8e4;
  font-size: 0.875rem;
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

table {
  width: 100%;
  border-collapse: collapse;
}

th,
td {
  padding: 0.5rem;
  border: 1px solid #d0d0ca;
  text-align: left;
}

blockquote {
  margin: 1rem 0;
  padding: 0.25rem 1rem;
  border-left: 0.25rem solid #7357c7;
  color: #555;
}

img {
  max-width: 100%;
  height: auto;
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

.token.comment {
  color: #707070;
}

.token.keyword {
  color: #7357c7;
  font-weight: 700;
}

.token.string {
  color: #237a57;
}

.token.number {
  color: #a35c00;
}

li + li {
  margin-top: 0.25rem;
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

type MarkdownDocument = Readonly<{
  body: string;
  frontmatter: Frontmatter | null;
  markdown: string;
  relativePath: string;
  sourcePath: string;
  title: string;
}>;

type DocumentationContext = Readonly<{
  headingsByRelativePath: ReadonlyMap<string, ReadonlySet<string>>;
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
        frontmatter: parsed.frontmatter,
        markdown: parsed.markdown,
        relativePath,
        sourcePath,
        title: titleFrom(parsed.markdown, sourcePath, parsed.frontmatter),
      } satisfies Omit<MarkdownDocument, "body">;
    }),
  );
  const headingsByRelativePath = new Map(
    documents.map((document) => [document.relativePath, collectHeadingSlugs(document.markdown)]),
  );
  const context: DocumentationContext = {
    headingsByRelativePath,
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
    await writeFormattedFile(outputPath, renderPage(projectRoot, document));
    generatedFiles.push(toPosix(relative(projectRoot, outputPath)));
  }

  await writeFormattedFile(
    join(projectRoot, "index.html"),
    renderIndex(projectRoot, renderedDocuments),
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

const renderPage = (projectRoot: string, document: MarkdownDocument): string => {
  const outputPath = join(projectRoot, document.relativePath.replace(/\.md$/u, ".html"));
  const stylesheet = toPosix(
    relative(dirname(outputPath), join(projectRoot, ".resona-docs", "styles.css")),
  );
  return renderHtmlDocument({
    body: `    <main>
      <p class="source-path">${escapeHtml(document.relativePath)}</p>
      <article>
${renderFrontmatter(document.frontmatter)}${document.body}
      </article>
    </main>`,
    stylesheet,
    title: `${document.title} · Resona`,
  });
};

const renderIndex = (projectRoot: string, documents: readonly MarkdownDocument[]): string => {
  const links = documents
    .map((document) => {
      const href = toPosix(document.relativePath.replace(/\.md$/u, ".html"));
      return `        <li><a href="${escapeHtml(href)}">${escapeHtml(document.title)}</a> <code>${escapeHtml(document.relativePath)}</code></li>`;
    })
    .join("\n");
  const stylesheet = toPosix(
    relative(projectRoot, join(projectRoot, ".resona-docs", "styles.css")),
  );
  return renderHtmlDocument({
    body: `    <main>
      <article>
        <h1>Resona documentation</h1>
        <p>Generated from ${documents.length} Markdown files.</p>
        <ul>
${links}
        </ul>
      </article>
    </main>`,
    stylesheet,
    title: "Resona documentation",
  });
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
  <body>
${body}
  </body>
</html>
`;

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

const collectHeadingSlugs = (source: string): ReadonlySet<string> => {
  const markdown = new MarkdownIt();
  const tokens = markdown.parse(source, {});
  const slugs = new Set<string>();
  tokens.forEach((token, index) => {
    if (token.type === "heading_open") {
      uniqueSlug(tokens[index + 1]?.content ?? "", slugs);
    }
  });
  return slugs;
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
