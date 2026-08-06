import { humanizeFieldName } from "@/lib/vocabulary";

export interface AppFormField {
  name: string;
  label: string;
  type: "string" | "number" | "boolean" | "json";
  required: boolean;
  placeholder?: string;
  description?: string;
  multiline?: boolean;
  default?: unknown;
}

const FIELD_TYPES = new Set(["string", "number", "boolean", "json"]);

interface RawField {
  name?: string;
  type?: string;
  required?: boolean;
  default?: unknown;
  label?: string;
  placeholder?: string;
  description?: string;
  multiline?: boolean;
}

interface SnapshotNode {
  type: string;
  data?: { config?: Record<string, unknown> };
}

/**
 * Build the run form for an app straight from its workflow's Input node(s) —
 * the same declared fields the canvas already has, with no separate schema an
 * app owner has to keep in sync.
 *
 * `visibleFields`, when non-empty, narrows the form down to just those field
 * names (set by the app owner when publishing); an empty or missing list
 * means "show everything the workflow declares."
 */
export function deriveAppForm(
  snapshot: { nodes?: SnapshotNode[] },
  visibleFields?: string[]
): AppFormField[] {
  const fields: AppFormField[] = [];

  for (const node of snapshot.nodes || []) {
    if (node.type !== "input") continue;

    const raw = (node.data?.config?.fields as RawField[] | undefined) || [];
    for (const field of raw) {
      if (!field?.name) continue;

      fields.push({
        name: field.name,
        label: field.label || humanizeFieldName(field.name),
        type: FIELD_TYPES.has(field.type as string)
          ? (field.type as AppFormField["type"])
          : "string",
        required: !!field.required,
        placeholder: field.placeholder,
        description: field.description,
        multiline: field.multiline,
        default: field.default,
      });
    }
  }

  if (visibleFields && visibleFields.length > 0) {
    const allowed = new Set(visibleFields);
    return fields.filter((f) => allowed.has(f.name));
  }

  return fields;
}
