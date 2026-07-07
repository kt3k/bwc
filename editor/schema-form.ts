// Copyright 2024-2025 Yoshiya Hinosawa. MIT license.
import type { JSONSchema } from "../util/json-schema.ts"

const INPUT_CLASS =
  "w-16 px-1 bg-neutral-800 border border-neutral-600 rounded text-neutral-100"

/**
 * Builds an editable form element for the given {@linkcode JSONSchema},
 * initialized with `value`. `onChange` is invoked with the new value whenever
 * any field changes.
 */
export function buildSchemaForm(
  schema: JSONSchema,
  value: unknown,
  onChange: (value: unknown) => void,
): HTMLElement {
  const root = buildField(schema, value, onChange)
  // Keep typing in the fields from triggering the editor's global keyboard
  // shortcuts (mode switching etc.).
  root.addEventListener("keydown", (e) => e.stopPropagation())
  return root
}

function buildField(
  schema: JSONSchema,
  value: unknown,
  onChange: (value: unknown) => void,
): HTMLElement {
  switch (schema.type) {
    case "number":
      return numberField(value, onChange)
    case "string":
      return stringField(schema, value, onChange)
    case "boolean":
      return booleanField(value, onChange)
    case "array":
      return arrayField(schema, value, onChange)
    case "object":
      return objectField(schema, value, onChange)
  }
}

function numberField(
  value: unknown,
  onChange: (value: unknown) => void,
): HTMLElement {
  const input = document.createElement("input")
  input.type = "number"
  input.className = INPUT_CLASS
  if (typeof value === "number") input.value = String(value)
  input.addEventListener("input", () => {
    onChange(input.value === "" ? undefined : Number(input.value))
  })
  return input
}

function stringField(
  schema: { enum?: readonly string[] },
  value: unknown,
  onChange: (value: unknown) => void,
): HTMLElement {
  if (schema.enum) {
    const select = document.createElement("select")
    select.className = INPUT_CLASS
    for (const option of schema.enum) {
      const opt = document.createElement("option")
      opt.value = option
      opt.textContent = option
      select.appendChild(opt)
    }
    if (typeof value === "string") select.value = value
    select.addEventListener("change", () => onChange(select.value))
    return select
  }
  const input = document.createElement("input")
  input.type = "text"
  input.className = INPUT_CLASS
  if (typeof value === "string") input.value = value
  input.addEventListener("input", () => onChange(input.value))
  return input
}

function booleanField(
  value: unknown,
  onChange: (value: unknown) => void,
): HTMLElement {
  const input = document.createElement("input")
  input.type = "checkbox"
  input.checked = value === true
  input.addEventListener("change", () => onChange(input.checked))
  return input
}

function arrayField(
  schema: { prefixItems?: readonly JSONSchema[] },
  value: unknown,
  onChange: (value: unknown) => void,
): HTMLElement {
  const arr = Array.isArray(value) ? [...value] : []
  const wrapper = document.createElement("div")
  wrapper.className = "flex gap-1"
  for (const [idx, sub] of (schema.prefixItems ?? []).entries()) {
    wrapper.appendChild(buildField(sub, arr[idx], (v) => {
      if (v === undefined) {
        // An emptied number input; keep the previous value rather than
        // saving null into the tuple
        return
      }
      arr[idx] = v
      onChange([...arr])
    }))
  }
  return wrapper
}

function objectField(
  schema: {
    properties?: Readonly<Record<string, JSONSchema>>
    required?: readonly string[]
  },
  value: unknown,
  onChange: (value: unknown) => void,
): HTMLElement {
  const obj: Record<string, unknown> =
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? { ...value as Record<string, unknown> }
      : {}
  const wrapper = document.createElement("div")
  wrapper.className = "flex flex-col gap-1"
  for (const [key, sub] of Object.entries(schema.properties ?? {})) {
    const row = document.createElement("label")
    row.className = "flex items-center gap-1"
    const labelText = document.createElement("span")
    labelText.textContent = sub.title ?? key
    row.appendChild(labelText)
    row.appendChild(buildField(sub, obj[key], (v) => {
      if (v === undefined) {
        delete obj[key]
      } else {
        obj[key] = v
      }
      onChange({ ...obj })
    }))
    wrapper.appendChild(row)
  }
  return wrapper
}
