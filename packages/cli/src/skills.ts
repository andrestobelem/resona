import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { cp, mkdtemp, readdir, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";
import { tmpdir } from "node:os";

import {
  OFFICIAL_SKILLS,
  RESONA_RELEASE,
  type OfficialSkillName,
  validateInstalledSkill,
} from "@resona/skills";

export const SKILLS_INSTALLER_VERSION = "1.5.20" as const;
export const OFFICIAL_SKILLS_SOURCE =
  "https://github.com/andrestobelem/resona/tree/main/packages/skills/skills" as const;

const OFFICIAL_SKILLS_SOURCE_ID = "andrestobelem/resona" as const;
const OFFICIAL_SKILLS_REF = "main" as const;
const OFFICIAL_SKILLS_PATH = "packages/skills/skills";
const SKILLS_DIRECTORY = join(".agents", "skills");
const LOCKFILE_NAME = "skills-lock.json";

export type SkillState = "missing" | "outdated" | "modified" | "current";

export type SkillStatus = Readonly<{
  name: OfficialSkillName;
  state: SkillState;
  path: string;
  expectedRelease: typeof RESONA_RELEASE;
  requiresForce: boolean;
  installedRelease?: string;
  reason:
    | "not-installed"
    | "not-managed"
    | "release-mismatch"
    | "source-mismatch"
    | "lock-hash-missing"
    | "local-modification"
    | "unreadable"
    | "current";
}>;

export type SkillsStatus = Readonly<{
  release: typeof RESONA_RELEASE;
  directory: string;
  lockfile: string;
  skills: readonly SkillStatus[];
  summary: Readonly<Record<SkillState, number>>;
}>;

export type SkillsCommandOptions = Readonly<{
  cwd: string;
  environment?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  output: { stdout: string; stderr: string };
  json: boolean;
}>;

type SkillLockEntry = Readonly<{
  source?: unknown;
  sourceType?: unknown;
  ref?: unknown;
  skillPath?: unknown;
  computedHash?: unknown;
}>;

type SkillsLock = Readonly<{
  version?: unknown;
  skills?: unknown;
}>;

type SkillFile = Readonly<{
  relativePath: string;
  content: Buffer;
}>;

type InstallerResult = Readonly<{
  code: number;
  stdout: string;
  stderr: string;
}>;

type InstallationSnapshot = Readonly<{
  directory: string;
  lockFile?: Buffer;
  presentSkills: ReadonlySet<OfficialSkillName>;
}>;

export class SkillsInstallerError extends Error {}
export class SkillsUsageError extends Error {}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const isMissingPathError = (error: unknown): boolean => isRecord(error) && error.code === "ENOENT";

const isOfficialSkillName = (value: string): value is OfficialSkillName =>
  (OFFICIAL_SKILLS as readonly string[]).includes(value);

const contained = (root: string, target: string): boolean => {
  const child = relative(root, target);
  return child === "" || (child !== ".." && !child.startsWith(".." + sep) && !isAbsolute(child));
};

const parseFrontmatter = (source: string): Readonly<{ name?: string; release?: string }> => {
  if (!source.startsWith("---\n")) return {};
  const end = source.indexOf("\n---\n", 4);
  if (end < 0) return {};
  const metadata: Record<string, string> = {};
  for (const line of source.slice(4, end).split("\n")) {
    const separator = line.indexOf(":");
    if (separator < 1) continue;
    metadata[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return {
    ...(metadata.name === undefined ? {} : { name: metadata.name }),
    ...(metadata["resona-release"] === undefined ? {} : { release: metadata["resona-release"] }),
  };
};

const collectFiles = async (
  baseDirectory: string,
  currentDirectory: string,
): Promise<SkillFile[]> => {
  const files: SkillFile[] = [];
  const entries = await readdir(currentDirectory, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(currentDirectory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      files.push(...(await collectFiles(baseDirectory, fullPath)));
    } else if (entry.isSymbolicLink()) {
      throw new SkillsInstallerError("Agent Skill trees must not contain symbolic links.");
    } else if (entry.isFile()) {
      files.push({
        relativePath: relative(baseDirectory, fullPath).split("\\").join("/"),
        content: await readFile(fullPath),
      });
    }
  }
  return files;
};

export const computeSkillFolderHash = async (skillDirectory: string): Promise<string> => {
  const files = (await collectFiles(skillDirectory, skillDirectory)).sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath),
  );
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(file.relativePath);
    hash.update(file.content);
  }
  return hash.digest("hex");
};

const readSkillsLock = async (projectRoot: string): Promise<SkillsLock> => {
  const lockPath = join(projectRoot, LOCKFILE_NAME);
  let source: string;
  try {
    source = await readFile(lockPath, "utf8");
  } catch (error: unknown) {
    if (isMissingPathError(error)) return {};
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (error: unknown) {
    throw new SkillsInstallerError("skills-lock.json is not valid JSON.", { cause: error });
  }
  if (!isRecord(parsed) || parsed.version !== 1 || !isRecord(parsed.skills)) {
    throw new SkillsInstallerError("skills-lock.json must use standard version 1.");
  }
  return parsed;
};

const lockEntries = (lock: SkillsLock): Readonly<Record<string, SkillLockEntry>> => {
  if (!isRecord(lock.skills)) return {};
  return Object.fromEntries(
    Object.entries(lock.skills).filter(([, value]) => isRecord(value)),
  ) as Record<string, SkillLockEntry>;
};

const skillDirectory = (projectRoot: string, name: OfficialSkillName): string =>
  join(projectRoot, SKILLS_DIRECTORY, name);

const expectedSkillPath = (name: OfficialSkillName): string =>
  OFFICIAL_SKILLS_PATH + "/" + name + "/SKILL.md";

const isOfficialLockEntry = (name: OfficialSkillName, entry: SkillLockEntry | undefined): boolean =>
  (entry?.source === OFFICIAL_SKILLS_SOURCE_ID || entry?.source === OFFICIAL_SKILLS_SOURCE) &&
  entry.sourceType === "github" &&
  (entry.ref === undefined || entry.ref === OFFICIAL_SKILLS_REF) &&
  entry.skillPath === expectedSkillPath(name);

const readInstalledRelease = async (
  projectRoot: string,
  name: OfficialSkillName,
): Promise<Readonly<{ release?: string; name?: string }>> => {
  const source = await readFile(join(skillDirectory(projectRoot, name), "SKILL.md"), "utf8");
  return parseFrontmatter(source);
};

const safeSkillHash = async (projectRoot: string, name: OfficialSkillName): Promise<string> => {
  const directory = skillDirectory(projectRoot, name);
  const canonicalProjectRoot = await realpath(projectRoot);
  const canonicalDirectory = await realpath(directory);
  if (!contained(canonicalProjectRoot, canonicalDirectory)) {
    throw new SkillsInstallerError(name + ": installed skill path escapes the project root.");
  }
  return computeSkillFolderHash(directory);
};

const assertSkillsDirectoryContained = async (projectRoot: string): Promise<void> => {
  const canonicalProjectRoot = await realpath(projectRoot);
  for (const directory of [
    join(projectRoot, ".agents"),
    join(projectRoot, SKILLS_DIRECTORY),
    join(projectRoot, LOCKFILE_NAME),
  ]) {
    try {
      const canonicalDirectory = await realpath(directory);
      if (!contained(canonicalProjectRoot, canonicalDirectory)) {
        throw new SkillsInstallerError(
          "The standard Agent Skills directory must remain inside the project root.",
        );
      }
    } catch (error: unknown) {
      if (error instanceof SkillsInstallerError) throw error;
      if (!isMissingPathError(error)) throw error;
    }
  }
};

const takeInstallationSnapshot = async (
  projectRoot: string,
  names: readonly OfficialSkillName[],
): Promise<InstallationSnapshot> => {
  const directory = await mkdtemp(join(tmpdir(), "resona-skills-rollback-"));
  const presentSkills = new Set<OfficialSkillName>();
  try {
    let lockFile: Buffer | undefined;
    try {
      lockFile = await readFile(join(projectRoot, LOCKFILE_NAME));
    } catch (error: unknown) {
      if (!isMissingPathError(error)) throw error;
    }
    for (const name of names) {
      try {
        await stat(skillDirectory(projectRoot, name));
        await cp(skillDirectory(projectRoot, name), join(directory, name), {
          recursive: true,
          verbatimSymlinks: true,
        });
        presentSkills.add(name);
      } catch (error: unknown) {
        if (!isMissingPathError(error)) throw error;
      }
    }
    return { directory, ...(lockFile === undefined ? {} : { lockFile }), presentSkills };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
};

const restoreInstallationSnapshot = async (
  projectRoot: string,
  snapshot: InstallationSnapshot,
  names: readonly OfficialSkillName[],
): Promise<void> => {
  for (const name of names) {
    const target = skillDirectory(projectRoot, name);
    await rm(target, { recursive: true, force: true });
    if (snapshot.presentSkills.has(name)) {
      await cp(join(snapshot.directory, name), target, {
        recursive: true,
        verbatimSymlinks: true,
      });
    }
  }
  const lockPath = join(projectRoot, LOCKFILE_NAME);
  if (snapshot.lockFile === undefined) await rm(lockPath, { force: true });
  else await writeFile(lockPath, snapshot.lockFile);
};

const statusForSkill = async (
  projectRoot: string,
  name: OfficialSkillName,
  entry: SkillLockEntry | undefined,
): Promise<SkillStatus> => {
  const directory = skillDirectory(projectRoot, name);
  const path = SKILLS_DIRECTORY + "/" + name;
  let directoryExists: boolean;
  try {
    directoryExists = (await stat(directory)).isDirectory();
  } catch {
    directoryExists = false;
  }
  if (!directoryExists) {
    return {
      name,
      state: "missing",
      path,
      expectedRelease: RESONA_RELEASE,
      requiresForce: false,
      reason: "not-installed",
    };
  }

  let installed: Readonly<{ release?: string; name?: string }>;
  try {
    installed = await readInstalledRelease(projectRoot, name);
  } catch {
    return {
      name,
      state: "modified",
      path,
      expectedRelease: RESONA_RELEASE,
      requiresForce: true,
      reason: "unreadable",
    };
  }

  let installedHash: string;
  try {
    installedHash = await safeSkillHash(projectRoot, name);
  } catch {
    return {
      name,
      state: "modified",
      path,
      expectedRelease: RESONA_RELEASE,
      requiresForce: true,
      ...(installed.release === undefined ? {} : { installedRelease: installed.release }),
      reason: "unreadable",
    };
  }

  const officialIdentity = isOfficialLockEntry(name, entry);
  const hashMatches =
    typeof entry?.computedHash === "string" &&
    entry.computedHash.length > 0 &&
    installedHash === entry.computedHash;
  if (installed.release !== RESONA_RELEASE) {
    return {
      name,
      state: "outdated",
      path,
      expectedRelease: RESONA_RELEASE,
      requiresForce: !(officialIdentity && hashMatches),
      ...(installed.release === undefined ? {} : { installedRelease: installed.release }),
      reason: "release-mismatch",
    };
  }
  if (!entry) {
    return {
      name,
      state: "missing",
      path,
      expectedRelease: RESONA_RELEASE,
      requiresForce: true,
      reason: "not-managed",
    };
  }
  if (!officialIdentity) {
    return {
      name,
      state: "outdated",
      path,
      expectedRelease: RESONA_RELEASE,
      requiresForce: true,
      installedRelease: installed.release,
      reason: "source-mismatch",
    };
  }
  if (typeof entry.computedHash !== "string" || entry.computedHash.length === 0) {
    return {
      name,
      state: "outdated",
      path,
      expectedRelease: RESONA_RELEASE,
      requiresForce: true,
      installedRelease: installed.release,
      reason: "lock-hash-missing",
    };
  }
  if (installedHash !== entry.computedHash) {
    return {
      name,
      state: "modified",
      path,
      expectedRelease: RESONA_RELEASE,
      requiresForce: true,
      installedRelease: installed.release,
      reason: "local-modification",
    };
  }
  return {
    name,
    state: "current",
    path,
    expectedRelease: RESONA_RELEASE,
    requiresForce: false,
    installedRelease: installed.release,
    reason: "current",
  };
};

export const inspectSkills = async (projectRoot: string): Promise<SkillsStatus> => {
  await assertSkillsDirectoryContained(projectRoot);
  const lock = await readSkillsLock(projectRoot);
  const entries = lockEntries(lock);
  const skills = await Promise.all(
    OFFICIAL_SKILLS.map((name) => statusForSkill(projectRoot, name, entries[name])),
  );
  const summary: Record<SkillState, number> = {
    missing: 0,
    outdated: 0,
    modified: 0,
    current: 0,
  };
  for (const skill of skills) summary[skill.state] += 1;
  return {
    release: RESONA_RELEASE,
    directory: SKILLS_DIRECTORY,
    lockfile: LOCKFILE_NAME,
    skills,
    summary,
  };
};

const statusDocument = (status: SkillsStatus): Record<string, unknown> => ({
  format: "resona/skills-status",
  schemaVersion: 1,
  release: status.release,
  directory: status.directory,
  lockfile: status.lockfile,
  skills: status.skills,
  summary: status.summary,
});

const resultDocument = (
  operation: "add" | "update",
  status: SkillsStatus,
): Record<string, unknown> => ({
  format: "resona/skills-result",
  schemaVersion: 1,
  operation,
  release: RESONA_RELEASE,
  status: {
    release: status.release,
    directory: status.directory,
    lockfile: status.lockfile,
    skills: status.skills,
    summary: status.summary,
  },
});

const writeJson = (options: SkillsCommandOptions, document: unknown): void => {
  options.output.stdout += JSON.stringify(document) + "\n";
};

const humanStatus = (options: SkillsCommandOptions, status: SkillsStatus): void => {
  options.output.stdout += "Agent Skills (release " + status.release + ")\n";
  for (const skill of status.skills) {
    const marker = skill.state === "current" ? "✓" : skill.state === "missing" ? "-" : "!";
    options.output.stdout += marker + " " + skill.name + ": " + skill.state + "\n";
  }
  options.output.stdout += "Summary: " + JSON.stringify(status.summary) + "\n";
};

const runInstaller = async (
  args: readonly string[],
  options: SkillsCommandOptions,
): Promise<InstallerResult> => {
  const executable = process.platform === "win32" ? "npx.cmd" : "npx";
  return new Promise<InstallerResult>((resolveResult, reject) => {
    const child = spawn(executable, args, {
      cwd: options.cwd,
      env: options.environment ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });
    const onAbort = (): void => {
      child.kill("SIGTERM");
    };
    options.signal?.addEventListener("abort", onAbort, { once: true });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      options.signal?.removeEventListener("abort", onAbort);
      if (options.signal?.aborted === true) {
        reject(new Error("Operation cancelled."));
        return;
      }
      resolveResult({ code: code ?? (signal === null ? 1 : 130), stdout, stderr });
    });
  });
};

const assertCurrentAfterInstall = (
  operation: "add" | "update",
  status: SkillsStatus,
  targetNames: readonly OfficialSkillName[],
  requireInstalled: boolean,
): void => {
  const targets = new Set(targetNames);
  const failed = status.skills.filter(
    (skill) =>
      targets.has(skill.name) &&
      (requireInstalled || skill.state !== "missing") &&
      skill.state !== "current",
  );
  if (failed.length > 0) {
    throw new SkillsInstallerError(
      operation +
        " did not produce a clean Agent Skills installation: " +
        failed.map((skill) => skill.name + "=" + skill.state).join(", ") +
        ".",
    );
  }
};

const validateInstalledSkills = async (
  projectRoot: string,
  status: SkillsStatus,
  targetNames: readonly OfficialSkillName[],
): Promise<void> => {
  const targets = new Set(targetNames);
  for (const skill of status.skills) {
    if (!targets.has(skill.name) || skill.state !== "current") continue;
    await validateInstalledSkill(join(projectRoot, skill.path, "SKILL.md"), skill.name);
  }
};

const printInstallerOutput = (options: SkillsCommandOptions, result: InstallerResult): void => {
  if (!options.json && result.stdout.length > 0) options.output.stdout += result.stdout;
  if (result.code !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim();
    throw new SkillsInstallerError(
      "Agent Skills installer failed with exit code " +
        result.code +
        (detail.length > 0 ? ": " + detail : "."),
    );
  }
};

const parseSkillNames = (values: readonly string[]): readonly OfficialSkillName[] => {
  const names = values.length === 0 ? [...OFFICIAL_SKILLS] : values;
  const invalid = names.filter((name) => !isOfficialSkillName(name));
  if (invalid.length > 0)
    throw new SkillsUsageError("Unknown official Agent Skill: " + invalid.join(", ") + ".");
  return names as OfficialSkillName[];
};

export const skillsHelp =
  "Usage:\n" +
  "  resona skills add [--force] [--json]\n" +
  "  resona skills status [--json]\n" +
  "  resona skills update [skill ...] [--force] [--json]";

export const runSkills = async (
  values: readonly string[],
  force: boolean,
  options: SkillsCommandOptions,
): Promise<void> => {
  const [operation, ...requestedNames] = values;
  if (operation === undefined || operation === "help") {
    if (force) throw new SkillsUsageError("--force requires an add or update operation.");
    options.output.stdout += skillsHelp + "\n";
    return;
  }
  if (operation === "status") {
    if (force || requestedNames.length > 0) {
      throw new SkillsUsageError("resona skills status does not accept skill names or --force.");
    }
    const status = await inspectSkills(options.cwd);
    if (options.json) writeJson(options, statusDocument(status));
    else humanStatus(options, status);
    return;
  }
  if (operation !== "add" && operation !== "update") {
    throw new SkillsUsageError("Unknown resona skills operation: " + operation + ".");
  }
  if (operation === "add" && requestedNames.length > 0) {
    throw new SkillsUsageError("resona skills add does not accept skill names.");
  }

  const statusBefore = await inspectSkills(options.cwd);
  const names = parseSkillNames(requestedNames);
  const sourceMismatch = statusBefore.skills.filter(
    (skill) => names.includes(skill.name) && skill.reason === "source-mismatch",
  );
  if (operation === "update" && sourceMismatch.length > 0) {
    throw new SkillsInstallerError(
      "Cannot update Agent Skills from an untrusted source: " +
        sourceMismatch.map((skill) => skill.name).join(", ") +
        ". Reinstall with resona skills add --force.",
    );
  }
  if (!force) {
    const modified = statusBefore.skills.filter(
      (skill) => names.includes(skill.name) && skill.requiresForce,
    );
    if (modified.length > 0) {
      throw new SkillsInstallerError(
        "Refusing to overwrite modified or untrusted Agent Skills: " +
          modified.map((skill) => skill.name).join(", ") +
          ". Re-run with --force to authorize replacement.",
      );
    }
  }

  const installerArgs =
    operation === "add"
      ? [
          "--yes",
          "skills@" + SKILLS_INSTALLER_VERSION,
          "add",
          OFFICIAL_SKILLS_SOURCE,
          "--skill",
          "*",
          "--agent",
          "universal",
          "--copy",
          "--yes",
        ]
      : ["--yes", "skills@" + SKILLS_INSTALLER_VERSION, "update", "--project", "--yes", ...names];
  const snapshot = await takeInstallationSnapshot(options.cwd, names);
  try {
    const installer = await runInstaller(installerArgs, options);
    printInstallerOutput(options, installer);
    const status = await inspectSkills(options.cwd);
    assertCurrentAfterInstall(
      operation,
      status,
      names,
      operation === "add" || requestedNames.length > 0,
    );
    await validateInstalledSkills(options.cwd, status, names);
    if (options.json) writeJson(options, resultDocument(operation, status));
    else humanStatus(options, status);
  } catch (error) {
    try {
      await restoreInstallationSnapshot(options.cwd, snapshot, names);
    } catch (restoreError: unknown) {
      throw new SkillsInstallerError(
        "Agent Skills operation failed and its previous installation could not be restored.",
        { cause: restoreError },
      );
    }
    throw error;
  } finally {
    await rm(snapshot.directory, { recursive: true, force: true });
  }
};
