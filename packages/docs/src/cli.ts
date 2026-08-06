import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildDocumentationSite } from "./index.js";

const repositoryRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const projectRoot = process.argv[2] ?? repositoryRoot;
const result = await buildDocumentationSite({ projectRoot });
process.stdout.write(
  `Generated ${result.generatedFiles.length} files from ${result.sourceCount} Markdown files.\n`,
);
