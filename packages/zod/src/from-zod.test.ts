import { describe, expect, it } from "vitest";
import { z } from "zod";

import { UnsupportedZodInputSchemaError, fromZod } from "./index.js";

describe("fromZod", () => {
  it("adapts a strict Zod object to validation and a serializable schema description", () => {
    const schema = fromZod(
      z.strictObject({
        intensity: z.number().min(0).max(1),
        mode: z.enum(["soft", "hard"]),
      }),
    );

    expect(schema.ir).toEqual({
      format: "resona/input-schema",
      schemaVersion: 1,
      jsonSchema: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {
          intensity: { type: "number", minimum: 0, maximum: 1 },
          mode: { type: "string", enum: ["soft", "hard"] },
        },
        required: ["intensity", "mode"],
        additionalProperties: false,
      },
    });
    expect(schema.validate({ intensity: 0.5, mode: "soft" })).toEqual({ success: true });
    expect(schema.validate({ intensity: 2, mode: "soft" })).toEqual({
      success: false,
      issues: [
        {
          code: "too_big",
          path: ["intensity"],
          message: "Too big: expected number to be <=1",
        },
      ],
    });
  });

  it("rejects transforming schemas when the adapter is created", () => {
    expect(() =>
      fromZod(
        z.strictObject({
          intensity: z.string().transform(Number),
        }),
      ),
    ).toThrowError(UnsupportedZodInputSchemaError);
  });

  it.each([
    ["coercion", z.strictObject({ value: z.coerce.number() })],
    ["preprocess", z.strictObject({ value: z.preprocess((value) => value, z.string()) })],
    ["catch", z.strictObject({ value: z.string().catch("fallback") })],
    ["default", z.strictObject({ value: z.string().default("fallback") })],
  ])("rejects Zod %s when the adapter is created", (_, schema) => {
    expect(() => fromZod(schema)).toThrowError(UnsupportedZodInputSchemaError);
  });

  it("allows synchronous refinements and rejects declared async refinements", () => {
    const synchronous = fromZod(
      z.strictObject({ value: z.string().refine((value) => value.startsWith("resona")) }),
    );

    expect(synchronous.validate({ value: "resona-input" })).toEqual({ success: true });
    expect(() =>
      fromZod(
        z.strictObject({
          value: z.string().refine(async (value) => value.startsWith("resona")),
        }),
      ),
    ).toThrowError(UnsupportedZodInputSchemaError);
  });

  it("turns a latent refinement promise into a synchronous validation failure", () => {
    const schema = fromZod(
      z.strictObject({
        value: z.string().refine((value) => Promise.resolve(value.startsWith("resona"))),
      }),
    );

    expect(schema.validate({ value: "resona-input" })).toEqual({
      success: false,
      issues: [
        {
          code: "async_validation",
          path: [],
          message: "Input schemas must validate synchronously.",
        },
      ],
    });
  });

  it.each([
    ["unknown-key stripping", z.object({ value: z.string() })],
    ["string overwrite", z.strictObject({ value: z.string().trim() })],
    [
      "catchall transformation",
      z.object({ value: z.string() }).catchall(z.string().transform((value) => value.trim())),
    ],
  ])("rejects Zod %s that would rewrite accepted inputs", (_, schema) => {
    expect(() => fromZod(schema)).toThrowError(UnsupportedZodInputSchemaError);
  });
});
