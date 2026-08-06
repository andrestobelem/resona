import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildDocumentationSite, type BuildDocumentationSiteResult } from "./index.js";

export const runDocumentationBuild = async (
  projectRoot: string,
): Promise<BuildDocumentationSiteResult> => buildDocumentationSite({ projectRoot });

const isMainModule =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  const result = await runDocumentationBuild(process.argv[2] ?? process.cwd());
  process.stdout.write(
    `Generated ${result.generatedFiles.length} files from ${result.sourceCount} Markdown files.\n`,
  );
}
