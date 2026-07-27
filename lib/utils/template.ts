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

/**
 * What to do with `{{name}}` when nothing upstream produced a `name`.
 *
 * `keep` leaves the token in place, which is right while someone is still
 * building and wants to see what they referred to. `empty` removes it, which is
 * right inside a request body. `note` is for prose a person reads, where a
 * literal `{{themes}}` in the middle of a report means nothing to them.
 */
export type MissingBehavior = "keep" | "empty" | "note";

/**
 * How a list is rendered when substituted into text.
 *
 * `json` is required wherever the result is machine-read, a request body, a
 * webhook payload. `list` is for prose a person reads, where a raw JSON array
 * looks like a bug.
 *
 * `list` also decides how a yes/no value reads. A condition step hands on the
 * string "true", which is correct in a request body and wrong in a sentence, so
 * prose gets "Yes" and "No" instead.
 */
export type ArrayStyle = "json" | "list";

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
  onMissing: MissingBehavior = "keep",
  arrayStyle: ArrayStyle = "json"
): string {
  return template.replace(new RegExp(TEMPLATE_TOKEN_PATTERN), (_, path) => {
    const value = getNestedValue(inputs, path);

    if (value === undefined) {
      if (onMissing === "empty") return "";
      if (onMissing === "note") return "_no value_";
      return `{{${path}}}`;
    }

    if (arrayStyle === "list") {
      if (Array.isArray(value)) return renderList(value);

      const yesNo = asYesNo(value);
      if (yesNo !== null) return yesNo;
    }

    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  });
}

/**
 * "Yes" or "No" for a yes/no value, null for anything else.
 *
 * Condition steps hand on the branch they took as the string "true" or "false",
 * so both the real boolean and the string form are covered.
 */
function asYesNo(value: unknown): string | null {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value === "true") return "Yes";
  if (value === "false") return "No";
  return null;
}

/** Render a list as markdown bullets, one per line. */
function renderList(items: unknown[]): string {
  if (items.length === 0) return "_none_";

  return items
    .map((item) => {
      const text =
        item !== null && typeof item === "object"
          ? JSON.stringify(item)
          : String(item);
      return `- ${text}`;
    })
    .join("\n");
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
