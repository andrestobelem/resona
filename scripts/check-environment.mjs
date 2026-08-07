import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SUPPORTED_NODE_RANGE = ">=24.18.0 <25";
export const REQUIRED_PNPM_VERSION = "11.20.0";

const parseVersion = (value) => {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(value);
  if (match === null) return undefined;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
};

const nodeVersionIsSupported = (value) => {
  const version = parseVersion(value);
  if (version === undefined || version.major !== 24) return false;
  return version.minor > 18 || (version.minor === 18 && version.patch >= 0);
};

export const pnpmVersionFromUserAgent = (userAgent) => {
  if (userAgent === undefined) return undefined;
  return /(?:^|\s)pnpm\/(\d+\.\d+\.\d+)(?:\s|$)/.exec(userAgent)?.[1];
};

export const checkEnvironment = ({
  nodeVersion = process.versions.node,
  pnpmVersion = pnpmVersionFromUserAgent(process.env.npm_config_user_agent),
} = {}) => {
  const diagnostics = [];
  if (!nodeVersionIsSupported(nodeVersion)) {
    diagnostics.push(
      `Node.js ${nodeVersion} is outside the supported range ${SUPPORTED_NODE_RANGE}. Select the version from .node-version with your Node version manager.`,
    );
  }
  if (pnpmVersion === undefined) {
    diagnostics.push(
      `Could not determine the pnpm version; run this command through pnpm ${REQUIRED_PNPM_VERSION} as declared by packageManager.`,
    );
  } else if (pnpmVersion !== REQUIRED_PNPM_VERSION) {
    diagnostics.push(
      `pnpm ${pnpmVersion} is unsupported; this repository requires pnpm ${REQUIRED_PNPM_VERSION} via its packageManager declaration.`,
    );
  }
  return { ok: diagnostics.length === 0, diagnostics };
};

const cliPath = resolve(fileURLToPath(import.meta.url));
const isMainModule = process.argv[1] !== undefined && resolve(process.argv[1]) === cliPath;

const main = async () => {
  const result = checkEnvironment();
  if (!result.ok) {
    process.stderr.write("Resona environment check failed:\n");
    for (const diagnostic of result.diagnostics) process.stderr.write(`- ${diagnostic}\n`);
    process.exitCode = 1;
    return;
  }

  try {
    await access(resolve(".node-version"), constants.R_OK);
  } catch {
    process.stderr.write(
      "Resona environment check failed: .node-version is missing or unreadable from the repository root.\n",
    );
    process.exitCode = 1;
  }
};

if (isMainModule) await main();
