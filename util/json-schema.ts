/**
 * A small subset of JSON Schema used to describe per-instance spawn data
 * (e.g. a portal's destination).
 *
 * The documents written in this shape are valid JSON Schema, so they can be
 * handed to a standards-compliant validator (e.g. ajv) later if needed. For
 * now validation is done by the thin recursive {@linkcode validate} below,
 * which only understands the keywords we actually use.
 */
export type JSONSchema =
  | NumberSchema
  | StringSchema
  | BooleanSchema
  | ArraySchema
  | ObjectSchema

export interface NumberSchema {
  readonly type: "number"
  readonly title?: string
}

export interface StringSchema {
  readonly type: "string"
  readonly title?: string
  readonly enum?: readonly string[]
}

export interface BooleanSchema {
  readonly type: "boolean"
  readonly title?: string
}

export interface ArraySchema {
  readonly type: "array"
  readonly title?: string
  /** Tuple form: a schema per position. */
  readonly prefixItems?: readonly JSONSchema[]
}

export interface ObjectSchema {
  readonly type: "object"
  readonly title?: string
  readonly properties?: Readonly<Record<string, JSONSchema>>
  readonly required?: readonly string[]
}

/**
 * Validates a value against a {@linkcode JSONSchema}. Only the keywords this
 * project uses are checked; anything else is ignored.
 */
export function validate(schema: JSONSchema, value: unknown): boolean {
  switch (schema.type) {
    case "number":
      return typeof value === "number"
    case "string":
      return typeof value === "string" &&
        (schema.enum === undefined || schema.enum.includes(value))
    case "boolean":
      return typeof value === "boolean"
    case "array":
      if (!Array.isArray(value)) return false
      return (schema.prefixItems ?? []).every((s, i) => validate(s, value[i]))
    case "object": {
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return false
      }
      const obj = value as Record<string, unknown>
      const required = schema.required ?? []
      if (!required.every((key) => key in obj)) return false
      return Object.entries(schema.properties ?? {})
        .every(([key, s]) => !(key in obj) || validate(s, obj[key]))
    }
  }
}
