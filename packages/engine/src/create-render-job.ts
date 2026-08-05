import { isAbsolute } from "node:path";

import { deepFreeze } from "./deep-freeze.js";
import type { CreateRenderJobResult, Diagnostic, JsonObject } from "./model.js";
import { loadProjectCompilation } from "./project-loader.js";
import { createRenderIdentity } from "./render-spec.js";
import { ResonaError } from "./resona-error.js";

export type CreateRenderJobOptions = Readonly<{
  projectRoot: string;
  compositionId: string;
  inputs?: JsonObject;
  seed?: string;
}>;

export const createRenderJob = async ({
  projectRoot,
  compositionId,
  inputs,
  seed,
}: CreateRenderJobOptions): Promise<CreateRenderJobResult> => {
  if (!isAbsolute(projectRoot)) {
    throw new ResonaError("projectRoot must be an absolute path.", [
      {
        code: "registration.project-root-not-absolute",
        phase: "registration",
        severity: "error",
        message: "projectRoot must be an absolute path.",
        compositionId,
      },
    ]);
  }

  try {
    const compilation = await loadProjectCompilation(projectRoot, compositionId, inputs, seed);
    const { composition, variant, plan, diagnostics } = compilation;
    const identity = createRenderIdentity({
      project: compilation.project,
      variant,
      composition,
      plan,
    });
    return deepFreeze({
      project: compilation.project,
      variant,
      spec: identity.spec,
      fingerprint: identity.fingerprint,
      composition,
      plan,
      diagnostics,
    });
  } catch (error) {
    if (
      error !== null &&
      typeof error === "object" &&
      "name" in error &&
      error.name === "ResonaError" &&
      "diagnostics" in error
    ) {
      throw error;
    }

    const message = error instanceof Error ? error.message : "The project could not be evaluated.";
    const diagnostic: Diagnostic = {
      code: "tsx-evaluation.failed",
      phase: "tsx-evaluation",
      severity: "error",
      message,
      compositionId,
    };
    throw new ResonaError(message, [diagnostic]);
  }
};
