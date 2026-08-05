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

const usage = `Usage:
  resona compositions [entry] [--config <path>] [--json]
  resona validate [entry] --composition <id> [--input <json>] [--input-file <path>] [--seed <seed>] [--config <path>] [--json]`;

export type CliOutput = {
  stdout: string;
  stderr: string;
};

type CliContext = Readonly<{
  cwd: string;
  output: { stdout: string; stderr: string };
  signal?: AbortSignal;
}>;

type ParsedArgs = Readonly<{
  command?: string;
  entry?: string;
  config?: string;
  composition?: string;
  input?: JsonObject;
  inputFile?: string;
  seed?: string;
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

const parseArgs = (argv: readonly string[]): ParsedArgs => {
  const [command, ...rest] = argv;
  const positional: string[] = [];
  let config: string | undefined;
  let composition: string | undefined;
  let input: JsonObject | undefined;
  let inputFile: string | undefined;
  let seed: string | undefined;
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
    if (argument.startsWith("-")) {
      throw new CliUsageError(`Unknown option: ${argument}.`);
    }
    positional.push(argument);
  }

  if (positional.length > 1) {
    throw new CliUsageError("Only one project entry may be provided.");
  }
  return {
    ...(command === undefined ? {} : { command }),
    ...(positional[0] === undefined ? {} : { entry: positional[0] }),
    ...(config === undefined ? {} : { config }),
    ...(composition === undefined ? {} : { composition }),
    ...(input === undefined ? {} : { input }),
    ...(inputFile === undefined ? {} : { inputFile }),
    ...(seed === undefined ? {} : { seed }),
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
    error.diagnostics.some(({ code }) => code === "preparation.cancelled")
  );
};

const diagnosticsOf = (error: unknown): readonly Diagnostic[] | undefined =>
  error instanceof ResonaError ? error.diagnostics : undefined;

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Resona command failed.";

const errorExitCode = (error: unknown, signal: AbortSignal | undefined): 1 | 2 | 130 => {
  if (isCancellation(error, signal)) return 130;
  if (error instanceof CliUsageError) return 2;
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
    args.seed !== undefined
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

const runValidate = async (args: ParsedArgs, context: CliContext): Promise<void> => {
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

const help = (context: CliContext): void => {
  context.output.stdout += `${usage}\n`;
};

export const runCli = async (
  argv: readonly string[],
  options: Readonly<{
    cwd: string;
    output: { stdout: string; stderr: string };
    signal?: AbortSignal;
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
    if (args.command === "compositions") await runCompositions(args, context);
    else if (args.command === "validate") await runValidate(args, context);
    else throw new CliUsageError(`Unknown command: ${args.command}.`);
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
    if (args?.json === true || jsonRequested) writeJson(context.output, document);
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
  });
  process.removeListener("SIGINT", onInterrupt);
  process.stdout.write(output.stdout);
  process.stderr.write(output.stderr);
  process.exitCode = exitCode;
};

if (isMainModule()) void main();
