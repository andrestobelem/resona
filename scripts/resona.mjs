import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { checkEnvironment, pnpmVersionFromUserAgent } from "./check-environment.mjs";

export const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const cliEntrypoint = (root = repositoryRoot) => resolve(root, "packages/cli/dist/cli.js");

export const missingBuildMessage = (entrypoint) =>
  `Resona CLI build is missing at ${entrypoint}. Run pnpm build before pnpm resona -- ...`;

const writeDiagnostics = (diagnostics, output) => {
  output.write("Resona environment check failed:\n");
  for (const diagnostic of diagnostics) output.write(`- ${diagnostic}\n`);
};

export const runResona = async ({
  argv = process.argv.slice(2),
  cwd = process.cwd(),
  env = process.env,
  nodeVersion = process.versions.node,
  root = repositoryRoot,
  output = process.stderr,
} = {}) => {
  const environment = checkEnvironment({
    nodeVersion,
    pnpmVersion: pnpmVersionFromUserAgent(env.npm_config_user_agent),
  });
  if (!environment.ok) {
    writeDiagnostics(environment.diagnostics, output);
    return 1;
  }

  const entrypoint = cliEntrypoint(root);
  try {
    await access(entrypoint, constants.R_OK);
  } catch {
    output.write(`${missingBuildMessage(entrypoint)}\n`);
    return 1;
  }

  const forwardedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  return await new Promise((resolveExit) => {
    const child = spawn(process.execPath, [entrypoint, ...forwardedArgv], {
      cwd,
      env,
      stdio: "inherit",
    });
    const forwardSignal = (signal) => child.kill(signal);
    const cleanup = () => {
      process.removeListener("SIGINT", onInterrupt);
      process.removeListener("SIGTERM", onTerminate);
    };
    const onInterrupt = () => forwardSignal("SIGINT");
    const onTerminate = () => forwardSignal("SIGTERM");
    process.once("SIGINT", onInterrupt);
    process.once("SIGTERM", onTerminate);
    child.once("error", () => {
      cleanup();
      resolveExit(1);
    });
    child.once("close", (code) => {
      cleanup();
      resolveExit(code ?? 1);
    });
  });
};

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
) {
  process.exitCode = await runResona();
}
