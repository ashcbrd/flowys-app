/**
 * Plain-Language Vocabulary
 *
 * Single source of truth mapping stored config values to the labels shown in the
 * UI. Stored values never change, this is a presentation layer only, so every
 * saved workflow keeps working.
 */

export interface Term {
  /** The value persisted in workflow config. Never change these. */
  value: string;
  /** What the user reads. */
  label: string;
  /** Optional one-line explanation shown under a select. */
  help?: string;
}

/** Types a workflow input field or AI output property can have. */
export const FIELD_TYPES: Term[] = [
  { value: "string", label: "Text", help: "Words, sentences, or anything typed" },
  { value: "number", label: "Number", help: "A numeric value" },
  { value: "boolean", label: "Yes / No", help: "A simple on or off choice" },
  { value: "json", label: "Group of fields", help: "Several related values together" },
  {
    value: "file",
    label: "A file",
    help: "The person uploads a document and we read the text out of it",
  },
];

/** Types an AI output schema property can have. Adds list/group. */
export const SCHEMA_TYPES: Term[] = [
  { value: "string", label: "Text" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "Yes / No" },
  { value: "array", label: "List of items" },
  { value: "object", label: "Group of fields" },
];

/** What a Logic node can do. */
export const LOGIC_OPERATIONS: Term[] = [
  {
    value: "transform",
    label: "Rename or restructure fields",
    help: "Build a new set of fields from the ones coming in",
  },
  {
    value: "filter",
    label: "Keep only items that match",
    help: "Drop list items that fail a rule",
  },
  {
    value: "map",
    label: "Change every item in a list",
    help: "Apply the same edit to each item",
  },
  {
    value: "reduce",
    label: "Combine a list into one value",
    help: "Add up or merge all items into a single result",
  },
  {
    value: "condition",
    label: "Take a different path",
    help: "Send the workflow one way or another based on a rule",
  },
  { value: "sort", label: "Reorder a list", help: "Sort items by a field" },
  { value: "slice", label: "Take part of a list", help: "Keep only the first few items" },
  {
    value: "passthrough",
    label: "Pass data through unchanged",
    help: "Useful as a placeholder while building",
  },
];

/** HTTP methods, framed by intent rather than verb. */
export const HTTP_METHODS: Term[] = [
  { value: "GET", label: "Get data (GET)" },
  { value: "POST", label: "Send new data (POST)" },
  { value: "PUT", label: "Replace data (PUT)" },
  { value: "PATCH", label: "Update part of data (PATCH)" },
  { value: "DELETE", label: "Delete data (DELETE)" },
];

/** Output formats. */
export const OUTPUT_FORMATS: Term[] = [
  { value: "text", label: "Plain text" },
  { value: "markdown", label: "Formatted text" },
  { value: "json", label: "Structured data" },
];

/** AI providers. */
export const AI_PROVIDERS: Term[] = [
  { value: "anthropic", label: "Claude (Anthropic)" },
  { value: "openai", label: "ChatGPT (OpenAI)" },
];

/**
 * Comparison operators for the condition builder.
 *
 * `value` here is the literal operator token that `LogicNodeHandler.
 * evaluateCondition` parses. That parser expects exactly
 * `<path> <operator> <value>` and recognises a fixed set of tokens, it does not
 * evaluate JavaScript, so these must stay in its vocabulary.
 */
export interface Operator {
  /** The operator token written into the stored condition string. */
  value: string;
  label: string;
  /** Whether this operator needs a value on the right-hand side. */
  needsValue: boolean;
  /** Restrict to fields of this type where known. */
  numericOnly?: boolean;
}

export const CONDITION_OPERATORS: Operator[] = [
  { value: "===", label: "is", needsValue: true },
  { value: "!==", label: "is not", needsValue: true },
  { value: ">", label: "is greater than", needsValue: true, numericOnly: true },
  { value: "<", label: "is less than", needsValue: true, numericOnly: true },
  { value: ">=", label: "is at least", needsValue: true, numericOnly: true },
  { value: "<=", label: "is at most", needsValue: true, numericOnly: true },
  { value: "contains", label: "contains", needsValue: true },
  { value: "notContains", label: "does not contain", needsValue: true },
  { value: "startsWith", label: "starts with", needsValue: true },
  { value: "endsWith", label: "ends with", needsValue: true },
  { value: "empty", label: "is empty", needsValue: false },
  { value: "exists", label: "is not empty", needsValue: false },
];

/**
 * Compose a condition string in the grammar `evaluateCondition` parses.
 *
 * Text values are single-quoted because the parser treats an unquoted
 * right-hand side as a field path first and only falls back to a literal.
 * Numbers and booleans are left bare so the numeric comparators work.
 */
export function buildCondition(
  field: string,
  operator: string,
  rawValue: string
): string {
  const op = CONDITION_OPERATORS.find((o) => o.value === operator);
  if (!field || !op) return "";

  if (!op.needsValue) return `${field} ${operator}`;

  const trimmed = rawValue.trim();
  if (trimmed === "") return `${field} ${operator} ''`;

  const isNumeric = trimmed !== "" && !Number.isNaN(Number(trimmed));
  const isBoolean = trimmed === "true" || trimmed === "false";
  const needsQuotes = !isNumeric && !isBoolean;

  return needsQuotes
    ? `${field} ${operator} '${trimmed.replace(/'/g, "")}'`
    : `${field} ${operator} ${trimmed}`;
}

/** Parse a stored condition string back into builder state. */
export function parseCondition(condition: string | undefined): {
  field: string;
  operator: string;
  value: string;
} {
  if (!condition) return { field: "", operator: "===", value: "" };

  const tokens = CONDITION_OPERATORS.map((o) => o.value)
    .sort((a, b) => b.length - a.length)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");

  const match = condition.match(new RegExp(`^(\\S+)\\s+(${tokens})\\s*(.*)$`));
  if (!match) return { field: condition.trim(), operator: "===", value: "" };

  const [, field, operator, rest] = match;
  const value = rest.trim().replace(/^['"]|['"]$/g, "");

  return { field, operator, value };
}

/** Look up a label, falling back to the raw value so nothing renders blank. */
export function labelFor(terms: Term[], value: string | undefined): string {
  if (!value) return "";
  return terms.find((t) => t.value === value)?.label ?? value;
}

export function helpFor(terms: Term[], value: string | undefined): string | undefined {
  if (!value) return undefined;
  return terms.find((t) => t.value === value)?.help;
}

/**
 * Turn a machine field name into something readable, for use when a field has no
 * explicit label. `customerEmail` becomes "Customer email"; `customer_email`
 * and `customer-email` do too.
 */
export function humanizeFieldName(name: string): string {
  if (!name) return "";

  const spaced = name
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();

  if (!spaced) return name;

  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}
