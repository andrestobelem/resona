import type {
  InputSchema,
  InputValidationIssue,
  InputValidationResult,
  JsonObject,
} from "@resona/engine";
import { toJSONSchema, type output, type ZodObject } from "zod";

export type UnsupportedZodInputSchemaIssue = Readonly<{
  path: readonly (number | string)[];
  feature:
    | "async-validation"
    | "catch"
    | "coercion"
    | "default"
    | "overwrite"
    | "opaque-refinement"
    | "preprocess"
    | "stripping"
    | "transform";
  message: string;
}>;

export class UnsupportedZodInputSchemaError extends Error {
  readonly issues: readonly UnsupportedZodInputSchemaIssue[];

  constructor(issues: readonly UnsupportedZodInputSchemaIssue[]) {
    super("The Zod schema uses features that cannot preserve composition inputs.");
    this.name = "UnsupportedZodInputSchemaError";
    this.issues = deepFreeze([...issues]);
  }
}

const deepFreeze = <Value>(value: Value): Value => {
  if (value === null || typeof value !== "object") return value;
  for (const entry of Object.values(value)) deepFreeze(entry);
  return Object.isFrozen(value) ? value : Object.freeze(value);
};

const issuesFromZod = (
  issues: readonly Readonly<{ code: string; path: readonly PropertyKey[]; message: string }>[],
): readonly InputValidationIssue[] =>
  issues.map((issue) => ({
    code: issue.code,
    path: issue.path.filter((entry): entry is number | string => typeof entry !== "symbol"),
    message: issue.message,
  }));

type ZodNode = Readonly<{
  _zod: Readonly<{ def: Readonly<Record<string, unknown>> }>;
}>;

const isZodNode = (value: unknown): value is ZodNode =>
  value !== null && typeof value === "object" && "_zod" in value;

const unsupportedIssue = (
  path: readonly (number | string)[],
  feature: UnsupportedZodInputSchemaIssue["feature"],
): UnsupportedZodInputSchemaIssue => ({
  path,
  feature,
  message: `Zod ${feature} is not supported for composition inputs.`,
});

const findUnsupportedFeatures = (
  value: unknown,
  path: readonly (number | string)[],
  visited: Set<object>,
): UnsupportedZodInputSchemaIssue[] => {
  if (value === null || typeof value !== "object" || visited.has(value)) return [];
  visited.add(value);
  if (isZodNode(value)) {
    const { def } = value._zod;
    if (typeof def.fn === "function" && def.fn.constructor.name === "AsyncFunction") {
      return [unsupportedIssue(path, "async-validation")];
    }
    if (def.coerce === true) return [unsupportedIssue(path, "coercion")];
    if (def.check === "overwrite") return [unsupportedIssue(path, "overwrite")];
    if (def.check === "custom" && typeof def.fn !== "function") {
      return [unsupportedIssue(path, "opaque-refinement")];
    }
    if (def.type === "catch") return [unsupportedIssue(path, "catch")];
    if (def.type === "default" || def.type === "prefault") {
      return [unsupportedIssue(path, "default")];
    }
    if (def.type === "transform") return [unsupportedIssue(path, "transform")];
    if (def.type === "pipe") {
      const input = def.in;
      const feature = isZodNode(input) && input._zod.def.type === "transform" ? "preprocess" : null;
      if (feature !== null) return [unsupportedIssue(path, feature)];
    }
    if (def.type === "object") {
      if (def.catchall === undefined) return [unsupportedIssue(path, "stripping")];
      const shape = def.shape;
      const shapeIssues =
        shape !== null && typeof shape === "object"
          ? Object.entries(shape).flatMap(([key, child]) =>
              findUnsupportedFeatures(child, [...path, key], visited),
            )
          : [];
      return [
        ...shapeIssues,
        ...findUnsupportedFeatures(def.catchall, [...path, "*"], visited),
        ...findUnsupportedFeatures(def.checks, path, visited),
      ];
    }
    return Object.values(def).flatMap((child) => findUnsupportedFeatures(child, path, visited));
  }
  return Object.values(value).flatMap((child) => findUnsupportedFeatures(child, path, visited));
};

export const fromZod = <const Schema extends ZodObject>(
  schema: Schema,
): InputSchema<Extract<output<Schema>, JsonObject>> => {
  const unsupported = findUnsupportedFeatures(schema, [], new Set());
  if (unsupported.length > 0) throw new UnsupportedZodInputSchemaError(unsupported);
  const jsonSchema = toJSONSchema(schema, {
    io: "input",
    target: "draft-2020-12",
  }) as JsonObject;

  return Object.freeze({
    ir: deepFreeze({
      format: "resona/input-schema" as const,
      schemaVersion: 1 as const,
      jsonSchema,
    }),
    validate: (value: unknown): InputValidationResult => {
      let result;
      try {
        result = schema.safeParse(value);
      } catch (error) {
        if (error instanceof Error && error.constructor.name === "$ZodAsyncError") {
          return {
            success: false,
            issues: [
              {
                code: "async_validation",
                path: [],
                message: "Input schemas must validate synchronously.",
              },
            ],
          };
        }
        throw error;
      }
      return result.success
        ? { success: true }
        : { success: false, issues: issuesFromZod(result.error.issues) };
    },
  });
};
