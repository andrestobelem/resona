import { lstat, mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, relative, resolve } from "node:path";

import { format as formatWithPrettier, resolveConfig } from "prettier";
import {
  MarkdownBuildError,
  loadReferenceAllowlist,
  parseMarkdownDocument,
  referenceAllowlistRelativePath,
  renderFrontmatter,
  renderMarkdownDocument,
  unusedReferenceAllowlistEntries,
  type MarkdownBuildIssue,
  type MarkdownDocument,
} from "./markdown.js";
import {
  documentationManifestRelativePath,
  documentationManifestVersion,
  hashContent,
  hashFile,
  readDocumentationManifest,
  serializeDocumentationManifest,
  type DocumentationManifest,
  type DocumentationManifestEntry,
} from "./manifest.js";

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
  --accent: #5b3cc4;
  --accent-strong: #432b9a;
  --background: #f7f8fa;
  --border: #d7dce2;
  --code-background: #edf0f3;
  --muted: #56616d;
  --surface: #ffffff;
  --surface-muted: #f0f2f5;
  --text: #1d252c;
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  line-height: 1.6;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    --accent: #b9a6ff;
    --accent-strong: #d0c4ff;
    --background: #11161c;
    --border: #37414d;
    --code-background: #1e2730;
    --muted: #aeb8c2;
    --surface: #171e26;
    --surface-muted: #202933;
    --text: #edf2f7;
  }
}

:root[data-theme="dark"] {
  color-scheme: dark;
  --accent: #b9a6ff;
  --accent-strong: #d0c4ff;
  --background: #11161c;
  --border: #37414d;
  --code-background: #1e2730;
  --muted: #aeb8c2;
  --surface: #171e26;
  --surface-muted: #202933;
  --text: #edf2f7;
}

* {
  box-sizing: border-box;
}

html {
  scroll-behavior: smooth;
}

body {
  margin: 0;
  background: var(--background);
  color: var(--text);
}

a {
  color: var(--accent-strong);
}

a:hover {
  text-decoration-thickness: 0.14em;
}

:focus-visible {
  outline: 0.2rem solid var(--accent);
  outline-offset: 0.18rem;
}

.skip-link {
  position: fixed;
  z-index: 10;
  top: 0.75rem;
  left: 0.75rem;
  padding: 0.55rem 0.8rem;
  border-radius: 0.4rem;
  background: var(--surface);
  color: var(--text);
  transform: translateY(-180%);
}

.skip-link:focus {
  transform: translateY(0);
}

.site-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  min-height: 4.25rem;
  padding: 0.8rem clamp(1rem, 3vw, 2.5rem);
  border-bottom: 1px solid var(--border);
  background: var(--surface);
}

.site-header-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.75rem;
  min-width: 0;
}

.site-brand {
  color: var(--text);
  font-size: 1.05rem;
  font-weight: 800;
  text-decoration: none;
}

.theme-control {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--muted);
  font-size: 0.85rem;
}

.theme-control select {
  border: 1px solid var(--border);
  border-radius: 0.35rem;
  padding: 0.35rem 0.5rem;
  background: var(--surface);
  color: var(--text);
  font: inherit;
}

.search-panel {
  position: relative;
  min-width: min(28rem, 42vw);
}

.search-controls {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  margin: 0;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

.search-controls input,
.search-controls select {
  min-width: 0;
  border: 1px solid var(--border);
  border-radius: 0.35rem;
  padding: 0.35rem 0.5rem;
  background: var(--surface);
  color: var(--text);
  font: 0.8rem Inter, ui-sans-serif, system-ui, sans-serif;
}

.search-controls input {
  flex: 1;
  min-width: 8rem;
}

.search-results {
  position: absolute;
  z-index: 5;
  top: calc(100% + 0.4rem);
  right: 0;
  left: 0;
  max-height: min(28rem, 70vh);
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  padding: 0.65rem;
  background: var(--surface);
  box-shadow: 0 0.75rem 2rem rgb(0 0 0 / 18%);
}

.search-results[hidden] {
  display: none;
}

.search-summary {
  margin: 0 0 0.45rem;
  color: var(--muted);
  font-size: 0.76rem;
}

.search-results ol {
  display: grid;
  gap: 0.35rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.search-result {
  display: block;
  border-radius: 0.35rem;
  padding: 0.45rem;
  color: var(--text);
  text-decoration: none;
}

.search-result:hover {
  background: var(--surface-muted);
}

.search-result-title {
  display: block;
  color: var(--accent-strong);
  font-weight: 750;
}

.search-result-meta,
.search-result-snippet {
  display: block;
  color: var(--muted);
  font-size: 0.75rem;
}

.search-result-snippet {
  margin-top: 0.15rem;
  line-height: 1.4;
}

.site-layout {
  display: grid;
  grid-template-columns: minmax(14rem, 19rem) minmax(0, 1fr);
  max-width: 96rem;
  margin: 0 auto;
}

.sidebar {
  min-width: 0;
  border-right: 1px solid var(--border);
  background: var(--surface);
}

.sidebar-panel {
  position: sticky;
  top: 0;
  max-height: calc(100vh - 1rem);
  overflow: auto;
  border: 0;
  border-radius: 0;
  padding: 1rem;
}

.sidebar-panel > summary {
  margin: -0.3rem -0.3rem 0.75rem;
  padding: 0.3rem;
  color: var(--muted);
  cursor: pointer;
  font-size: 0.8rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.nav-tree,
.nav-tree ul {
  margin: 0;
  padding: 0;
  list-style: none;
}

.nav-tree ul {
  margin-left: 0.7rem;
  border-left: 1px solid var(--border);
  padding-left: 0.65rem;
}

.nav-tree details {
  border: 0;
  padding: 0;
}

.nav-tree details > summary {
  padding: 0.25rem 0;
  color: var(--text);
  cursor: pointer;
  font-size: 0.84rem;
  font-weight: 700;
}

.nav-document {
  display: block;
  margin: 0.15rem 0;
  border-radius: 0.35rem;
  padding: 0.35rem 0.45rem;
  color: var(--text);
  font-size: 0.82rem;
  text-decoration: none;
}

.nav-document:hover,
.nav-document[aria-current="page"] {
  background: var(--surface-muted);
  color: var(--accent-strong);
}

.nav-document[aria-current="page"] {
  box-shadow: inset 0.2rem 0 0 var(--accent);
  font-weight: 700;
}

.nav-title,
.nav-path {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nav-path {
  margin-top: 0.08rem;
  color: var(--muted);
  font: 0.7rem ui-monospace, SFMono-Regular, Menlo, monospace;
}

.content-column {
  min-width: 0;
}

.document-layout,
.index-main {
  box-sizing: border-box;
  max-width: 88rem;
  margin: 0 auto;
  padding: 2rem clamp(1rem, 4vw, 4rem) 4rem;
}

.document-layout {
  display: grid;
  grid-template-columns: minmax(0, 52rem) minmax(11rem, 15rem);
  gap: clamp(1.5rem, 4vw, 4rem);
  align-items: start;
}

.document-content {
  min-width: 0;
}

.document-header {
  margin-bottom: 1.5rem;
}

.source-path {
  margin: 0 0 0.4rem;
  color: var(--muted);
  font: 0.82rem ui-monospace, SFMono-Regular, Menlo, monospace;
  overflow-wrap: anywhere;
}

.source-link {
  margin-left: 0.65rem;
  font: 0.82rem Inter, ui-sans-serif, system-ui, sans-serif;
}

.badges {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.badge,
.category-badge {
  display: inline-block;
  border-radius: 999px;
  padding: 0.2rem 0.6rem;
  font-size: 0.76rem;
  font-weight: 750;
}

.badge-status {
  background: #d8f3dc;
  color: #1b4332;
}

.badge-date {
  background: #e0e7ff;
  color: #3730a3;
}

.category-badge {
  background: var(--surface-muted);
  color: var(--muted);
}

.breadcrumbs {
  margin-bottom: 1.25rem;
  color: var(--muted);
  font-size: 0.84rem;
}

.breadcrumbs ol {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.breadcrumbs li:not(:last-child)::after {
  margin-left: 0.35rem;
  content: "/";
  color: var(--border);
}

.breadcrumbs [aria-current="page"] {
  color: var(--text);
  font-weight: 650;
}

.toc {
  position: sticky;
  top: 1rem;
  max-height: calc(100vh - 2rem);
  overflow: auto;
  border-left: 1px solid var(--border);
  padding-left: 1rem;
  font-size: 0.82rem;
}

.toc-title {
  margin: 0 0 0.55rem;
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.toc ol {
  display: grid;
  gap: 0.25rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.toc .toc-depth-3 {
  padding-left: 0.8rem;
}

.toc a {
  color: var(--muted);
  text-decoration: none;
}

.toc a:hover,
.toc a[aria-current="location"] {
  color: var(--accent-strong);
  font-weight: 700;
}

.document-meta {
  margin: 0 0 1.5rem;
}

details {
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  padding: 0.65rem 0.8rem;
}

details summary {
  cursor: pointer;
  font-weight: 700;
}

h1,
h2,
h3,
h4,
h5,
h6 {
  line-height: 1.2;
  scroll-margin-top: 1rem;
}

blockquote {
  margin: 1rem 0;
  border-left: 0.25rem solid var(--accent);
  padding: 0.25rem 1rem;
  color: var(--muted);
}

table {
  display: block;
  width: 100%;
  overflow-x: auto;
  border-collapse: collapse;
}

th,
td {
  border: 1px solid var(--border);
  padding: 0.45rem 0.65rem;
  text-align: left;
}

pre {
  overflow: auto;
  border-radius: 0.75rem;
  padding: 1rem;
  background: var(--code-background);
}

.code-block {
  position: relative;
  margin: 1rem 0;
}

.code-block pre {
  margin: 0;
  padding-top: 2.75rem;
}

.copy-code-button {
  position: absolute;
  z-index: 1;
  top: 0.5rem;
  right: 0.5rem;
  border: 1px solid var(--border);
  border-radius: 0.35rem;
  padding: 0.3rem 0.55rem;
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
  font: 0.75rem Inter, ui-sans-serif, system-ui, sans-serif;
}

.copy-code-button:hover {
  background: var(--surface-muted);
}

code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.hljs-comment,
.hljs-quote {
  color: #6a737d;
}

.hljs-keyword,
.hljs-selector-tag,
.hljs-literal,
.hljs-name {
  color: #7c3aed;
}

.hljs-string,
.hljs-title,
.hljs-section,
.hljs-attribute {
  color: #087f5b;
}

.hljs-number,
.hljs-symbol,
.hljs-bullet {
  color: #b45309;
}

.page-navigation {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
  margin-top: 3rem;
  border-top: 1px solid var(--border);
  padding-top: 1rem;
}

.page-navigation a,
.page-navigation span {
  display: block;
  min-height: 3.4rem;
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  padding: 0.55rem 0.7rem;
  text-decoration: none;
}

.page-navigation .next {
  text-align: right;
}

.page-navigation span {
  color: var(--muted);
  opacity: 0.65;
}

.page-navigation small {
  display: block;
  margin-bottom: 0.2rem;
  color: var(--muted);
  font-size: 0.72rem;
  text-transform: uppercase;
}

.back-to-top {
  display: inline-block;
  margin-top: 1.25rem;
  font-size: 0.86rem;
}

.index-main {
  max-width: 68rem;
}

.document-list {
  display: grid;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.document-list a {
  display: block;
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  padding: 0.7rem 0.85rem;
  text-decoration: none;
}

.document-list code {
  display: block;
  margin-top: 0.15rem;
  color: var(--muted);
  font-size: 0.75rem;
}

li + li {
  margin-top: 0.25rem;
}

@media (max-width: 70rem) {
  .document-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .toc {
    position: static;
    max-height: none;
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    padding: 0.8rem 1rem;
  }
}

@media (max-width: 52rem) {
  .site-layout {
    display: block;
  }

  .sidebar {
    border-right: 0;
    border-bottom: 1px solid var(--border);
  }

  .sidebar-panel {
    position: static;
    max-height: none;
  }
}

@media (max-width: 34rem) {
  .site-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .site-header-actions,
  .search-panel,
  .search-controls {
    width: 100%;
  }

  .site-header-actions {
    align-items: flex-start;
    flex-direction: column;
  }

  .page-navigation {
    grid-template-columns: 1fr;
  }

  .page-navigation .next {
    text-align: left;
  }
}

@media print {
  .site-header,
  .sidebar,
  .toc,
  .breadcrumbs,
  .page-navigation,
  .back-to-top,
  .source-link {
    display: none;
  }

  .site-layout,
  .document-layout,
  .index-main {
    display: block;
    max-width: none;
    padding: 0;
  }
}
`;

const script = `/* global URL, document, IntersectionObserver, window */
(() => {
  const root = document.documentElement;
  const select = document.querySelector("#theme-select");
  const storageKey = "resona-docs-theme";
  const themes = new Set(["system", "light", "dark"]);

  const readStoredTheme = () => {
    try {
      const value = window.localStorage.getItem(storageKey);
      if (value && themes.has(value)) return value;
    } catch {
      // file:// storage can be unavailable.
    }
    try {
      const value = window.sessionStorage.getItem(storageKey);
      if (value && themes.has(value)) return value;
    } catch {
      // Session storage can be unavailable too.
    }
    const prefix = storageKey + ":";
    if (window.name.startsWith(prefix)) {
      const value = window.name.slice(prefix.length);
      if (themes.has(value)) return value;
    }
    return "system";
  };

  const storeTheme = (theme) => {
    try {
      window.localStorage.setItem(storageKey, theme);
      return;
    } catch {
      // Continue with the file:// fallbacks.
    }
    try {
      window.sessionStorage.setItem(storageKey, theme);
      return;
    } catch {
      // Continue with the same-tab fallback.
    }
    try {
      window.name = storageKey + ":" + theme;
    } catch {
      // Theme switching still works for the current page.
    }
  };

  const applyTheme = (theme) => {
    if (theme === "system") {
      delete root.dataset.theme;
    } else {
      root.dataset.theme = theme;
    }
    if (select) select.value = theme;
  };

  applyTheme(readStoredTheme());

  select?.addEventListener("change", () => {
    const theme = themes.has(select.value) ? select.value : "system";
    applyTheme(theme);
    storeTheme(theme);
  });

  const copyText = async (text) => {
    if (window.navigator.clipboard?.writeText) {
      await window.navigator.clipboard.writeText(text);
      return;
    }
    if (typeof document.execCommand !== "function") {
      throw new Error("Clipboard access is unavailable");
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    try {
      if (!document.execCommand("copy")) throw new Error("Copy command failed");
    } finally {
      textarea.remove();
    }
  };

  const copyCode = async (button) => {
    const code = button.closest(".code-block")?.querySelector("code");
    if (!code) return;
    try {
      await copyText(code.textContent ?? "");
      button.textContent = "Copied";
      button.dataset.copyState = "copied";
    } catch {
      button.textContent = "Copy unavailable";
      button.dataset.copyState = "failed";
    }
    window.setTimeout(() => {
      button.textContent = "Copy code";
      delete button.dataset.copyState;
    }, 1600);
  };

  document.querySelectorAll('[data-copy-code="true"]').forEach((button) => {
    button.addEventListener("click", () => void copyCode(button));
  });

  const searchInput = document.querySelector("#docs-search");
  const categoryFilter = document.querySelector("#search-category");
  const directoryFilter = document.querySelector("#search-directory");
  const searchResults = document.querySelector("#search-results");
  const searchEntries = Array.isArray(window.__RESONA_DOCS_SEARCH__)
    ? window.__RESONA_DOCS_SEARCH__
    : [];
  const searchApi = window.__RESONA_DOCS_SEARCH_API__;

  const searchHref = (href) => {
    const rootLink = document.querySelector(".site-brand");
    if (!rootLink) return href;
    try {
      return new URL(href, rootLink.href).href;
    } catch {
      return href;
    }
  };

  const renderSearchResults = () => {
    if (!searchResults) return;
    const query = searchInput?.value ?? "";
    searchResults.replaceChildren();
    if (query.trim() === "") {
      searchResults.hidden = true;
      return;
    }
    const results = searchApi?.search(
      searchEntries,
      query,
      categoryFilter?.value ?? "",
      directoryFilter?.value ?? "",
    ) ?? [];
    const summary = document.createElement("p");
    summary.className = "search-summary";
    summary.textContent = results.length + " result" + (results.length === 1 ? "" : "s");
    searchResults.append(summary);
    if (results.length > 0) {
      const list = document.createElement("ol");
      for (const { entry, snippet: resultSnippet } of results) {
        const item = document.createElement("li");
        const link = document.createElement("a");
        link.className = "search-result";
        link.href = searchHref(entry.href);
        const title = document.createElement("span");
        title.className = "search-result-title";
        title.textContent = entry.title;
        const meta = document.createElement("span");
        meta.className = "search-result-meta";
        meta.textContent = entry.category + " · " + entry.path;
        const snippet = document.createElement("span");
        snippet.className = "search-result-snippet";
        snippet.textContent = resultSnippet;
        link.append(title, meta, snippet);
        item.append(link);
        list.append(item);
      }
      searchResults.append(list);
    }
    searchResults.hidden = false;
  };

  document.querySelector(".search-controls")?.addEventListener("submit", (event) => {
    event.preventDefault();
    renderSearchResults();
  });
  searchInput?.addEventListener("input", renderSearchResults);
  categoryFilter?.addEventListener("change", renderSearchResults);
  directoryFilter?.addEventListener("change", renderSearchResults);

  const tocLinks = new Map(
    [...document.querySelectorAll(".toc a[href^=\\"#\\"]")].map((link) => [
      link.getAttribute("href").slice(1),
      link,
    ]),
  );
  const headings = [...document.querySelectorAll("article h2[id], article h3[id]")];
  const setCurrentHeading = (id) => {
    for (const link of tocLinks.values()) {
      if (link.getAttribute("href") === "#" + id) {
        link.setAttribute("aria-current", "location");
      } else {
        link.removeAttribute("aria-current");
      }
    }
  };

  const setCurrentFromScroll = () => {
    const current = headings
      .filter((heading) => heading.getBoundingClientRect().top <= 180)
      .at(-1);
    if (current) setCurrentHeading(current.id);
  };

  if (headings.length) {
    const initialId = window.location.hash.slice(1);
    setCurrentHeading(tocLinks.has(initialId) ? initialId : headings[0].id);
  }

  if (headings.length && "IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => left.boundingClientRect.top - right.boundingClientRect.top)[0];
        if (visible) setCurrentHeading(visible.target.id);
      },
      { rootMargin: "-10% 0px -70% 0px", threshold: 0 },
    );
    headings.forEach((heading) => observer.observe(heading));
  } else if (headings.length) {
    setCurrentFromScroll();
    window.addEventListener("scroll", setCurrentFromScroll, { passive: true });
  }
})();
`;

export type BuildDocumentationSiteOptions = Readonly<{
  projectRoot: string;
  publish?: boolean;
}>;

export type BuildDocumentationSiteResult = Readonly<{
  generatedFiles: readonly string[];
  orphanedFiles: readonly string[];
  outOfDateFiles: readonly string[];
  sourceCount: number;
}>;

type DiscoveredProject = Readonly<{
  allPaths: ReadonlySet<string>;
  files: ReadonlySet<string>;
  markdown: readonly string[];
}>;

export const buildDocumentationSite = async (
  options: BuildDocumentationSiteOptions,
): Promise<BuildDocumentationSiteResult> => {
  const projectRoot = resolve(options.projectRoot);
  const discovered = await discoverProject(projectRoot);
  if (discovered.markdown.some((sourcePath) => relative(projectRoot, sourcePath) === "index.md")) {
    throw new Error("The root index.md is reserved for the generated documentation index.");
  }

  const parsedDocuments = await Promise.all(
    discovered.markdown.map(async (sourcePath) => {
      const source = await readFile(sourcePath, "utf8");
      const relativePath = toPosix(relative(projectRoot, sourcePath));
      return {
        document: parseMarkdownDocument({
          outputPath: join(projectRoot, relativePath.replace(/\.md$/u, ".html")),
          relativePath,
          source,
          sourcePath,
        }),
        sourceHash: hashContent(source),
      };
    }),
  );
  const documents = parsedDocuments.map(({ document }) => document);
  const documentsBySourcePath = new Map(
    documents.map((document) => [document.sourcePath, document]),
  );
  const documentsByOutputPath = new Map(
    documents.map((document) => [document.outputPath, document]),
  );
  const fragmentIdsByPath = await discoverFragmentIds(discovered.files, documentsBySourcePath);
  const referenceAllowlist = await loadReferenceAllowlist(projectRoot);
  const issues: MarkdownBuildIssue[] = [];
  const renderedDocuments = documents.map((document) => ({
    ...document,
    body: renderMarkdownDocument(document, {
      availableFiles: discovered.files,
      availablePaths: discovered.allPaths,
      documentsBySourcePath,
      documentsByOutputPath,
      fragmentIdsByPath,
      issues,
      projectRoot,
      referenceAllowlist,
    }),
  }));
  for (const entry of unusedReferenceAllowlistEntries(referenceAllowlist)) {
    issues.push({
      message: `unused reference allowlist entry (${entry.kind}: ${entry.target})`,
      relativePath: referenceAllowlistRelativePath,
    });
  }
  if (issues.length > 0) throw new MarkdownBuildError(issues);

  const navigation = buildNavigationTree(renderedDocuments);
  const searchIndex = buildSearchIndex(projectRoot, renderedDocuments);
  const searchFilters = buildSearchFilters(searchIndex);
  const backlinks = buildBacklinks(renderedDocuments, documentsByOutputPath);
  const generatedContents = new Map<string, string>();
  const addGeneratedFile = async (path: string, source: string): Promise<void> => {
    generatedContents.set(path, await formatFile(join(projectRoot, path), source));
  };
  await addGeneratedFile(".resona-docs/styles.css", styles);
  await addGeneratedFile(".resona-docs/search-index.js", renderSearchIndexScript(searchIndex));
  await addGeneratedFile(".resona-docs/docs.js", script);

  for (const document of renderedDocuments) {
    await addGeneratedFile(
      toPosix(relative(projectRoot, document.outputPath)),
      renderPage(projectRoot, document, renderedDocuments, navigation, searchFilters, backlinks),
    );
  }

  await addGeneratedFile(
    "index.html",
    renderIndex(projectRoot, renderedDocuments, navigation, searchFilters),
  );

  const previousManifest = await readDocumentationManifest(projectRoot);
  await validateOutputConflicts(projectRoot, generatedContents, previousManifest);
  const orphanedOutputs = await findOrphanedOutputs(
    projectRoot,
    generatedContents,
    previousManifest,
  );
  const manifest: DocumentationManifest = {
    orphanedOutputs,
    outputs: [...generatedContents.entries()].map(([path, content]) => ({
      path,
      sha256: hashContent(content),
    })),
    sources: parsedDocuments.map(({ document, sourceHash }) => ({
      path: document.relativePath,
      sha256: sourceHash,
    })),
    version: documentationManifestVersion,
  };
  const manifestContent = await formatFile(
    join(projectRoot, documentationManifestRelativePath),
    serializeDocumentationManifest(manifest),
  );
  const filesToPublish = new Map(generatedContents);
  filesToPublish.set(documentationManifestRelativePath, manifestContent);
  const outOfDateFiles =
    options.publish === false
      ? await findOutOfDateFiles(projectRoot, filesToPublish, orphanedOutputs)
      : [];
  if (options.publish !== false) await publishGeneratedFiles(projectRoot, filesToPublish);

  return {
    generatedFiles: [...filesToPublish.keys()].sort(compareDeterministically),
    orphanedFiles: orphanedOutputs.map((entry) => entry.path),
    outOfDateFiles,
    sourceCount: documents.length,
  };
};

const formatFile = async (path: string, source: string): Promise<string> => {
  const config = (await resolveConfig(path)) ?? {};
  return formatWithPrettier(source, { ...config, filepath: path });
};

const validateOutputConflicts = async (
  projectRoot: string,
  generatedContents: ReadonlyMap<string, string>,
  previousManifest: DocumentationManifest | undefined,
): Promise<void> => {
  const registered = new Map<string, DocumentationManifestEntry>();
  for (const entry of previousManifest?.outputs ?? []) registered.set(entry.path, entry);
  for (const entry of previousManifest?.orphanedOutputs ?? []) registered.set(entry.path, entry);

  for (const [path, content] of generatedContents) {
    const currentHash = await existingFileHash(projectRoot, path);
    if (currentHash === undefined) continue;
    const previousEntry = registered.get(path);
    if (previousEntry !== undefined) {
      if (currentHash !== previousEntry.sha256) {
        throw new Error(`generated output conflict: ${path} was modified outside the build`);
      }
      continue;
    }
    if (previousManifest === undefined && currentHash === hashContent(content)) continue;
    throw new Error(`manual output conflict: ${path} already exists`);
  }
};

const findOrphanedOutputs = async (
  projectRoot: string,
  generatedContents: ReadonlyMap<string, string>,
  previousManifest: DocumentationManifest | undefined,
): Promise<DocumentationManifestEntry[]> => {
  if (previousManifest === undefined) return [];
  const expectedPaths = new Set(generatedContents.keys());
  const orphaned: DocumentationManifestEntry[] = [];
  for (const entry of [...previousManifest.outputs, ...previousManifest.orphanedOutputs]) {
    if (expectedPaths.has(entry.path)) continue;
    const currentHash = await existingFileHash(projectRoot, entry.path);
    if (currentHash === undefined) continue;
    if (currentHash !== entry.sha256) {
      throw new Error(
        `orphaned generated output conflict: ${entry.path} was modified outside the build`,
      );
    }
    orphaned.push(entry);
  }
  return orphaned.sort((left, right) => compareDeterministically(left.path, right.path));
};

const findOutOfDateFiles = async (
  projectRoot: string,
  generatedContents: ReadonlyMap<string, string>,
  orphanedOutputs: readonly DocumentationManifestEntry[],
): Promise<string[]> => {
  const outOfDate = new Set(orphanedOutputs.map((entry) => entry.path));
  for (const [path, content] of generatedContents) {
    if ((await existingFileHash(projectRoot, path)) !== hashContent(content)) outOfDate.add(path);
  }
  return [...outOfDate].sort(compareDeterministically);
};

const publishGeneratedFiles = async (
  projectRoot: string,
  files: ReadonlyMap<string, string>,
): Promise<void> => {
  const stageRoot = await mkdtemp(join(projectRoot, ".resona-docs-stage-"));
  const backupRoot = await mkdtemp(join(projectRoot, ".resona-docs-backup-"));
  const paths = [...files.keys()].sort((left, right) => {
    if (left === documentationManifestRelativePath) return 1;
    if (right === documentationManifestRelativePath) return -1;
    return compareDeterministically(left, right);
  });
  const backedUp: string[] = [];
  const published: string[] = [];

  try {
    for (const path of paths) {
      const stagedPath = join(stageRoot, path);
      await mkdir(dirname(stagedPath), { recursive: true });
      await writeFile(stagedPath, files.get(path) ?? "", "utf8");
      if ((await hashFile(stagedPath)) !== hashContent(files.get(path) ?? "")) {
        throw new Error(`staged output changed before publication: ${path}`);
      }
    }

    for (const path of paths) {
      const targetPath = join(projectRoot, path);
      if (await pathExists(targetPath)) {
        const backupPath = join(backupRoot, path);
        await mkdir(dirname(backupPath), { recursive: true });
        await rename(targetPath, backupPath);
        backedUp.push(path);
      }
      await mkdir(dirname(targetPath), { recursive: true });
      await rename(join(stageRoot, path), targetPath);
      published.push(path);
    }
  } catch (error) {
    await rollbackPublication(projectRoot, backupRoot, published, backedUp);
    throw error;
  } finally {
    await Promise.allSettled([
      rm(stageRoot, { force: true, recursive: true }),
      rm(backupRoot, { force: true, recursive: true }),
    ]);
  }
};

const rollbackPublication = async (
  projectRoot: string,
  backupRoot: string,
  published: readonly string[],
  backedUp: readonly string[],
): Promise<void> => {
  for (const path of [...published].reverse()) {
    await rm(join(projectRoot, path), { force: true });
  }
  for (const path of [...backedUp].reverse()) {
    const backupPath = join(backupRoot, path);
    if (!(await pathExists(backupPath))) continue;
    const targetPath = join(projectRoot, path);
    await mkdir(dirname(targetPath), { recursive: true });
    await rename(backupPath, targetPath);
  }
};

const existingFileHash = async (projectRoot: string, path: string): Promise<string | undefined> => {
  const targetPath = join(projectRoot, path);
  let metadata;
  try {
    metadata = await lstat(targetPath);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return undefined;
    throw error;
  }
  if (!metadata.isFile()) throw new Error(`generated output conflict: ${path} is not a file`);
  return hashFile(targetPath);
};

const pathExists = async (path: string): Promise<boolean> => {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return false;
    throw error;
  }
};

const isNodeError = (error: unknown): error is NodeJS.ErrnoException =>
  error instanceof Error && "code" in error;

const discoverProject = async (projectRoot: string): Promise<DiscoveredProject> => {
  const markdown: string[] = [];
  const allPaths = new Set<string>([projectRoot]);
  const files = new Set<string>();

  const visit = async (directory: string): Promise<void> => {
    const entries = (await readdir(directory, { withFileTypes: true })).sort((left, right) =>
      compareDeterministically(left.name, right.name),
    );
    for (const entry of entries) {
      if (
        entry.isDirectory() &&
        (excludedDirectories.has(entry.name) ||
          entry.name.startsWith(".resona-docs-stage-") ||
          entry.name.startsWith(".resona-docs-backup-"))
      ) {
        continue;
      }
      const entryPath = join(directory, entry.name);
      allPaths.add(entryPath);
      if (entry.isDirectory()) {
        await visit(entryPath);
      } else if (entry.isFile()) {
        files.add(entryPath);
        if (extname(entry.name) === ".md") markdown.push(entryPath);
      }
    }
  };

  await visit(projectRoot);
  return {
    allPaths,
    files,
    markdown: markdown.sort(compareDeterministically),
  };
};

const discoverFragmentIds = async (
  files: ReadonlySet<string>,
  documentsBySourcePath: ReadonlyMap<string, MarkdownDocument>,
): Promise<ReadonlyMap<string, ReadonlySet<string>>> => {
  const fragments = new Map<string, ReadonlySet<string>>(
    [...documentsBySourcePath.values()].map((document) => [
      document.sourcePath,
      document.headingIds,
    ]),
  );
  const htmlFiles = [...files].filter((path) => /\.(?:html?|svg)$/iu.test(extname(path)));
  await Promise.all(
    htmlFiles.map(async (path) => {
      fragments.set(path, extractHtmlFragmentIds(await readFile(path, "utf8")));
    }),
  );
  return fragments;
};

const extractHtmlFragmentIds = (source: string): ReadonlySet<string> => {
  const ids = new Set<string>();
  const attribute = /\b(?:id|name)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/giu;
  for (const match of source.matchAll(attribute)) {
    const value = match[1] ?? match[2] ?? match[3];
    if (value !== undefined) ids.add(value);
  }
  return ids;
};

type NavigationDirectory = {
  directories: NavigationDirectory[];
  documents: MarkdownDocument[];
  name: string;
  path: string;
};

type DocumentCategory = "ADR" | "Agent skill" | "Other" | "Package context" | "Research" | "Root";

type SearchIndexEntry = Readonly<{
  body: string;
  category: DocumentCategory;
  code: string;
  directory: string;
  headings: readonly string[];
  href: string;
  path: string;
  snippet: string;
  title: string;
}>;

type SearchFilters = Readonly<{
  categories: readonly DocumentCategory[];
  directories: readonly string[];
}>;

const buildNavigationTree = (documents: readonly MarkdownDocument[]): NavigationDirectory => {
  const root: NavigationDirectory = { directories: [], documents: [], name: "", path: "" };
  for (const document of documents) {
    const segments = document.relativePath.split("/");
    let directory = root;
    const directorySegments = segments.slice(0, -1);
    for (const [index, name] of directorySegments.entries()) {
      const path = directorySegments.slice(0, index + 1).join("/");
      let child = directory.directories.find((candidate) => candidate.path === path);
      if (child === undefined) {
        child = { directories: [], documents: [], name, path };
        directory.directories.push(child);
      }
      directory = child;
    }
    directory.documents.push(document);
  }
  sortNavigationTree(root);
  return root;
};

const sortNavigationTree = (directory: NavigationDirectory): void => {
  directory.directories.sort((left, right) => compareDeterministically(left.name, right.name));
  directory.documents.sort((left, right) =>
    compareDeterministically(left.relativePath, right.relativePath),
  );
  directory.directories.forEach(sortNavigationTree);
};

const buildSearchIndex = (
  projectRoot: string,
  documents: readonly MarkdownDocument[],
): readonly SearchIndexEntry[] =>
  documents.map((document) => ({
    body: document.searchText,
    category: documentCategory(document.relativePath),
    code: document.searchCode,
    directory: directoryForSearch(document.relativePath),
    headings: document.headings.map((heading) => heading.text),
    href: toPosix(relative(projectRoot, document.outputPath)),
    path: document.relativePath,
    snippet: snippetForSearch(document.searchText),
    title: document.title,
  }));

const buildSearchFilters = (entries: readonly SearchIndexEntry[]): SearchFilters => ({
  categories: [...new Set(entries.map((entry) => entry.category))].sort(compareDeterministically),
  directories: [...new Set(entries.map((entry) => entry.directory))].sort(compareDeterministically),
});

const renderSearchIndexScript = (entries: readonly SearchIndexEntry[]): string =>
  `/* global window */
window.__RESONA_DOCS_SEARCH__ = ${JSON.stringify(entries)};
window.__RESONA_DOCS_SEARCH_API__ = (() => {
  const normalizeText = (value) => value.normalize("NFD").replace(/\\p{Mark}/gu, "").toLowerCase();

  const scoreEntry = (entry, terms, category, directory) => {
    if (category && entry.category !== category) return null;
    if (directory && entry.directory !== directory) return null;
    const fields = [
      [normalizeText(entry.title), 100],
      [normalizeText(entry.path), 80],
      [normalizeText(entry.headings.join(" ")), 60],
      [normalizeText(entry.body), 20],
      [normalizeText(entry.code), 10],
    ];
    let score = 0;
    for (const term of terms) {
      let matched = false;
      for (const [field, weight] of fields) {
        if (field.includes(term)) {
          score += weight;
          matched = true;
        }
      }
      if (!matched) return null;
    }
    return score;
  };

  const searchSnippet = (entry, terms) => {
    const candidates = [entry.body, entry.code, entry.headings.join(" "), entry.path, entry.title];
    for (const candidate of candidates) {
      const normalized = normalizeText(candidate);
      const position = terms.map((term) => normalized.indexOf(term)).find((index) => index >= 0);
      if (position === undefined || position < 0) continue;
      const start = Math.max(0, position - 75);
      const end = Math.min(candidate.length, position + 145);
      return (start > 0 ? "..." : "") + candidate.slice(start, end) + (end < candidate.length ? "..." : "");
    }
    return entry.snippet;
  };

  const search = (entries, query, category, directory) => {
    const normalizedQuery = normalizeText(query).trim();
    if (normalizedQuery === "") return [];
    const terms = normalizedQuery.split(/\\s+/u).filter(Boolean);
    return entries
      .map((entry) => ({ entry, score: scoreEntry(entry, terms, category, directory) }))
      .filter((result) => result.score !== null)
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.entry.title.localeCompare(right.entry.title) ||
          left.entry.path.localeCompare(right.entry.path),
      )
      .slice(0, 30)
      .map(({ entry, score }) => ({ entry, score, snippet: searchSnippet(entry, terms) }));
  };

  return { normalizeText, search };
})();
`;

const renderSearchControls = (filters: SearchFilters): string => {
  const categories = filters.categories
    .map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`)
    .join("\n");
  const directories = filters.directories
    .map(
      (directory) => `<option value="${escapeHtml(directory)}">${escapeHtml(directory)}</option>`,
    )
    .join("\n");
  return `<div class="search-panel">
  <form class="search-controls" role="search">
    <label class="visually-hidden" for="docs-search">Search documentation</label>
    <input id="docs-search" type="search" autocomplete="off" placeholder="Search docs" />
    <label class="visually-hidden" for="search-category">Filter by category</label>
    <select id="search-category" name="category">
      <option value="">All categories</option>
${indentBlock(categories, 6)}
    </select>
    <label class="visually-hidden" for="search-directory">Filter by directory</label>
    <select id="search-directory" name="directory">
      <option value="">All directories</option>
${indentBlock(directories, 6)}
    </select>
  </form>
  <div id="search-results" class="search-results" role="status" aria-live="polite" hidden></div>
</div>`;
};

const buildBacklinks = (
  documents: readonly MarkdownDocument[],
  documentsByOutputPath: ReadonlyMap<string, MarkdownDocument>,
): ReadonlyMap<string, readonly MarkdownDocument[]> => {
  const backlinks = new Map<string, MarkdownDocument[]>();
  const linkPattern = /<a\b[^>]*\bhref=(?:"([^"]*)"|'([^']*)')/giu;
  for (const source of documents) {
    const linkedTargets = new Set<string>();
    for (const match of source.body.matchAll(linkPattern)) {
      const href = decodeHtmlAttribute(match[1] ?? match[2] ?? "");
      const path = href.split(/[?#]/u)[0] ?? "";
      if (path === "") continue;
      const target = documentsByOutputPath.get(resolve(dirname(source.outputPath), path));
      if (target === undefined || target.sourcePath === source.sourcePath) continue;
      if (linkedTargets.has(target.sourcePath)) continue;
      linkedTargets.add(target.sourcePath);
      const sources = backlinks.get(target.sourcePath) ?? [];
      sources.push(source);
      backlinks.set(target.sourcePath, sources);
    }
  }
  for (const sources of backlinks.values()) {
    sources.sort((left, right) => compareDeterministically(left.relativePath, right.relativePath));
  }
  return backlinks;
};

const renderBacklinks = (
  document: MarkdownDocument,
  backlinks: ReadonlyMap<string, readonly MarkdownDocument[]>,
): string => {
  const sources = backlinks.get(document.sourcePath) ?? [];
  if (sources.length === 0) return "";
  const links = sources
    .map(
      (source) =>
        `    <li><a href="${escapeHtml(hrefFromOutput(document.outputPath, source.outputPath))}">${escapeHtml(source.title)}</a> <code>${escapeHtml(source.relativePath)}</code></li>`,
    )
    .join("\n");
  return `<section class="backlinks" aria-labelledby="backlinks">
  <h2 id="backlinks">Referenced by</h2>
  <ul>
${links}
  </ul>
</section>`;
};

const directoryForSearch = (relativePath: string): string => {
  const separator = relativePath.lastIndexOf("/");
  return separator === -1 ? "(root)" : relativePath.slice(0, separator);
};

const snippetForSearch = (value: string): string => {
  const compact = value.replace(/\s+/gu, " ").trim();
  return compact.length > 220 ? `${compact.slice(0, 217)}...` : compact;
};

const decodeHtmlAttribute = (value: string): string =>
  value.replaceAll("&amp;", "&").replaceAll("&quot;", '"').replaceAll("&#39;", "'");

const renderPage = (
  projectRoot: string,
  document: MarkdownDocument,
  documents: readonly MarkdownDocument[],
  navigation: NavigationDirectory,
  searchFilters: SearchFilters,
  backlinks: ReadonlyMap<string, readonly MarkdownDocument[]>,
): string => {
  const stylesheet = toPosix(
    relative(dirname(document.outputPath), join(projectRoot, ".resona-docs", "styles.css")),
  );
  const rootHref = hrefFromOutput(document.outputPath, join(projectRoot, "index.html"));
  const metadata = renderFrontmatter(document.frontmatter);
  const category = documentCategory(document.relativePath);
  const toc = renderTableOfContents(document);
  const index = documents.findIndex(
    (candidate) => candidate.relativePath === document.relativePath,
  );
  const previous = index > 0 ? documents[index - 1] : undefined;
  const next = index >= 0 ? documents[index + 1] : undefined;
  const main = `    <main id="content" class="document-layout">
      <article class="document-content">
        ${renderBreadcrumbs(projectRoot, document)}
        <header class="document-header">
          <p class="source-path">${escapeHtml(document.relativePath)} <a class="source-link" href="${escapeHtml(hrefFromOutput(document.outputPath, document.sourcePath))}">View Markdown source</a></p>
          <div class="badges"><span class="category-badge">${escapeHtml(category)}</span></div>
        </header>
${metadata}
        <div class="markdown-body">
${indentBlock(document.body, 10)}
        </div>
${indentBlock(renderBacklinks(document, backlinks), 8)}
${indentBlock(renderPageNavigation(document.outputPath, previous, next), 8)}
        <a class="back-to-top" href="#top">Back to top</a>
      </article>
${indentBlock(toc, 6)}
    </main>`;
  return renderHtmlDocument({
    body: renderSiteBody(
      rootHref,
      document.outputPath,
      join(projectRoot, "index.html"),
      navigation,
      searchFilters,
      main,
      document,
    ),
    searchScript: hrefFromOutput(
      document.outputPath,
      join(projectRoot, ".resona-docs", "search-index.js"),
    ),
    script: hrefFromOutput(document.outputPath, join(projectRoot, ".resona-docs", "docs.js")),
    stylesheet,
    title: `${document.title} · Resona`,
  });
};

const renderIndex = (
  projectRoot: string,
  documents: readonly MarkdownDocument[],
  navigation: NavigationDirectory,
  searchFilters: SearchFilters,
): string => {
  const links = documents
    .map((document) => {
      const href = hrefFromOutput(join(projectRoot, "index.html"), document.outputPath);
      return `          <li><a href="${escapeHtml(href)}">${escapeHtml(document.title)}</a><code>${escapeHtml(document.relativePath)}</code></li>`;
    })
    .join("\n");
  const stylesheet = toPosix(
    relative(projectRoot, join(projectRoot, ".resona-docs", "styles.css")),
  );
  const main = `    <main id="content" class="index-main">
      <article>
        <header class="document-header">
          <div class="badges"><span class="category-badge">Root</span></div>
          <h1>Resona documentation</h1>
        </header>
        <p>Generated from ${documents.length} Markdown files. Use the navigation tree or search the list below.</p>
        <section aria-labelledby="all-documents">
          <h2 id="all-documents">All documents</h2>
          <ul class="document-list">
${links}
          </ul>
        </section>
      </article>
    </main>`;
  return renderHtmlDocument({
    body: renderSiteBody(
      "index.html",
      join(projectRoot, "index.html"),
      join(projectRoot, "index.html"),
      navigation,
      searchFilters,
      main,
    ),
    searchScript: ".resona-docs/search-index.js",
    script: ".resona-docs/docs.js",
    stylesheet,
    title: "Resona documentation",
  });
};

const renderSiteBody = (
  rootHref: string,
  currentOutputPath: string,
  rootOutputPath: string,
  navigation: NavigationDirectory,
  searchFilters: SearchFilters,
  main: string,
  currentDocument?: MarkdownDocument,
): string => `    <a class="skip-link" href="#content">Skip to content</a>
    <header class="site-header">
      <a class="site-brand" href="${escapeHtml(rootHref)}">Resona documentation</a>
      <div class="site-header-actions">
${indentBlock(renderSearchControls(searchFilters), 8)}
        <label class="theme-control" for="theme-select">
          <span>Theme</span>
          <select id="theme-select" name="theme">
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
      </div>
    </header>
    <div class="site-layout">
      <aside class="sidebar" aria-label="Documentation navigation">
${indentBlock(renderSidebar(currentOutputPath, rootOutputPath, navigation, currentDocument), 8)}
      </aside>
      <div class="content-column">
${main}
      </div>
    </div>`;

type HtmlDocumentOptions = Readonly<{
  body: string;
  searchScript: string;
  script: string;
  stylesheet: string;
  title: string;
}>;

const renderHtmlDocument = ({
  body,
  searchScript,
  script,
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
    <script src="${escapeHtml(searchScript)}" defer></script>
    <script src="${escapeHtml(script)}" defer></script>
  </body>
</html>
`;

const renderSidebar = (
  currentOutputPath: string,
  rootOutputPath: string,
  navigation: NavigationDirectory,
  currentDocument?: MarkdownDocument,
): string => `<details class="sidebar-panel" open>
  <summary>Documentation navigation</summary>
  <nav aria-label="All documents">
    <a class="nav-document" href="${escapeHtml(hrefFromOutput(currentOutputPath, rootOutputPath))}">
      <span class="nav-title">Resona documentation</span>
      <span class="nav-path">index.html</span>
    </a>
${renderNavigationDirectory(navigation, currentOutputPath, currentDocument, true)}
  </nav>
</details>`;

const renderNavigationDirectory = (
  directory: NavigationDirectory,
  currentOutputPath: string,
  currentDocument: MarkdownDocument | undefined,
  isRoot = false,
): string => {
  const children = [
    ...directory.directories.map((child) => {
      const open =
        currentDocument !== undefined &&
        (currentDocument.relativePath === child.path ||
          currentDocument.relativePath.startsWith(`${child.path}/`));
      return `      <li>
        <details${open ? " open" : ""}>
          <summary>${escapeHtml(child.name)}</summary>
${indentBlock(renderNavigationDirectory(child, currentOutputPath, currentDocument), 10)}
        </details>
      </li>`;
    }),
    ...directory.documents.map((document) => {
      const current = currentDocument?.relativePath === document.relativePath;
      return `      <li><a class="nav-document" href="${escapeHtml(hrefFromOutput(currentOutputPath, document.outputPath))}"${current ? ' aria-current="page"' : ""}>
        <span class="nav-title">${escapeHtml(document.title)}</span>
        <span class="nav-path">${escapeHtml(document.relativePath)}</span>
      </a></li>`;
    }),
  ].join("\n");
  const className = isRoot ? "nav-tree" : "nav-tree nav-tree-nested";
  return `    <ul class="${className}">
${children}
    </ul>`;
};

const renderBreadcrumbs = (projectRoot: string, document: MarkdownDocument): string => {
  const segments = document.relativePath.split("/");
  const items = [
    `<li><a href="${escapeHtml(hrefFromOutput(document.outputPath, join(projectRoot, "index.html")))}">Resona docs</a></li>`,
    ...segments.slice(0, -1).map((segment) => `<li><span>${escapeHtml(segment)}</span></li>`),
    `<li aria-current="page">${escapeHtml(document.title)}</li>`,
  ].join("\n");
  return `<nav class="breadcrumbs" aria-label="Breadcrumb">
  <ol>
${indentBlock(items, 4)}
  </ol>
</nav>`;
};

const renderTableOfContents = (document: MarkdownDocument): string => {
  const headings = document.headings.filter(
    (heading) => heading.depth === 2 || heading.depth === 3,
  );
  if (headings.length === 0) return "";
  const items = headings
    .map(
      (heading) =>
        `      <li class="toc-depth-${heading.depth}"><a href="#${escapeHtml(heading.id)}">${escapeHtml(heading.text)}</a></li>`,
    )
    .join("\n");
  return `<aside class="toc" aria-label="On this page">
  <p class="toc-title">On this page</p>
  <nav>
    <ol>
${items}
    </ol>
  </nav>
</aside>`;
};

const renderPageNavigation = (
  currentOutputPath: string,
  previous: MarkdownDocument | undefined,
  next: MarkdownDocument | undefined,
): string => `<nav class="page-navigation" aria-label="Document navigation">
  ${renderAdjacentDocument("previous", "Previous", currentOutputPath, previous)}
  ${renderAdjacentDocument("next", "Next", currentOutputPath, next)}
</nav>`;

const renderAdjacentDocument = (
  direction: "next" | "previous",
  label: string,
  currentOutputPath: string,
  document: MarkdownDocument | undefined,
): string => {
  if (document === undefined) {
    return `<span class="${direction}" aria-disabled="true"><small>${label}</small>—</span>`;
  }
  return `<a class="${direction}" href="${escapeHtml(hrefFromOutput(currentOutputPath, document.outputPath))}">
    <small>${label}</small>${escapeHtml(document.title)}
  </a>`;
};

const documentCategory = (relativePath: string): DocumentCategory => {
  if (relativePath.includes("/adr/")) return "ADR";
  if (relativePath.startsWith("docs/research/")) return "Research";
  if (relativePath.startsWith(".agents/skills/")) return "Agent skill";
  if (relativePath.startsWith("packages/") && relativePath.endsWith("/CONTEXT.md")) {
    return "Package context";
  }
  if (!relativePath.includes("/")) return "Root";
  return "Other";
};

const hrefFromOutput = (fromOutputPath: string, targetPath: string): string => {
  const href = toPosix(relative(dirname(fromOutputPath), targetPath));
  return href === "" ? basename(targetPath) : href;
};

const indentBlock = (value: string, spaces: number): string => {
  if (value === "") return "";
  const prefix = " ".repeat(spaces);
  return value
    .split("\n")
    .map((line) => (line === "" ? line : `${prefix}${line}`))
    .join("\n");
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
