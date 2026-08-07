import { readdir, readFile, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const RESONA_RELEASE = "0.0.0" as const;
export const OFFICIAL_SKILLS = [
  "resona-best-practices",
  "resona-compositions",
  "resona-audio-midi",
  "resona-studio",
  "resona-rendering",
] as const;

export type OfficialSkillName = (typeof OFFICIAL_SKILLS)[number];

export type SkillDocument = Readonly<{
  name: OfficialSkillName;
  description: string;
  release: typeof RESONA_RELEASE;
  sourcePath: string;
  body: string;
  commands: readonly string[];
  references: readonly string[];
}>;

type Frontmatter = Readonly<{
  name?: string;
  description?: string;
  "resona-release"?: string;
}>;

class RepositoryReferenceEscapeError extends Error {}

const frontmatter = (
  source: string,
  sourcePath: string,
): { metadata: Frontmatter; body: string } => {
  if (!source.startsWith("---\n"))
    throw new Error(`${sourcePath}: frontmatter must start with ---.`);
  const end = source.indexOf("\n---\n", 4);
  if (end < 0) throw new Error(`${sourcePath}: frontmatter must close with ---.`);
  const metadata: Record<string, string> = {};
  for (const line of source.slice(4, end).split("\n")) {
    const separator = line.indexOf(":");
    if (separator < 1) throw new Error(`${sourcePath}: invalid frontmatter line ${line}.`);
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (value.length === 0) throw new Error(`${sourcePath}: frontmatter ${key} is empty.`);
    metadata[key] = value.replace(/^['"]|['"]$/g, "");
  }
  return { metadata, body: source.slice(end + "\n---\n".length) };
};

const markdownLinks = (body: string): readonly string[] =>
  [...body.matchAll(/\[[^\]]+\]\(([^)\s]+)(?:\s+[^)]*)?\)/g)].map((match) => match[1] ?? "");

const commandExamples = (body: string): readonly string[] =>
  [...body.matchAll(/`([^`\n]+)`/g)]
    .map((match) => (match[1] ?? "").trim())
    .filter((value) => /^(?:pnpm|node|npx|resona)\s/.test(value));

const supportedRepositoryCommands = [
  "pnpm --filter @resona/cli build",
  "pnpm --filter @resona/renderer build",
  "pnpm --filter @resona/renderer typecheck",
  "pnpm build",
  "pnpm check:fast",
  "pnpm test:integration",
] as const;

const validateCommandExample = (command: string, sourcePath: string): void => {
  if (command.startsWith("resona ")) {
    const [verb, ...args] = command.slice("resona ".length).split(/\s+/u);
    if (!new Set(["compositions", "validate", "render", "studio"]).has(verb ?? "")) {
      throw new Error(`${sourcePath}: unsupported resona command ${command}.`);
    }
    if (!args.includes("--json")) {
      throw new Error(`${sourcePath}: resona command must request --json: ${command}.`);
    }
    if (verb === "validate" && !args.includes("--composition")) {
      throw new Error(`${sourcePath}: validate command must name --composition: ${command}.`);
    }
    if (verb === "render" && args.length < 3) {
      throw new Error(`${sourcePath}: render command must include entry, composition, and output.`);
    }
    return;
  }
  if (!supportedRepositoryCommands.some((supported) => command === supported)) {
    throw new Error(`${sourcePath}: unsupported repository command ${command}.`);
  }
};

const isExternalReference = (reference: string): boolean =>
  /^(?:https?:|mailto:|#)/.test(reference);

const repositoryReference = (reference: string): string | undefined => {
  const match = reference.match(
    /^https:\/\/github\.com\/andrestobelem\/resona\/(?:blob|tree)\/main\/([^#?]+)(?:[?#].*)?$/,
  );
  return match?.[1] === undefined ? undefined : decodeURIComponent(match[1]);
};

const validateLocalReferences = async (
  body: string,
  sourcePath: string,
  repositoryRoot: string,
): Promise<readonly string[]> => {
  const canonicalRepositoryRoot = await realpath(repositoryRoot);
  const assertContained = (root: string, target: string, reference: string): void => {
    const repositoryRelative = relative(root, target);
    if (
      isAbsolute(repositoryRelative) ||
      repositoryRelative === ".." ||
      repositoryRelative.startsWith(`..${sep}`)
    ) {
      throw new RepositoryReferenceEscapeError(
        `${sourcePath}: reference ${reference} escapes the repository root.`,
      );
    }
  };
  const references = markdownLinks(body);
  for (const reference of references) {
    const repositoryPath = repositoryReference(reference);
    const target =
      repositoryPath === undefined
        ? resolve(dirname(sourcePath), reference.split("#", 1)[0] ?? reference)
        : resolve(repositoryRoot, repositoryPath);
    if (isExternalReference(reference) && repositoryPath === undefined) continue;
    assertContained(resolve(repositoryRoot), target, reference);
    try {
      const canonicalTarget = await realpath(target);
      assertContained(canonicalRepositoryRoot, canonicalTarget, reference);
      await stat(canonicalTarget);
    } catch (error: unknown) {
      if (error instanceof RepositoryReferenceEscapeError) throw error;
      throw new Error(
        `${sourcePath}: reference ${reference} does not resolve from ${relative(repositoryRoot, sourcePath)}.`,
        { cause: error },
      );
    }
  }
  return references;
};

const validateDocument = async (
  repositoryRoot: string,
  skillName: OfficialSkillName,
  sourcePath: string,
  checkLocalReferences = true,
): Promise<SkillDocument> => {
  const source = await readFile(sourcePath, "utf8");
  const { metadata, body } = frontmatter(source, sourcePath);
  if (metadata.name !== skillName) {
    throw new Error(`${sourcePath}: name must be ${skillName}.`);
  }
  if (metadata.description === undefined || metadata.description.length < 20) {
    throw new Error(`${sourcePath}: description must contain at least 20 characters.`);
  }
  if (metadata["resona-release"] !== RESONA_RELEASE) {
    throw new Error(`${sourcePath}: resona-release must be ${RESONA_RELEASE}.`);
  }
  for (const heading of ["## Workflow", "## References", "## Guardrails"]) {
    if (!body.includes(heading)) throw new Error(`${sourcePath}: missing ${heading}.`);
  }
  if (!body.includes("No edites artefactos derivados")) {
    throw new Error(`${sourcePath}: missing derived-artifact guardrail.`);
  }
  if (/\.(?:html|tsbuildinfo)\b|(?:^|[\s`/])(?:dist|\.resona-docs)(?:[/\s`]|$)/.test(body)) {
    throw new Error(`${sourcePath}: workflow must not edit generated artifacts.`);
  }
  const commands = commandExamples(body);
  if (commands.length === 0) throw new Error(`${sourcePath}: workflow has no executable command.`);
  commands.forEach((command) => validateCommandExample(command, sourcePath));
  const references = checkLocalReferences
    ? await validateLocalReferences(body, sourcePath, repositoryRoot)
    : markdownLinks(body);
  if (references.length === 0) throw new Error(`${sourcePath}: references section has no links.`);
  return Object.freeze({
    name: skillName,
    description: metadata.description,
    release: RESONA_RELEASE,
    sourcePath,
    body,
    commands,
    references,
  });
};

export const validateInstalledSkill = async (
  sourcePath: string,
  skillName: OfficialSkillName,
): Promise<void> => {
  await validateDocument("", skillName, sourcePath, false);
};

export const validateSkillCorpus = async (
  repositoryRoot: string,
  skillsRoot = join(repositoryRoot, "packages", "skills", "skills"),
): Promise<readonly SkillDocument[]> => {
  const entries = await readdir(skillsRoot, { withFileTypes: true });
  const directories = new Set(
    entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name),
  );
  const expected = new Set<string>(OFFICIAL_SKILLS);
  const unexpected = [...directories].filter((name) => !expected.has(name));
  const missing = [...expected].filter((name) => !directories.has(name));
  if (unexpected.length > 0 || missing.length > 0) {
    throw new Error(
      `Skill corpus mismatch; missing=${missing.join(",") || "none"}; unexpected=${unexpected.join(",") || "none"}.`,
    );
  }
  const skills: SkillDocument[] = [];
  for (const skillName of OFFICIAL_SKILLS) {
    skills.push(
      await validateDocument(repositoryRoot, skillName, join(skillsRoot, skillName, "SKILL.md")),
    );
  }
  return Object.freeze(skills);
};

const isMainModule = (): boolean => {
  const entry = process.argv[1];
  return entry !== undefined && resolve(entry) === resolve(fileURLToPath(import.meta.url));
};

if (isMainModule()) {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
  validateSkillCorpus(repositoryRoot)
    .then((skills) => {
      process.stdout.write(
        `${JSON.stringify({ format: "resona/skills-validation", schemaVersion: 1, release: RESONA_RELEASE, skills: skills.map(({ name, release, commands, references }) => ({ name, release, commandCount: commands.length, referenceCount: references.length })) })}\n`,
      );
    })
    .catch((error: unknown) => {
      process.stderr.write(
        `${error instanceof Error ? error.message : "Skill validation failed."}\n`,
      );
      process.exitCode = 1;
    });
}
