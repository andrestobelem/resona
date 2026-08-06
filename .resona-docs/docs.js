/* global URL, document, IntersectionObserver, window */
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
    const results =
      searchApi?.search(
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
    [...document.querySelectorAll('.toc a[href^="#"]')].map((link) => [
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
    const current = headings.filter((heading) => heading.getBoundingClientRect().top <= 180).at(-1);
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
