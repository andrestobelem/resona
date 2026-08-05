# CLI context

`@resona/cli` is a thin Node adapter over the engine. It discovers a project root, translates
flags and JSON inputs, and delegates composition enumeration and variant validation to the
same registry and `createRenderJob()` used by the programmatic API. It never evaluates TSX in
the terminal process and never renders audio itself.

`compositions` and `validate` emit human-readable text by default. With `--json`, stdout is a
single versioned protocol document and incidental diagnostics stay in stderr. Exit codes are
stable: `0` success, `1` domain failure, `2` usage or configuration failure, and `130`
cancellation.

The CLI resolves a project root from an explicit `--config`, the nearest `resona.config.ts`,
or the initial working directory. The engine API continues to require an absolute root.
