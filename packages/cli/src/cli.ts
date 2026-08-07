import { readFile, realpath, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createRenderJob,
  loadProjectCompositions,
  ResonaError,
  type Diagnostic,
  type JsonObject,
} from "@resona/engine";
import {
  renderAudioToFile,
  type RenderAudioToFileOptions,
  type RenderProgress,
} from "@resona/renderer";
import { startStudioServer } from "./studio-server.js";
import { runSkills, SkillsUsageError, skillsHelp } from "./skills.js";

const usage = `Usage:
  resona studio [entry] [--config <path>] [--json]
  resona compositions [entry] [--config <path>] [--json]
  resona validate [entry] --composition <id> [--input <json>] [--input-file <path>] [--seed <seed>] [--config <path>] [--json]
  resona render [entry] <composition-id> <output.wav> [--input <json>] [--input-file <path>] [--seed <seed>] [--start-frame <n>] [--end-frame <n>] [--tail-frames <n>] [--block-frames <n>] [--options <json>] [--overwrite] [--config <path>] [--json]`;

export type CliOutput = {
  stdout: string;
  stderr: string;
};

type CliContext = Readonly<{
  cwd: string;
  output: { stdout: string; stderr: string };
  signal?: AbortSignal;
  flush?: () => void;
  environment?: NodeJS.ProcessEnv;
}>;

type ParsedArgs = Readonly<{
  command?: string;
  positionals: readonly string[];
  entry?: string;
  config?: string;
  composition?: string;
  input?: JsonObject;
  inputFile?: string;
  seed?: string;
  output?: string;
  overwrite?: boolean;
  startFrame?: number;
  endFrame?: number;
  tailFrames?: number;
  blockFrames?: number;
  renderOptions?: JsonObject;
  force?: boolean;
  json: boolean;
  help: boolean;
}>;

type ProjectLocation = Readonly<{
  root: string;
  configPath?: string;
  entryPoint?: string;
}>;

class CliUsageError extends Error {}

class CliCancellationError extends Error {}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const parseInput = (source: string): JsonObject => {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new CliUsageError("Input JSON is invalid.");
  }
  if (!isRecord(value)) {
    throw new CliUsageError("Inputs must be a JSON object.");
  }
  return value as JsonObject;
};

const readOption = (argv: readonly string[], index: number, option: string): string => {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new CliUsageError(`${option} requires a value.`);
  }
  return value;
};

const parseFrame = (source: string, option: string): number => {
  if (!/^\d+$/.test(source)) throw new CliUsageError(`${option} must be a non-negative integer.`);
  const value = Number(source);
  if (!Number.isSafeInteger(value)) {
    throw new CliUsageError(`${option} must be a safe integer.`);
  }
  return value;
};

const parseArgs = (argv: readonly string[]): ParsedArgs => {
  const [command, ...rest] = argv;
  const positional: string[] = [];
  let config: string | undefined;
  let composition: string | undefined;
  let input: JsonObject | undefined;
  let inputFile: string | undefined;
  let seed: string | undefined;
  let output: string | undefined;
  let overwrite = false;
  let startFrame: number | undefined;
  let endFrame: number | undefined;
  let tailFrames: number | undefined;
  let blockFrames: number | undefined;
  let renderOptions: JsonObject | undefined;
  let force = false;
  let json = false;
  let help = false;

  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    if (argument === undefined) continue;
    if (argument === "--json") {
      json = true;
      continue;
    }
    if (argument === "--help" || argument === "-h") {
      help = true;
      continue;
    }
    if (argument === "--config") {
      if (config !== undefined) throw new CliUsageError("--config may be provided once.");
      config = readOption(rest, index, "--config");
      index += 1;
      continue;
    }
    if (argument === "--composition") {
      if (composition !== undefined) {
        throw new CliUsageError("--composition may be provided once.");
      }
      composition = readOption(rest, index, "--composition");
      index += 1;
      continue;
    }
    if (argument === "--input" || argument === "--inputs") {
      if (input !== undefined || inputFile !== undefined) {
        throw new CliUsageError("Choose one input source: --input or --input-file.");
      }
      input = parseInput(readOption(rest, index, argument));
      index += 1;
      continue;
    }
    if (argument === "--input-file") {
      if (input !== undefined || inputFile !== undefined) {
        throw new CliUsageError("Choose one input source: --input or --input-file.");
      }
      inputFile = readOption(rest, index, "--input-file");
      index += 1;
      continue;
    }
    if (argument === "--seed") {
      if (seed !== undefined) throw new CliUsageError("--seed may be provided once.");
      seed = readOption(rest, index, "--seed");
      index += 1;
      continue;
    }
    if (argument === "--output") {
      if (output !== undefined) throw new CliUsageError("--output may be provided once.");
      output = readOption(rest, index, "--output");
      index += 1;
      continue;
    }
    if (argument === "--overwrite") {
      overwrite = true;
      continue;
    }
    if (argument === "--force") {
      force = true;
      continue;
    }
    if (argument === "--options" || argument === "--render-options") {
      if (renderOptions !== undefined) {
        throw new CliUsageError("--options may be provided once.");
      }
      renderOptions = parseInput(readOption(rest, index, argument));
      index += 1;
      continue;
    }
    if (
      argument === "--start-frame" ||
      argument === "--end-frame" ||
      argument === "--tail-frames" ||
      argument === "--block-frames"
    ) {
      const value = parseFrame(readOption(rest, index, argument), argument);
      if (argument === "--start-frame") {
        if (startFrame !== undefined)
          throw new CliUsageError("--start-frame may be provided once.");
        startFrame = value;
      } else if (argument === "--end-frame") {
        if (endFrame !== undefined) throw new CliUsageError("--end-frame may be provided once.");
        endFrame = value;
      } else if (argument === "--tail-frames") {
        if (tailFrames !== undefined)
          throw new CliUsageError("--tail-frames may be provided once.");
        tailFrames = value;
      } else {
        if (blockFrames !== undefined)
          throw new CliUsageError("--block-frames may be provided once.");
        if (value === 0) throw new CliUsageError("--block-frames must be positive.");
        blockFrames = value;
      }
      index += 1;
      continue;
    }
    if (argument.startsWith("-")) {
      throw new CliUsageError(`Unknown option: ${argument}.`);
    }
    positional.push(argument);
  }

  if (command !== "render" && command !== "skills" && positional.length > 1) {
    throw new CliUsageError("Only one project entry may be provided.");
  }
  if (command === "render" && positional.length > 3) {
    throw new CliUsageError("render accepts at most an entry, composition, and output positional.");
  }
  return {
    ...(command === undefined ? {} : { command }),
    positionals: positional,
    ...(positional[0] === undefined ? {} : { entry: positional[0] }),
    ...(config === undefined ? {} : { config }),
    ...(composition === undefined ? {} : { composition }),
    ...(input === undefined ? {} : { input }),
    ...(inputFile === undefined ? {} : { inputFile }),
    ...(seed === undefined ? {} : { seed }),
    ...(output === undefined ? {} : { output }),
    ...(overwrite ? { overwrite } : {}),
    ...(startFrame === undefined ? {} : { startFrame }),
    ...(endFrame === undefined ? {} : { endFrame }),
    ...(tailFrames === undefined ? {} : { tailFrames }),
    ...(blockFrames === undefined ? {} : { blockFrames }),
    ...(renderOptions === undefined ? {} : { renderOptions }),
    ...(force ? { force } : {}),
    json,
    help,
  };
};

const projectConfigName = "resona.config.ts";

const nearestConfig = async (start: string): Promise<string | undefined> => {
  let directory = resolve(start);
  while (true) {
    const candidate = join(directory, projectConfigName);
    try {
      const details = await stat(candidate);
      if (details.isFile()) return candidate;
    } catch {
      // Continue searching toward the filesystem root.
    }
    const parent = dirname(directory);
    if (parent === directory) return undefined;
    directory = parent;
  }
};

const resolveProjectRoot = async (
  cwd: string,
  entry: string | undefined,
  config: string | undefined,
): Promise<ProjectLocation> => {
  if (config !== undefined) {
    const configPath = resolve(cwd, config);
    let details;
    try {
      details = await stat(configPath);
    } catch {
      throw new CliUsageError(`Config file not found: ${configPath}.`);
    }
    if (!details.isFile()) throw new CliUsageError(`Config path is not a file: ${configPath}.`);
    const root = await realpath(dirname(configPath));
    return {
      root,
      configPath: await realpath(configPath),
      ...(entry === undefined ? {} : { entryPoint: await resolveEntryPoint(cwd, entry, root) }),
    };
  }

  const workingDirectory = resolve(cwd);
  const configPath = await nearestConfig(workingDirectory);
  let root = await realpath(configPath === undefined ? workingDirectory : dirname(configPath));
  if (entry !== undefined) {
    const entryPath = resolve(cwd, entry);
    const details = await entryDetails(entryPath);
    if (details.isDirectory() && configPath === undefined) root = await realpath(entryPath);
    else if (details.isDirectory()) {
      throw new CliUsageError("A directory entry cannot be combined with a discovered config.");
    } else {
      return {
        root,
        ...(configPath === undefined ? {} : { configPath: await realpath(configPath) }),
        entryPoint: await resolveEntryPoint(cwd, entry, root),
      };
    }
  }
  return {
    root,
    ...(configPath === undefined ? {} : { configPath: await realpath(configPath) }),
  };
};

const entryDetails = async (entryPath: string) => {
  try {
    return await stat(entryPath);
  } catch {
    throw new CliUsageError(`Project entry not found: ${entryPath}.`);
  }
};

const resolveEntryPoint = async (
  cwd: string,
  entry: string,
  projectRoot: string,
): Promise<string> => {
  const entryPath = resolve(cwd, entry);
  const details = await entryDetails(entryPath);
  if (!details.isFile()) throw new CliUsageError(`Project entry is not a file: ${entryPath}.`);
  const canonicalEntry = await realpath(entryPath);
  if (
    canonicalEntry !== projectRoot &&
    !canonicalEntry.startsWith(`${projectRoot}/`) &&
    !canonicalEntry.startsWith(`${projectRoot}\\`)
  ) {
    throw new CliUsageError("Project entry must remain inside the project root.");
  }
  return canonicalEntry;
};

const writeJson = (output: CliContext["output"], document: unknown): void => {
  output.stdout += `${JSON.stringify(document)}\n`;
};

const diagnosticSummary = (diagnostics: readonly Diagnostic[]): string => {
  const errors = diagnostics.filter(({ severity }) => severity === "error").length;
  const warnings = diagnostics.filter(({ severity }) => severity === "warning").length;
  return `${errors} error${errors === 1 ? "" : "s"}, ${warnings} warning${warnings === 1 ? "" : "s"}`;
};

const humanDiagnostics = (
  output: CliContext["output"],
  diagnostics: readonly Diagnostic[],
): void => {
  for (const diagnostic of diagnostics) {
    output.stderr += `[${diagnostic.severity}] ${diagnostic.code}: ${diagnostic.message}\n`;
  }
};

const isCancellation = (error: unknown, signal: AbortSignal | undefined): boolean => {
  if (signal?.aborted === true || error instanceof CliCancellationError) return true;
  return (
    error instanceof ResonaError &&
    error.diagnostics.some(
      ({ code }) => code === "preparation.cancelled" || code === "render.cancelled",
    )
  );
};

const diagnosticsOf = (error: unknown): readonly Diagnostic[] | undefined =>
  error instanceof ResonaError ? error.diagnostics : undefined;

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Resona command failed.";

const errorExitCode = (error: unknown, signal: AbortSignal | undefined): 1 | 2 | 130 => {
  if (isCancellation(error, signal)) return 130;
  if (error instanceof CliUsageError || error instanceof SkillsUsageError) return 2;
  if (
    error instanceof ResonaError &&
    error.diagnostics.some(({ phase }) => phase === "configuration")
  ) {
    return 2;
  }
  if (
    error instanceof Error &&
    (error.message.startsWith("Project config") || error.message.startsWith("No Resona entry"))
  ) {
    return 2;
  }
  return 1;
};

const humanCompositions = (
  output: CliContext["output"],
  projectRoot: string,
  compositions: readonly { id: string; duration: unknown; bpm: unknown }[],
): void => {
  output.stdout += `Project: ${projectRoot}\n`;
  for (const composition of compositions) {
    output.stdout += `- ${composition.id} (duration ${JSON.stringify(composition.duration)}, bpm ${JSON.stringify(composition.bpm)})\n`;
  }
};

const runCompositions = async (args: ParsedArgs, context: CliContext): Promise<void> => {
  if (
    args.composition !== undefined ||
    args.input !== undefined ||
    args.inputFile !== undefined ||
    args.seed !== undefined ||
    args.output !== undefined ||
    args.overwrite === true ||
    args.startFrame !== undefined ||
    args.endFrame !== undefined ||
    args.tailFrames !== undefined ||
    args.blockFrames !== undefined ||
    args.renderOptions !== undefined
  ) {
    throw new CliUsageError("compositions does not accept validation options.");
  }
  const location = await resolveProjectRoot(context.cwd, args.entry, args.config);
  const catalog = await loadProjectCompositions(location.root, {
    ...(location.configPath === undefined ? {} : { configPath: location.configPath }),
    ...(location.entryPoint === undefined ? {} : { entryPoint: location.entryPoint }),
  });
  const document = {
    format: "resona/compositions",
    schemaVersion: 1,
    project: catalog.project,
    compositions: catalog.compositions,
  };
  if (args.json) writeJson(context.output, document);
  else humanCompositions(context.output, catalog.project.root, catalog.compositions);
};

const runStudio = async (args: ParsedArgs, context: CliContext): Promise<void> => {
  if (
    args.composition !== undefined ||
    args.input !== undefined ||
    args.inputFile !== undefined ||
    args.seed !== undefined ||
    args.output !== undefined ||
    args.overwrite === true ||
    args.startFrame !== undefined ||
    args.endFrame !== undefined ||
    args.tailFrames !== undefined ||
    args.blockFrames !== undefined ||
    args.renderOptions !== undefined
  ) {
    throw new CliUsageError("studio does not accept render or validation options.");
  }
  const location = await resolveProjectRoot(context.cwd, args.entry, args.config);
  const server = await startStudioServer({
    projectRoot: location.root,
    ...(location.configPath === undefined ? {} : { configPath: location.configPath }),
    ...(location.entryPoint === undefined ? {} : { entryPoint: location.entryPoint }),
  });
  const document = {
    format: "resona/studio",
    schemaVersion: 1,
    host: server.host,
    port: server.port,
    url: server.url,
    token: server.token,
    sessionId: server.sessionId,
  };
  if (args.json) writeJson(context.output, document);
  else {
    context.output.stdout += `Studio listening at ${server.url}\n`;
    context.output.stdout += `Session token: ${server.token}\n`;
  }
  context.flush?.();
  try {
    if (context.signal?.aborted === true) throw new CliCancellationError("Operation cancelled.");
    if (context.signal === undefined) {
      await new Promise<void>(() => undefined);
    } else {
      await new Promise<void>((resolve) => {
        context.signal?.addEventListener("abort", () => resolve(), { once: true });
      });
      throw new CliCancellationError("Operation cancelled.");
    }
  } finally {
    await server.close();
  }
};

const runValidate = async (args: ParsedArgs, context: CliContext): Promise<void> => {
  if (
    args.output !== undefined ||
    args.overwrite === true ||
    args.startFrame !== undefined ||
    args.endFrame !== undefined ||
    args.tailFrames !== undefined ||
    args.blockFrames !== undefined ||
    args.renderOptions !== undefined
  ) {
    throw new CliUsageError("validate does not accept render options.");
  }
  if (args.composition === undefined || args.composition.length === 0) {
    throw new CliUsageError("validate requires --composition <id>.");
  }
  const location = await resolveProjectRoot(context.cwd, args.entry, args.config);
  let inputs = args.input;
  if (args.inputFile !== undefined) {
    let source: string;
    try {
      source = await readFile(resolve(context.cwd, args.inputFile), "utf8");
    } catch {
      throw new CliUsageError(`Input file not found: ${resolve(context.cwd, args.inputFile)}.`);
    }
    inputs = parseInput(source);
  }
  if (context.signal?.aborted === true) throw new CliCancellationError("Operation cancelled.");
  const options = {
    projectRoot: location.root,
    compositionId: args.composition,
    ...(inputs === undefined ? {} : { inputs }),
    ...(args.seed === undefined ? {} : { seed: args.seed }),
    ...(context.signal === undefined ? {} : { signal: context.signal }),
    ...(location.configPath === undefined ? {} : { configPath: location.configPath }),
    ...(location.entryPoint === undefined ? {} : { entryPoint: location.entryPoint }),
  };
  const job = await createRenderJob(options);
  const document = {
    format: "resona/validation-result",
    schemaVersion: 1,
    project: job.project,
    composition: job.composition,
    variant: job.variant,
    spec: job.spec,
    fingerprint: job.fingerprint,
    plan: job.plan,
    diagnostics: job.diagnostics,
  };
  if (args.json) writeJson(context.output, document);
  else {
    context.output.stdout += `Validated ${job.variant.compositionId} (${diagnosticSummary(job.diagnostics)}).\n`;
    humanDiagnostics(context.output, job.diagnostics);
  }
};

type RenderJsonOptions = Readonly<{
  composition?: string;
  output?: string;
  inputs?: JsonObject;
  seed?: string;
  overwrite?: boolean;
  startFrame?: number;
  endFrame?: number;
  tailFrames?: number;
  blockFrames?: number;
}>;

const renderJsonOptions = (value: JsonObject | undefined): RenderJsonOptions => {
  if (value === undefined) return {};
  const options: {
    composition?: string;
    output?: string;
    inputs?: JsonObject;
    seed?: string;
    overwrite?: boolean;
    startFrame?: number;
    endFrame?: number;
    tailFrames?: number;
    blockFrames?: number;
  } = {};
  for (const [key, raw] of Object.entries(value)) {
    if (key === "inputs") {
      if (!isRecord(raw)) throw new CliUsageError("render options.inputs must be a JSON object.");
      options.inputs = raw as JsonObject;
    } else if (key === "composition" || key === "output" || key === "seed") {
      if (typeof raw !== "string" || raw.length === 0) {
        throw new CliUsageError(`render options.${key} must be a non-empty string.`);
      }
      options[key] = raw;
    } else if (key === "overwrite") {
      if (typeof raw !== "boolean") {
        throw new CliUsageError("render options.overwrite must be boolean.");
      }
      options.overwrite = raw;
    } else if (
      key === "startFrame" ||
      key === "endFrame" ||
      key === "tailFrames" ||
      key === "blockFrames"
    ) {
      if (
        typeof raw !== "number" ||
        !Number.isSafeInteger(raw) ||
        raw < 0 ||
        (key === "blockFrames" && raw === 0)
      ) {
        throw new CliUsageError(`render options.${key} must be a non-negative safe integer.`);
      }
      options[key] = raw;
    } else {
      throw new CliUsageError(`Unknown render option: ${key}.`);
    }
  }
  return options;
};

const renderInvocation = (
  args: ParsedArgs,
  options: RenderJsonOptions,
): Readonly<{ entry?: string; composition?: string; output?: string }> => {
  const positional = args.positionals;
  let entry = args.entry;
  let composition = args.composition ?? options.composition;
  let output = args.output ?? options.output;
  if (positional.length === 3) {
    entry = positional[0];
    composition ??= positional[1];
    output ??= positional[2];
  } else if (positional.length === 2) {
    if (composition === undefined) {
      composition = positional[0];
      output ??= positional[1];
      entry = undefined;
    } else {
      entry = positional[0];
      output ??= positional[1];
    }
  } else if (positional.length === 1 && composition !== undefined) {
    entry = positional[0];
  }
  return {
    ...(entry === undefined ? {} : { entry }),
    ...(composition === undefined ? {} : { composition }),
    ...(output === undefined ? {} : { output }),
  };
};

const renderProgressEvent = (
  event:
    | Readonly<{
        phase: "configuration" | "compilation" | "preparation" | "planning";
        status: "started" | "completed";
        compositionId: string;
      }>
    | RenderProgress,
): Record<string, unknown> => ({
  format: "resona/render-event",
  schemaVersion: 1,
  type: "progress",
  ...event,
});

const reportRenderProgress = (
  context: CliContext,
  json: boolean,
  event:
    | Readonly<{
        phase: "configuration" | "compilation" | "preparation" | "planning";
        status: "started" | "completed";
        compositionId: string;
      }>
    | RenderProgress,
): void => {
  if (json) writeJson(context.output, renderProgressEvent(event));
  else if ("status" in event) {
    context.output.stdout += `render: ${event.phase} ${event.status}\n`;
  } else {
    const unit = event.phase === "render" ? "frames" : "bytes";
    const completed = event.phase === "render" ? event.completedFrames : event.completedBytes;
    const total = event.phase === "render" ? event.totalFrames : event.totalBytes;
    context.output.stdout += `render: ${event.phase} ${completed}/${total} ${unit}\n`;
  }
};

const reportRenderDiagnostics = (
  context: CliContext,
  json: boolean,
  diagnostics: readonly Diagnostic[],
): void => {
  if (!json) {
    humanDiagnostics(context.output, diagnostics);
    return;
  }
  for (const diagnostic of diagnostics) {
    writeJson(context.output, {
      format: "resona/render-event",
      schemaVersion: 1,
      type: "diagnostic",
      diagnostic,
    });
  }
};

const readInputs = async (
  args: ParsedArgs,
  context: CliContext,
): Promise<JsonObject | undefined> => {
  if (args.inputFile === undefined) return args.input;
  let source: string;
  try {
    source = await readFile(resolve(context.cwd, args.inputFile), "utf8");
  } catch {
    throw new CliUsageError(`Input file not found: ${resolve(context.cwd, args.inputFile)}.`);
  }
  return parseInput(source);
};

const runRender = async (args: ParsedArgs, context: CliContext): Promise<void> => {
  const options = renderJsonOptions(args.renderOptions);
  const invocation = renderInvocation(args, options);
  if (invocation.composition === undefined || invocation.composition.length === 0) {
    throw new CliUsageError("render requires a composition id.");
  }
  if (invocation.output === undefined || invocation.output.length === 0) {
    throw new CliUsageError("render requires an output path.");
  }
  const startFrame = args.startFrame ?? options.startFrame ?? 0;
  const endFrame = args.endFrame ?? options.endFrame;
  if (endFrame !== undefined && endFrame <= startFrame) {
    throw new CliUsageError("render end frame must be greater than its start frame.");
  }
  const location = await resolveProjectRoot(context.cwd, invocation.entry, args.config);
  const inputs = (await readInputs(args, context)) ?? options.inputs;
  const json = args.json;
  const renderOptions = {
    ...((args.startFrame ?? options.startFrame) === undefined
      ? {}
      : { startFrame: args.startFrame ?? options.startFrame }),
    ...((args.endFrame ?? options.endFrame) === undefined
      ? {}
      : { endFrame: args.endFrame ?? options.endFrame }),
    ...((args.tailFrames ?? options.tailFrames) === undefined
      ? {}
      : { tailFrames: args.tailFrames ?? options.tailFrames }),
    ...((args.blockFrames ?? options.blockFrames) === undefined
      ? {}
      : { blockFrames: args.blockFrames ?? options.blockFrames }),
  } satisfies Partial<RenderAudioToFileOptions>;
  const job = await createRenderJob({
    projectRoot: location.root,
    compositionId: invocation.composition,
    ...(inputs === undefined ? {} : { inputs }),
    ...((args.seed ?? options.seed) === undefined ? {} : { seed: args.seed ?? options.seed }),
    ...(context.signal === undefined ? {} : { signal: context.signal }),
    onProgress: (event) => reportRenderProgress(context, json, event),
    ...(location.configPath === undefined ? {} : { configPath: location.configPath }),
    ...(location.entryPoint === undefined ? {} : { entryPoint: location.entryPoint }),
  });
  reportRenderDiagnostics(context, json, job.diagnostics);
  const published = await renderAudioToFile(job, {
    outputPath: resolve(context.cwd, invocation.output),
    overwrite: args.overwrite ?? options.overwrite ?? false,
    ...(context.signal === undefined ? {} : { signal: context.signal }),
    ...renderOptions,
    onProgress: (event) => reportRenderProgress(context, json, event),
  });
  reportRenderDiagnostics(context, json, published.diagnostics);
  const diagnostics = [...job.diagnostics, ...published.diagnostics];
  const result = {
    format: "resona/render-event",
    schemaVersion: 1,
    type: "result",
    project: job.project,
    composition: job.composition,
    compositionId: job.plan.compositionId,
    variant: job.variant,
    spec: job.spec,
    fingerprint: job.fingerprint,
    outputPath: published.outputPath,
    bytes: published.bytes,
    frames: published.frames,
    sampleRate: published.sampleRate,
    channels: published.channels,
    diagnostics,
  };
  if (json) writeJson(context.output, result);
  else {
    context.output.stdout += `Rendered ${published.outputPath} (${published.frames} frames, ${diagnosticSummary(diagnostics)}).\n`;
  }
};

const help = (context: CliContext): void => {
  context.output.stdout += `${usage}\n${skillsHelp}\n`;
};

export const runCli = async (
  argv: readonly string[],
  options: Readonly<{
    cwd: string;
    output: { stdout: string; stderr: string };
    signal?: AbortSignal;
    flush?: () => void;
    environment?: NodeJS.ProcessEnv;
  }>,
): Promise<0 | 1 | 2 | 130> => {
  const context: CliContext = options;
  const jsonRequested = argv.some((argument) => argument === "--json");
  let args: ParsedArgs | undefined;
  try {
    args = parseArgs(argv);
    if (args.help) {
      help(context);
      return 0;
    }
    if (args.command === undefined) throw new CliUsageError("A command is required.");
    if (context.signal?.aborted === true) throw new CliCancellationError("Operation cancelled.");
    if (args.force === true && args.command !== "skills") {
      throw new CliUsageError("--force is only valid for resona skills update.");
    }
    if (args.command === "compositions") await runCompositions(args, context);
    else if (args.command === "studio") await runStudio(args, context);
    else if (args.command === "validate") await runValidate(args, context);
    else if (args.command === "render") await runRender(args, context);
    else if (args.command === "skills") {
      if (args.config !== undefined) {
        throw new CliUsageError("skills does not accept a config or entry option.");
      }
      const location = await resolveProjectRoot(context.cwd, undefined, undefined);
      await runSkills(args.positionals, args.force === true, {
        cwd: location.root,
        output: context.output,
        json: args.json,
        ...(context.environment === undefined ? {} : { environment: context.environment }),
        ...(context.signal === undefined ? {} : { signal: context.signal }),
      });
    } else throw new CliUsageError(`Unknown command: ${args.command}.`);
    return 0;
  } catch (error) {
    const exitCode = errorExitCode(error, context.signal);
    const diagnostics = diagnosticsOf(error);
    const document = {
      format: "resona/cli-error",
      schemaVersion: 1,
      exitCode,
      message: errorMessage(error),
      ...(diagnostics === undefined ? {} : { diagnostics }),
    };
    if ((args?.command === "render" || argv[0] === "render") && (args?.json || jsonRequested)) {
      writeJson(context.output, {
        format: "resona/render-event",
        schemaVersion: 1,
        type: "error",
        exitCode,
        message: document.message,
        ...(diagnostics === undefined ? {} : { diagnostics }),
      });
    } else if (args?.json === true || jsonRequested) writeJson(context.output, document);
    else {
      context.output.stderr += `resona: ${document.message}\n`;
      if (diagnostics !== undefined) {
        context.output.stderr += `${JSON.stringify(diagnostics)}\n`;
      }
    }
    return exitCode;
  }
};

const isMainModule = (): boolean => {
  const entry = process.argv[1];
  return entry !== undefined && resolve(entry) === resolve(fileURLToPath(import.meta.url));
};

const main = async (): Promise<void> => {
  const controller = new AbortController();
  const onInterrupt = (): void => controller.abort();
  process.once("SIGINT", onInterrupt);
  const output = { stdout: "", stderr: "" };
  const exitCode = await runCli(process.argv.slice(2), {
    cwd: process.cwd(),
    output,
    signal: controller.signal,
    flush: () => {
      process.stdout.write(output.stdout);
      process.stderr.write(output.stderr);
      output.stdout = "";
      output.stderr = "";
    },
  });
  process.removeListener("SIGINT", onInterrupt);
  process.stdout.write(output.stdout);
  process.stderr.write(output.stderr);
  process.exitCode = exitCode;
};

if (isMainModule()) void main();
