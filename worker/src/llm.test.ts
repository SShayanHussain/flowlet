import { describe, it, expect } from "vitest";
import { sanitizeSchemaForApi } from "./llm";

describe("sanitizeSchemaForApi", () => {
  it("adds additionalProperties:false to objects and strips unsupported keywords", () => {
    const schema = {
      type: "object",
      properties: {
        score: { type: "number", minimum: 0, maximum: 1 },
        name: { type: "string", minLength: 1, maxLength: 80, pattern: "^[a-z]+$" },
        tags: {
          type: "array",
          minItems: 1,
          items: { type: "string" },
        },
        nested: {
          type: "object",
          properties: { ok: { type: "boolean" } },
          required: ["ok"],
        },
      },
      required: ["score"],
    };

    expect(sanitizeSchemaForApi(schema)).toEqual({
      type: "object",
      additionalProperties: false,
      properties: {
        score: { type: "number" },
        name: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        nested: {
          type: "object",
          additionalProperties: false,
          properties: { ok: { type: "boolean" } },
          required: ["ok"],
        },
      },
      required: ["score"],
    });
  });

  it("keeps supported keywords (enum, const, format) intact", () => {
    const schema = {
      type: "object",
      properties: {
        intent: { type: "string", enum: ["a", "b"] },
        when: { type: "string", format: "date-time" },
      },
    };
    const out = sanitizeSchemaForApi(schema) as {
      properties: { intent: { enum: string[] }; when: { format: string } };
    };
    expect(out.properties.intent.enum).toEqual(["a", "b"]);
    expect(out.properties.when.format).toBe("date-time");
  });
});
