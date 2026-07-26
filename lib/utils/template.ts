/**
 * Shared templating grammar for {{variable}} substitution.
 *
 * This was previously duplicated across four node handlers (ai, api, webhook,
 * output). The UI field picker has to agree with the engine on this grammar, so
 * a single implementation is now the source of truth.
 *
 * Note: the four original copies were NOT identical. The api handler replaced
 * missing variables with an empty string, while ai/webhook/output left the
 * literal `{{name}}` in place. That difference is preserved via `onMissing`.
 */

/** Matches {{name}} and {{nested.path}} */
export const TEMPLATE_TOKEN_PATTERN = /\{\{(\w+(?:\.\w+)*)\}\}/g;

export type MissingBehavior = "keep" | "empty";

export function getNestedValue(
  obj: Record<string, unknown>,
  path: string
): unknown {
  const keys = path.split(".");
  let current: unknown = obj;

  for (const key of keys) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }

  return current;
}

export function interpolateVariables(
  template: string,
  inputs: Record<string, unknown>,
  onMissing: MissingBehavior = "keep"
): string {
  return template.replace(new RegExp(TEMPLATE_TOKEN_PATTERN), (_, path) => {
    const value = getNestedValue(inputs, path);

    if (value === undefined) {
      return onMissing === "empty" ? "" : `{{${path}}}`;
    }

    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  });
}

/**
 * Recursively interpolate every string inside an arbitrary value. Used for
 * payload templates, where tokens can appear at any depth.
 */
export function interpolateDeep(
  value: unknown,
  inputs: Record<string, unknown>,
  onMissing: MissingBehavior = "keep"
): unknown {
  if (typeof value === "string") {
    return interpolateVariables(value, inputs, onMissing);
  }

  if (Array.isArray(value)) {
    return value.map((item) => interpolateDeep(item, inputs, onMissing));
  }

  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      result[key] = interpolateDeep(item, inputs, onMissing);
    }
    return result;
  }

  return value;
}

/** A run of literal text or a variable reference, for rendering tokens as chips. */
export type TemplateSegment =
  | { kind: "text"; value: string }
  | { kind: "variable"; path: string };

/**
 * Split a template string into literal and variable segments so the UI can
 * render variables as chips instead of showing raw braces.
 */
export function parseTemplate(template: string): TemplateSegment[] {
  const segments: TemplateSegment[] = [];
  const pattern = new RegExp(TEMPLATE_TOKEN_PATTERN);
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(template)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ kind: "text", value: template.slice(lastIndex, match.index) });
    }
    segments.push({ kind: "variable", path: match[1] });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < template.length) {
    segments.push({ kind: "text", value: template.slice(lastIndex) });
  }

  return segments;
}

/** Wrap a field path in template syntax. The user never types this. */
export function toToken(path: string): string {
  return `{{${path}}}`;
}

/** Every variable path referenced by a template string. */
export function extractTokens(template: string): string[] {
  return parseTemplate(template)
    .filter((s): s is { kind: "variable"; path: string } => s.kind === "variable")
    .map((s) => s.path);
}
