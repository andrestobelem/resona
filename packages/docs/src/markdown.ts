import { readFile } from "node:fs/promises";
import { dirname, extname, relative, resolve, sep } from "node:path";

import GithubSlugger, { slug as githubSlug } from "github-slugger";
import hljs from "highlight.js/lib/common";
import { Marked, type RendererObject, type Token, type Tokens } from "marked";
import { parseDocument } from "yaml";

export type Frontmatter = Readonly<{
  raw: string;
  rawBlock: string;
  values: Readonly<Record<string, unknown>>;
}>;

export type MarkdownDocument = Readonly<{
  body: string;
  frontmatter: Frontmatter | null;
  headings: readonly MarkdownHeading[];
  headingIds: ReadonlySet<string>;
  outputPath: string;
  relativePath: string;
  searchCode: string;
  searchText: string;
  sourcePath: string;
  title: string;
}>;

export type MarkdownHeading = Readonly<{
  depth: number;
  id: string;
  text: string;
}>;

export type MarkdownBuildIssue = Readonly<{
  message: string;
  relativePath: string;
}>;

export type ReferenceKind = "fragment" | "image" | "link";

export type ReferenceAllowlistEntry = Readonly<{
  kind: ReferenceKind;
  reason: string;
  source: string;
  target: string;
}>;

export type ReferenceAllowlist = Readonly<{
  entries: ReadonlyMap<string, ReferenceAllowlistEntry>;
  usedKeys: Set<string>;
}>;

export type MarkdownRenderContext = Readonly<{
  availableFiles: ReadonlySet<string>;
  availablePaths: ReadonlySet<string>;
  documentsBySourcePath: ReadonlyMap<string, MarkdownDocument>;
  documentsByOutputPath: ReadonlyMap<string, MarkdownDocument>;
  fragmentIdsByPath: ReadonlyMap<string, ReadonlySet<string>>;
  issues: MarkdownBuildIssue[];
  projectRoot: string;
  referenceAllowlist: ReferenceAllowlist;
}>;

export class MarkdownBuildError extends Error {
  constructor(issues: readonly MarkdownBuildIssue[]) {
    const uniqueIssues = [
      ...new Map(issues.map((issue) => [issue.relativePath + issue.message, issue])).values(),
    ];
    super(
      [
        "Documentation build failed:",
        ...uniqueIssues.map((issue) => `- ${issue.relativePath}: ${issue.message}`),
      ].join("\n"),
    );
    this.name = "MarkdownBuildError";
  }
}

type SourceParseResult = Readonly<{
  body: string;
  frontmatter: Frontmatter | null;
}>;

export const referenceAllowlistRelativePath = ".resona-docs/reference-allowlist.json";

export const loadReferenceAllowlist = async (projectRoot: string): Promise<ReferenceAllowlist> => {
  const path = resolve(projectRoot, referenceAllowlistRelativePath);
  let source: string;
  try {
    source = await readFile(path, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return { entries: new Map(), usedKeys: new Set() };
    }
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    throw new MarkdownBuildError([
      {
        message: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
        relativePath: referenceAllowlistRelativePath,
      },
    ]);
  }

  const parsedRecord = isRecord(parsed)
    ? parsed
    : throwInvalidAllowlist("the document must contain version 1 and an entries array");
  const rawEntriesValue = parsedRecord.entries;
  const rawEntries = Array.isArray(rawEntriesValue)
    ? rawEntriesValue
    : throwInvalidAllowlist("the document must contain version 1 and an entries array");
  if (parsedRecord.version !== 1) {
    throwInvalidAllowlist("the document must contain version 1 and an entries array");
  }

  const entries = new Map<string, ReferenceAllowlistEntry>();
  for (const [index, value] of rawEntries.entries()) {
    const entryValue = isRecord(value)
      ? value
      : throwInvalidAllowlist(`entry ${index + 1} must be an object`);
    const kind = entryValue.kind;
    const reason = entryValue.reason;
    const sourcePath = entryValue.source;
    const target = entryValue.target;
    if (
      !isReferenceKind(kind) ||
      typeof reason !== "string" ||
      reason.trim() === "" ||
      typeof sourcePath !== "string" ||
      sourcePath.trim() === "" ||
      typeof target !== "string" ||
      target === ""
    ) {
      throwInvalidAllowlist(
        `entry ${index + 1} must contain kind, source, target, and a non-empty reason`,
      );
    }
    const typedKind = kind as ReferenceKind;
    const typedReason = reason as string;
    const typedSource = sourcePath as string;
    const typedTarget = target as string;
    const normalizedSource = toPosix(typedSource);
    if (normalizedSource.startsWith("/") || normalizedSource.split("/").includes("..")) {
      throwInvalidAllowlist(`entry ${index + 1} has an invalid source path`);
    }
    const entry = {
      kind: typedKind,
      reason: typedReason.trim(),
      source: normalizedSource,
      target: typedTarget,
    } satisfies ReferenceAllowlistEntry;
    const key = referenceAllowlistKey(entry.source, entry.kind, entry.target);
    if (entries.has(key)) throwInvalidAllowlist(`entry ${index + 1} is duplicated`);
    entries.set(key, entry);
  }
  return { entries, usedKeys: new Set() };
};

export const referenceAllowlistKey = (
  source: string,
  kind: ReferenceKind,
  target: string,
): string => `${source}\u0000${kind}\u0000${target}`;

export const unusedReferenceAllowlistEntries = (
  allowlist: ReferenceAllowlist,
): readonly ReferenceAllowlistEntry[] =>
  [...allowlist.entries.values()].filter(
    (entry) =>
      !allowlist.usedKeys.has(referenceAllowlistKey(entry.source, entry.kind, entry.target)),
  );

const safeRawHtmlTags = new Set([
  "abbr",
  "b",
  "blockquote",
  "br",
  "caption",
  "code",
  "col",
  "colgroup",
  "dd",
  "del",
  "details",
  "div",
  "dl",
  "dt",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "ins",
  "kbd",
  "li",
  "mark",
  "ol",
  "p",
  "pre",
  "q",
  "s",
  "samp",
  "section",
  "small",
  "span",
  "strong",
  "sub",
  "summary",
  "sup",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
  "var",
]);

const allowedRawHtmlAttributes =
  /^(?:aria-[a-z\d-]+|class|colspan|data-[a-z\d-]+|id|open|role|rowspan|scope|start|title)$/u;
const dangerousRawHtmlTag =
  /<\s*(?:applet|embed|iframe|object|script|style|template|textarea|title|xmp)\b/iu;
const dangerousRawHtmlAttribute = /\s(?:on[a-z\d-]+|style)\s*=/iu;
const rawHtmlTag = /<\s*(\/?)\s*([a-z][a-z\d:-]*)([^>]*)>/giu;
const frontmatterBlock = /^---[ \t]*\r?\n([\s\S]*?)(?:\r?\n)(---|\.\.\.)[ \t]*(?:\r?\n|$)/u;

export const parseMarkdownDocument = (options: {
  outputPath: string;
  relativePath: string;
  source: string;
  sourcePath: string;
}): MarkdownDocument => {
  const parsedSource = parseSource(options.source, options.relativePath);
  const lexer = new Marked({ gfm: true });
  const tokens = lexer.lexer(parsedSource.body);
  const headings = headingsFromTokens(tokens);
  const searchCode = codeFromTokens(tokens).join("\n");
  const title = titleFrom(parsedSource.frontmatter, tokens, options.relativePath);

  return {
    body: parsedSource.body,
    frontmatter: parsedSource.frontmatter,
    headings,
    headingIds: new Set(headings.map((heading) => heading.id)),
    outputPath: options.outputPath,
    relativePath: options.relativePath,
    searchCode,
    searchText: tokensToSearchText(tokens),
    sourcePath: options.sourcePath,
    title,
  };
};

export const renderFrontmatter = (frontmatter: Frontmatter | null): string => {
  if (frontmatter === null) return "";
  const badges = [
    typeof frontmatter.values.status === "string"
      ? `<span class="badge badge-status">${escapeHtml(frontmatter.values.status)}</span>`
      : "",
    typeof frontmatter.values.date === "string" || typeof frontmatter.values.date === "number"
      ? `<span class="badge badge-date">${escapeHtml(String(frontmatter.values.date))}</span>`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
  return `<div class="document-meta">
${badges === "" ? "" : `  <div class="badges">${badges}</div>`}
  <details class="frontmatter">
    <summary>Frontmatter</summary>
    <pre><code class="language-yaml">${escapeHtml(frontmatter.rawBlock)}</code></pre>
  </details>
</div>`;
};

export const renderMarkdownDocument = (
  document: MarkdownDocument,
  context: MarkdownRenderContext,
): string => {
  let headingIndex = 0;
  const marked = new Marked({
    gfm: true,
    renderer: {
      code({ lang, text }) {
        const language = normalizeCodeLanguage(lang);
        const highlighted = highlightCode(text, language);
        const className =
          language === ""
            ? ""
            : ` class="${highlighted.known ? "hljs " : ""}language-${escapeHtml(language)}"`;
        return `<pre><code${className}>${highlighted.html}</code></pre>`;
      },
      heading(this: { parser: { parseInline(tokens: Token[]): string } }, { tokens, depth }) {
        const id = document.headings[headingIndex]?.id ?? slugifyHeading(tokensToText(tokens));
        headingIndex += 1;
        return `<h${depth} id="${escapeHtml(id)}">${this.parser.parseInline(tokens)}</h${depth}>`;
      },
      html({ text }) {
        return sanitizeRawHtml(text, document, context);
      },
      image({ href, text, title }) {
        const imageHref = resolveImageHref(href, document, context);
        const titleAttribute =
          title === null || title === undefined ? "" : ` title="${escapeHtml(title)}"`;
        return `<img src="${escapeHtml(imageHref)}" alt="${escapeHtml(text)}"${titleAttribute} />`;
      },
      link(this: { parser: { parseInline(tokens: Token[]): string } }, { href, title, tokens }) {
        const resolved = resolveLinkHref(href, document, context);
        const targetAttributes = resolved.external
          ? ' target="_blank" rel="noopener noreferrer"'
          : "";
        const titleAttribute =
          title === null || title === undefined ? "" : ` title="${escapeHtml(title)}"`;
        return `<a href="${escapeHtml(resolved.href)}"${targetAttributes}${titleAttribute}>${this.parser.parseInline(tokens ?? [])}</a>`;
      },
    } satisfies RendererObject,
  });

  return String(marked.parse(document.body));
};

const parseSource = (source: string, relativePath: string): SourceParseResult => {
  if (!source.startsWith("---")) return { body: source, frontmatter: null };
  const match = frontmatterBlock.exec(source);
  if (match === null) {
    throw new MarkdownBuildError([
      { message: "Invalid YAML frontmatter: closing delimiter is missing.", relativePath },
    ]);
  }
  const raw = match[1] ?? "";
  const document = parseDocument(raw, { uniqueKeys: true });
  if (document.errors.length > 0) {
    throw new MarkdownBuildError([
      {
        message: `Invalid YAML frontmatter: ${document.errors.map((error) => error.message).join("; ")}`,
        relativePath,
      },
    ]);
  }
  const values = document.toJS();
  if (!isRecord(values)) {
    throw new MarkdownBuildError([
      {
        message: "Invalid YAML frontmatter: the document must contain a mapping.",
        relativePath,
      },
    ]);
  }
  return {
    body: source.slice(match[0].length),
    frontmatter: {
      raw,
      rawBlock: match[0],
      values,
    },
  };
};

const titleFrom = (
  frontmatter: Frontmatter | null,
  tokens: readonly Token[],
  relativePath: string,
): string => {
  const frontmatterTitle = frontmatter?.values.title;
  if (typeof frontmatterTitle === "string" && frontmatterTitle.trim() !== "") {
    return frontmatterTitle.trim();
  }
  const firstHeading = tokens.find(
    (token): token is Tokens.Heading => token.type === "heading" && token.depth === 1,
  );
  return firstHeading === undefined
    ? basenameWithoutExtension(relativePath)
    : tokensToText(firstHeading.tokens).trim();
};

const headingsFromTokens = (tokens: readonly Token[]): readonly MarkdownHeading[] => {
  const slugger = new GithubSlugger();
  const headings: MarkdownHeading[] = [];
  for (const token of headingTokensFromTokens(tokens)) {
    const text = tokensToText(token.tokens ?? []);
    const id = slugger.slug(text);
    headings.push({ depth: token.depth, id, text });
  }
  return headings;
};

const headingTokensFromTokens = (tokens: readonly Token[]): Tokens.Heading[] => {
  const headings: Tokens.Heading[] = [];
  for (const token of tokens) {
    if (token.type === "heading") {
      headings.push(token as Tokens.Heading);
      continue;
    }
    if ("tokens" in token && Array.isArray(token.tokens)) {
      headings.push(...headingTokensFromTokens(token.tokens as Token[]));
    }
  }
  return headings;
};

const resolveLinkHref = (
  href: string,
  document: MarkdownDocument,
  context: MarkdownRenderContext,
): Readonly<{ external: boolean; href: string }> => {
  const parts = splitHref(href);
  if (isHttpUrl(parts.path) || parts.path.startsWith("//")) {
    return { external: true, href };
  }
  if (hasScheme(parts.path)) {
    if (/^(?:javascript|vbscript|data):/iu.test(parts.path)) {
      addIssue(context, document, `unsafe link scheme in ${href}`);
      return { external: false, href };
    }
    return { external: false, href };
  }

  const target = resolveLocalPath(parts.path, document, context);
  if (target === null) return { external: false, href };
  if (!context.availablePaths.has(target.path)) {
    addReferenceIssue(context, document, "link", href, `broken local link: ${href}`);
    return { external: false, href };
  }

  const sourceDocument = context.documentsBySourcePath.get(target.path);
  const outputDocument = context.documentsByOutputPath.get(target.path);
  const fragmentDocument = sourceDocument ?? outputDocument;
  if (parts.fragment !== "") {
    const fragment = decodeFragment(parts.fragment);
    const fragmentIds = context.fragmentIdsByPath.get(target.path);
    const normalizedFragment =
      fragment === null
        ? null
        : fragmentDocument === undefined
          ? fragment
          : normalizeFragment(fragment);
    if (
      normalizedFragment === null ||
      (fragmentDocument === undefined && fragmentIds === undefined) ||
      (fragmentDocument !== undefined && !fragmentDocument.headingIds.has(normalizedFragment)) ||
      (fragmentDocument === undefined && !fragmentIds?.has(normalizedFragment))
    ) {
      addReferenceIssue(context, document, "fragment", href, `broken fragment in ${href}`);
    }
  }

  if (sourceDocument === undefined) return { external: false, href };
  const rewrittenPath = toPosix(relative(dirname(document.outputPath), sourceDocument.outputPath));
  return {
    external: false,
    href: `${rewrittenPath === "" ? basenameWithoutExtension(sourceDocument.outputPath) : rewrittenPath}${parts.query}${parts.fragment === "" ? "" : `#${parts.fragment}`}`,
  };
};

const resolveImageHref = (
  href: string,
  document: MarkdownDocument,
  context: MarkdownRenderContext,
): string => {
  const parts = splitHref(href);
  if (isHttpUrl(parts.path) || parts.path.startsWith("//")) return href;
  if (hasScheme(parts.path)) {
    if (/^(?:javascript|vbscript|data):/iu.test(parts.path)) {
      addIssue(context, document, `unsafe image scheme in ${href}`);
    }
    return href;
  }
  const target = resolveLocalPath(parts.path, document, context);
  if (target !== null && !context.availableFiles.has(target.path)) {
    addReferenceIssue(context, document, "image", href, `broken local image: ${href}`);
  }
  return href;
};

const resolveLocalPath = (
  path: string,
  document: MarkdownDocument,
  context: MarkdownRenderContext,
): Readonly<{ path: string }> | null => {
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(path);
  } catch {
    addIssue(context, document, `invalid encoded local reference: ${path}`);
    return null;
  }
  const targetPath =
    decodedPath === ""
      ? document.sourcePath
      : decodedPath.startsWith("/")
        ? resolve(context.projectRoot, `.${decodedPath}`)
        : resolve(dirname(document.sourcePath), decodedPath);
  const rootPrefix = context.projectRoot.endsWith(sep)
    ? context.projectRoot
    : `${context.projectRoot}${sep}`;
  if (targetPath !== context.projectRoot && !targetPath.startsWith(rootPrefix)) {
    addIssue(context, document, `local reference escapes the project root: ${path}`);
    return null;
  }
  return { path: targetPath };
};

const sanitizeRawHtml = (
  text: string,
  document: MarkdownDocument,
  context: MarkdownRenderContext,
): string => {
  if (
    dangerousRawHtmlTag.test(text) ||
    dangerousRawHtmlAttribute.test(text) ||
    /<!--[\s\S]*?-->/u.test(text)
  ) {
    addIssue(context, document, "unsafe HTML is not allowed");
    return escapeHtml(text);
  }
  return text.replace(
    rawHtmlTag,
    (rawTag, closing: string, rawName: string, rawAttributes: string) => {
      const name = rawName.toLowerCase();
      if (!safeRawHtmlTags.has(name)) return escapeHtml(rawTag);
      const attributes = sanitizeRawAttributes(rawAttributes);
      if (attributes === null) return escapeHtml(rawTag);
      const selfClosing = /\/\s*$/u.test(rawAttributes);
      return `<${closing === "" ? "" : "/"}${name}${attributes}${selfClosing ? " /" : ""}>`;
    },
  );
};

const sanitizeRawAttributes = (rawAttributes: string): string | null => {
  const attributes = rawAttributes.replace(/\/\s*$/u, "");
  let cursor = 0;
  let output = "";
  while (cursor < attributes.length) {
    const whitespace = /^\s+/u.exec(attributes.slice(cursor));
    if (whitespace !== null) cursor += whitespace[0].length;
    if (cursor >= attributes.length) break;
    const match = /^([a-z_:][a-z\d:._-]*)(\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?/iu.exec(
      attributes.slice(cursor),
    );
    if (match === null || !allowedRawHtmlAttributes.test(match[1] ?? "")) return null;
    output += ` ${match[1]}${match[2] ?? ""}`;
    cursor += match[0].length;
  }
  return output;
};

const highlightCode = (
  text: string,
  language: string,
): Readonly<{ html: string; known: boolean }> => {
  if (language !== "" && hljs.getLanguage(language) !== undefined) {
    return { html: hljs.highlight(text, { language }).value, known: true };
  }
  return { html: escapeHtml(text), known: false };
};

const normalizeCodeLanguage = (language: string | undefined): string => {
  const value = language?.trim().split(/\s+/u)[0] ?? "";
  return /^[a-z\d+#._+-]+$/iu.test(value) ? value.toLowerCase() : "";
};

const splitHref = (href: string): Readonly<{ fragment: string; path: string; query: string }> => {
  const hashIndex = href.indexOf("#");
  const beforeFragment = hashIndex === -1 ? href : href.slice(0, hashIndex);
  const fragment = hashIndex === -1 ? "" : href.slice(hashIndex + 1);
  const queryIndex = beforeFragment.indexOf("?");
  return {
    fragment,
    path: queryIndex === -1 ? beforeFragment : beforeFragment.slice(0, queryIndex),
    query: queryIndex === -1 ? "" : beforeFragment.slice(queryIndex),
  };
};

const isHttpUrl = (value: string): boolean => /^https?:\/\//iu.test(value);

const hasScheme = (value: string): boolean => /^[a-z][a-z\d+.-]*:/iu.test(value);

const normalizeFragment = (fragment: string): string => {
  return slugifyHeading(fragment);
};

const decodeFragment = (fragment: string): string | null => {
  try {
    return decodeURIComponent(fragment);
  } catch {
    return null;
  }
};

const addIssue = (
  context: MarkdownRenderContext,
  document: MarkdownDocument,
  message: string,
): void => {
  context.issues.push({ message, relativePath: document.relativePath });
};

const addReferenceIssue = (
  context: MarkdownRenderContext,
  document: MarkdownDocument,
  kind: ReferenceKind,
  target: string,
  message: string,
): void => {
  const key = referenceAllowlistKey(document.relativePath, kind, target);
  if (context.referenceAllowlist.entries.has(key)) {
    context.referenceAllowlist.usedKeys.add(key);
    return;
  }
  addIssue(context, document, message);
};

const tokensToText = (tokens: readonly Token[]): string =>
  tokens
    .map((token) => {
      if (token.type === "image") return token.text;
      if (token.type === "html") return token.text.replace(/<[^>]*>/gu, "");
      if ("tokens" in token && Array.isArray(token.tokens)) return tokensToText(token.tokens);
      if ("text" in token && typeof token.text === "string") return token.text;
      return "";
    })
    .join("");

const codeFromTokens = (tokens: readonly Token[]): string[] => tokens.flatMap(codeFromValue);

const codeFromValue = (value: unknown): string[] => {
  if (!isRecord(value)) return [];
  if (value.type === "code" && typeof value.text === "string") return [value.text];
  return childValues(value).flatMap(codeFromValue);
};

const tokensToSearchText = (tokens: readonly Token[]): string =>
  tokens.map((token) => searchTextFromValue(token)).join(" ");

const searchTextFromValue = (value: unknown): string => {
  if (!isRecord(value)) return "";
  if (value.type === "image" && typeof value.text === "string") return value.text;
  if (value.type === "html" && typeof value.text === "string") {
    return value.text.replace(/<[^>]*>/gu, "");
  }
  const children = childValues(value);
  if (children.length > 0) return children.map(searchTextFromValue).join(" ");
  return typeof value.text === "string" ? value.text : "";
};

const childValues = (value: Record<string, unknown>): readonly unknown[] => [
  ...(Array.isArray(value.tokens) ? value.tokens : []),
  ...(Array.isArray(value.items) ? value.items : []),
  ...(Array.isArray(value.header) ? value.header : []),
  ...(Array.isArray(value.rows) ? value.rows.flat() : []),
];

const slugifyHeading = (value: string): string => githubSlug(value.replace(/<[^>]*>/gu, ""));

const basenameWithoutExtension = (path: string): string => {
  const fileName = path.split("/").at(-1) ?? path;
  return fileName.slice(0, Math.max(0, fileName.length - extname(fileName).length));
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNodeError = (value: unknown): value is NodeJS.ErrnoException =>
  value instanceof Error && "code" in value;

const isReferenceKind = (value: unknown): value is ReferenceKind =>
  value === "fragment" || value === "image" || value === "link";

const throwInvalidAllowlist = (message: string): never => {
  throw new MarkdownBuildError([
    {
      message: `Invalid reference allowlist: ${message}.`,
      relativePath: referenceAllowlistRelativePath,
    },
  ]);
};

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const toPosix = (value: string): string => value.replaceAll("\\", "/");
