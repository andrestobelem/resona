import { deepFreeze } from "./deep-freeze.js";
import type { Diagnostic } from "./model.js";

export class ResonaError extends Error {
  readonly diagnostics: readonly Diagnostic[];

  constructor(message: string, diagnostics: readonly Diagnostic[]) {
    super(message);
    this.name = "ResonaError";
    this.diagnostics = deepFreeze([...diagnostics]);
  }
}
