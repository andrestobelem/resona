import { deepFreeze } from "./deep-freeze.js";
import type { JsonObject, JsonValue } from "./model.js";
import { ResonaError } from "./resona-error.js";

export type DeepReadonly<Value> = Value extends JsonValue
  ? Value extends readonly (infer Item)[]
    ? readonly DeepReadonly<Item>[]
    : Value extends JsonObject
      ? { readonly [Key in keyof Value]: DeepReadonly<Value[Key]> }
      : Value
  : never;

export type InputValidationIssue = Readonly<{
  code: string;
  path: readonly (number | string)[];
  message: string;
}>;

export type InputValidationResult =
  | Readonly<{ success: true }>
  | Readonly<{ success: false; issues: readonly InputValidationIssue[] }>;

export type InputSchemaIR = Readonly<{
  format: "resona/input-schema";
  schemaVersion: 1;
  jsonSchema: JsonObject;
}>;

export interface InputSchema<TInputs extends JsonObject = JsonObject> {
  readonly ir: InputSchemaIR;
  validate(value: unknown): InputValidationResult;
  readonly "~types"?: Readonly<{ inputs: TInputs }>;
}

export type InferInputs<Schema extends InputSchema> = NonNullable<Schema["~types"]>["inputs"];

type ResolveCompositionInputsOptions<TInputs extends JsonObject> = Readonly<{
  compositionId: string;
  schema: InputSchema<TInputs>;
  defaultInputs: TInputs;
  overrides?: JsonObject;
}>;

type ResolvedCompositionInputs<TInputs extends JsonObject> = Readonly<{
  inputs: DeepReadonly<TInputs>;
  inputSchema: InputSchemaIR;
}>;

class InvalidJsonInputError extends Error {}

const cloneJson = (value: unknown, ancestors: Set<object>): JsonValue => {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) throw new InvalidJsonInputError("Inputs cannot contain cycles.");
    ancestors.add(value);
    const clone = value.map((entry) => cloneJson(entry, ancestors));
    ancestors.delete(value);
    return clone;
  }
  if (value !== null && typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new InvalidJsonInputError("Inputs must contain only plain JSON objects.");
    }
    if (ancestors.has(value)) throw new InvalidJsonInputError("Inputs cannot contain cycles.");
    if (Reflect.ownKeys(value).some((key) => typeof key !== "string")) {
      throw new InvalidJsonInputError("Inputs cannot contain symbol keys.");
    }
    ancestors.add(value);
    const clone = Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, cloneJson(entry, ancestors)]),
    );
    ancestors.delete(value);
    return clone;
  }
  throw new InvalidJsonInputError("Inputs must be finite JSON values without undefined.");
};

export const cloneJsonObject = (value: unknown): JsonObject => {
  const clone = cloneJson(value, new Set());
  if (clone === null || Array.isArray(clone) || typeof clone !== "object") {
    throw new InvalidJsonInputError("Composition inputs must be a JSON object.");
  }
  return clone as JsonObject;
};

const inputError = (
  compositionId: string,
  code: string,
  message: string,
  cause?: JsonObject,
): ResonaError =>
  new ResonaError(message, [
    {
      code,
      phase: "input-validation",
      severity: "error",
      message,
      compositionId,
      ...(cause === undefined ? {} : { cause }),
    },
  ]);

const canonicalInputSchemaIr = (compositionId: string, ir: InputSchemaIR): InputSchemaIR => {
  let jsonSchema: JsonObject;
  try {
    jsonSchema = cloneJsonObject(ir.jsonSchema);
  } catch (error) {
    throw inputError(
      compositionId,
      "inputs.schema-description-invalid",
      error instanceof Error ? error.message : "InputSchemaIR must contain JSON data.",
    );
  }
  if (
    ir.format !== "resona/input-schema" ||
    ir.schemaVersion !== 1 ||
    jsonSchema.$schema !== "https://json-schema.org/draft/2020-12/schema" ||
    jsonSchema.type !== "object"
  ) {
    throw inputError(
      compositionId,
      "inputs.schema-description-invalid",
      "InputSchemaIR must contain a Draft 2020-12 object schema.",
    );
  }
  const references = (value: JsonValue): readonly string[] => {
    if (Array.isArray(value)) return value.flatMap(references);
    if (value === null || typeof value !== "object") return [];
    return Object.entries(value).flatMap(([key, entry]) => {
      if (key === "$ref" || key === "$dynamicRef") {
        return typeof entry === "string" ? [entry] : ["<invalid>"];
      }
      return references(entry);
    });
  };
  if (references(jsonSchema).some((reference) => reference !== "" && !reference.startsWith("#"))) {
    throw inputError(
      compositionId,
      "inputs.schema-description-invalid",
      "InputSchemaIR cannot contain remote JSON Schema references.",
    );
  }
  return deepFreeze({ format: ir.format, schemaVersion: ir.schemaVersion, jsonSchema });
};

const isThenable = (value: unknown): value is PromiseLike<unknown> =>
  value !== null &&
  (typeof value === "object" || typeof value === "function") &&
  "then" in value &&
  typeof value.then === "function";

export const resolveCompositionInputs = <TInputs extends JsonObject>({
  compositionId,
  schema,
  defaultInputs,
  overrides,
}: ResolveCompositionInputsOptions<TInputs>): ResolvedCompositionInputs<TInputs> => {
  let defaultsClone: JsonObject;
  let overridesClone: JsonObject;
  try {
    defaultsClone = cloneJsonObject(defaultInputs);
    overridesClone = overrides === undefined ? {} : cloneJsonObject(overrides);
  } catch (error) {
    throw inputError(
      compositionId,
      "inputs.not-json",
      error instanceof Error ? error.message : "Composition inputs must be JSON serializable.",
    );
  }

  const candidate = deepFreeze({ ...defaultsClone, ...overridesClone });
  let validation: unknown;
  try {
    validation = schema.validate(candidate);
  } catch (error) {
    throw inputError(
      compositionId,
      "inputs.validation-failed",
      error instanceof Error ? error.message : "Composition inputs failed validation.",
    );
  }
  if (isThenable(validation)) {
    throw inputError(
      compositionId,
      "inputs.async-validation-unsupported",
      "Input schemas must validate synchronously.",
    );
  }
  if (
    validation === null ||
    typeof validation !== "object" ||
    !("success" in validation) ||
    typeof validation.success !== "boolean"
  ) {
    throw inputError(
      compositionId,
      "inputs.schema-contract-invalid",
      "InputSchema.validate() returned an invalid result.",
    );
  }
  if (!validation.success) {
    const issues =
      "issues" in validation && Array.isArray(validation.issues)
        ? (validation.issues as readonly InputValidationIssue[])
        : [];
    throw inputError(
      compositionId,
      "inputs.validation-failed",
      "Composition inputs failed validation.",
      { issues: issues as unknown as JsonValue },
    );
  }

  const inputSchema = canonicalInputSchemaIr(compositionId, schema.ir);
  return {
    inputs: candidate as DeepReadonly<TInputs>,
    inputSchema,
  };
};

export const emptyInputSchema: InputSchema<JsonObject> = Object.freeze({
  ir: Object.freeze({
    format: "resona/input-schema" as const,
    schemaVersion: 1 as const,
    jsonSchema: Object.freeze({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      additionalProperties: false,
    }),
  }),
  validate: (value: unknown): InputValidationResult => {
    const valid =
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length === 0;
    return valid
      ? { success: true }
      : {
          success: false,
          issues: [{ code: "unrecognized-input", path: [], message: "No inputs are declared." }],
        };
  },
});
