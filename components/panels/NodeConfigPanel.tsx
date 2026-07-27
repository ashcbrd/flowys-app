"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { X, Trash2, Plus, GripVertical, Loader2, ExternalLink, Save, Check, Plug } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useWorkflowStore } from "@/store/workflow";
import { cn } from "@/lib/utils";
import { ValueEditor } from "@/components/inputs/ValueEditor";
import { KeyValueEditor } from "@/components/inputs/KeyValueEditor";
import { TemplateInput } from "@/components/inputs/TemplateInput";
import { ConditionBuilder } from "@/components/inputs/ConditionBuilder";
import { PresetPicker } from "@/components/inputs/PresetPicker";
import { availableFieldsFor, itemFieldsFor, type AvailableField } from "@/lib/utils/fields";
import { INTEGRATIONS_ENABLED, COMING_SOON_LABEL } from "@/lib/features";
import {
  FIELD_TYPES,
  SCHEMA_TYPES,
  LOGIC_OPERATIONS,
  HTTP_METHODS,
  OUTPUT_FORMATS,
  helpFor,
  humanizeFieldName,
} from "@/lib/vocabulary";

export function NodeConfigPanel() {
  const {
    selectedNode,
    selectNode,
    updateNodeConfig,
    updateNodeLabel,
    deleteNode,
    nodes,
    edges,
    lastExecution,
  } = useWorkflowStore();

  // Local state for pending changes
  const [pendingConfig, setPendingConfig] = useState<Record<string, unknown>>({});
  const [pendingLabel, setPendingLabel] = useState<string>("");
  const [originalConfig, setOriginalConfig] = useState<Record<string, unknown>>({});
  const [originalLabel, setOriginalLabel] = useState<string>("");
  const [isSaved, setIsSaved] = useState(false);

  // Initialize local state when node is selected
  useEffect(() => {
    if (selectedNode) {
      const config = selectedNode.data.config as Record<string, unknown>;
      setPendingConfig(config);
      setOriginalConfig(JSON.parse(JSON.stringify(config)));
      setPendingLabel(selectedNode.data.label);
      setOriginalLabel(selectedNode.data.label);
      setIsSaved(false);
    }
  }, [selectedNode?.id]);

  // Check if there are unsaved changes
  const hasChanges = useMemo(() => {
    if (!selectedNode) return false;
    const configChanged = JSON.stringify(pendingConfig) !== JSON.stringify(originalConfig);
    const labelChanged = pendingLabel !== originalLabel;
    return configChanged || labelChanged;
  }, [pendingConfig, originalConfig, pendingLabel, originalLabel, selectedNode]);

  // What each node actually produced last run. Lets the field picker offer real
  // keys for nodes that don't declare their output shape up front.
  const executionOutputs = useMemo(() => {
    const map = new Map<string, Record<string, unknown>>();
    for (const log of lastExecution?.logs || []) {
      if (log.output) map.set(log.nodeId, log.output);
    }
    return map;
  }, [lastExecution]);

  const availableFields = useMemo(() => {
    if (!selectedNode) return [];
    return availableFieldsFor(selectedNode.id, nodes, edges, executionOutputs);
  }, [selectedNode, nodes, edges, executionOutputs]);

  const itemFields = useMemo(() => {
    if (!selectedNode) return [];
    return itemFieldsFor(selectedNode.id, nodes, edges, executionOutputs);
  }, [selectedNode, nodes, edges, executionOutputs]);

  const handleConfigChange = useCallback((key: string, value: unknown) => {
    setPendingConfig(prev => ({ ...prev, [key]: value }));
    setIsSaved(false);
  }, []);

  const handleLabelChange = useCallback((value: string) => {
    setPendingLabel(value);
    setIsSaved(false);
  }, []);

  const handleSave = useCallback(() => {
    if (!selectedNode) return;

    // Save to store
    updateNodeConfig(selectedNode.id, pendingConfig);
    if (pendingLabel !== originalLabel) {
      updateNodeLabel(selectedNode.id, pendingLabel);
    }

    // Update original values to current
    setOriginalConfig(JSON.parse(JSON.stringify(pendingConfig)));
    setOriginalLabel(pendingLabel);
    setIsSaved(true);

    // Reset saved indicator after 2 seconds
    setTimeout(() => setIsSaved(false), 2000);
  }, [selectedNode, pendingConfig, pendingLabel, originalLabel, updateNodeConfig, updateNodeLabel]);

  const handleDelete = () => {
    if (selectedNode) {
      deleteNode(selectedNode.id);
    }
  };

  if (!selectedNode) return null;

  return (
    <div className="flex-1 overflow-y-auto flex flex-col">
      <div className="p-4 border-b flex items-center justify-between">
        <h2 className="font-semibold">Step settings</h2>
        <Button variant="ghost" size="icon" onClick={() => selectNode(null)}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="p-4 space-y-4 flex-1">
        <div>
          <Label>Label</Label>
          <Input
            value={pendingLabel}
            onChange={(e) => handleLabelChange(e.target.value)}
            className="mt-1"
          />
        </div>

        {selectedNode.type === "input" && (
          <InputNodeConfig
            config={pendingConfig}
            onChange={handleConfigChange}
            fields={availableFields}
            itemFields={itemFields}
          />
        )}
        {selectedNode.type === "api" && (
          <ApiNodeConfig
            config={pendingConfig}
            onChange={handleConfigChange}
            fields={availableFields}
            itemFields={itemFields}
          />
        )}
        {selectedNode.type === "ai" && (
          <AiNodeConfig
            config={pendingConfig}
            onChange={handleConfigChange}
            fields={availableFields}
            itemFields={itemFields}
          />
        )}
        {selectedNode.type === "logic" && (
          <LogicNodeConfig
            config={pendingConfig}
            onChange={handleConfigChange}
            fields={availableFields}
            itemFields={itemFields}
          />
        )}
        {selectedNode.type === "output" && (
          <OutputNodeConfig
            config={pendingConfig}
            onChange={handleConfigChange}
            fields={availableFields}
            itemFields={itemFields}
          />
        )}
        {selectedNode.type === "integration" && (
          <IntegrationNodeConfig
            config={pendingConfig}
            onChange={handleConfigChange}
            fields={availableFields}
            itemFields={itemFields}
          />
        )}
        {selectedNode.type === "webhook" && (
          <WebhookNodeConfig
            config={pendingConfig}
            onChange={handleConfigChange}
            fields={availableFields}
            itemFields={itemFields}
          />
        )}
      </div>

      {/* Fixed footer with Save and Delete buttons */}
      <div className="p-4 border-t bg-background sticky bottom-0 space-y-3">
        <Button
          onClick={handleSave}
          disabled={!hasChanges && !isSaved}
          className={cn(
            "fy-pill w-full gap-2 transition-all",
            hasChanges
              ? "bg-gradient-to-r from-[var(--fy-blue)] to-[var(--fy-blue-deep)] hover:opacity-95"
              : isSaved
              ? "bg-green-500 hover:bg-green-500"
              : "bg-muted text-muted-foreground hover:bg-muted"
          )}
        >
          {isSaved ? (
            <>
              <Check className="h-4 w-4" />
              Saved
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              {hasChanges ? "Save settings" : "Nothing to save"}
            </>
          )}
        </Button>

        <Button variant="destructive" size="sm" onClick={handleDelete} className="w-full">
          <Trash2 className="h-4 w-4 mr-1" />
          Delete this step
        </Button>
      </div>
    </div>
  );
}

interface ConfigProps {
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  /** Values from earlier steps that this node can reference. */
  fields?: AvailableField[];
  /** Per-item values, for logic nodes that iterate a list. */
  itemFields?: AvailableField[];
}

interface InputField {
  name: string;
  type: string;
  required?: boolean;
  default?: string | number | boolean;
  label?: string;
  description?: string;
  placeholder?: string;
  multiline?: boolean;
}

/** camelCase identifier from a human label. */
function slugifyFieldName(label: string): string {
  const words = label
    .replace(/[^a-zA-Z0-9\s_-]/g, "")
    .split(/[\s_-]+/)
    .filter(Boolean);

  if (words.length === 0) return "";

  return words
    .map((word, i) =>
      i === 0
        ? word.charAt(0).toLowerCase() + word.slice(1)
        : word.charAt(0).toUpperCase() + word.slice(1)
    )
    .join("");
}

/** A name still at its generated default can be renamed safely. */
function isDefaultFieldName(name: string): boolean {
  return /^newField\d*$/.test(name || "");
}

function InputNodeConfig({ config, onChange }: ConfigProps) {
  const fields = (config.fields || []) as InputField[];

  const uniqueFieldName = (base: string, exceptIndex: number): string => {
    const taken = fields
      .filter((_, i) => i !== exceptIndex)
      .map((f) => f.name);

    if (!taken.includes(base)) return base;
    let n = 2;
    while (taken.includes(`${base}${n}`)) n += 1;
    return `${base}${n}`;
  };

  const addField = () => {
    const name = uniqueFieldName("newField", -1);
    const newFields = [...fields, { name, type: "string", required: false }];
    onChange("fields", newFields);
  };

  /**
   * Keep the stored name in step with the label while it is still a generated
   * default. Once a field has a real name, other nodes may reference it in a
   * {{token}}, so renaming it from here would silently break them.
   */
  const updateLabel = (index: number, label: string) => {
    const field = fields[index];
    const updates: Partial<InputField> = { label };

    if (isDefaultFieldName(field.name)) {
      const slug = slugifyFieldName(label);
      if (slug) updates.name = uniqueFieldName(slug, index);
    }

    updateField(index, updates);
  };

  const updateField = (index: number, updates: Partial<InputField>) => {
    const newFields = fields.map((f, i) => (i === index ? { ...f, ...updates } : f));
    onChange("fields", newFields);
  };

  const removeField = (index: number) => {
    const newFields = fields.filter((_, i) => i !== index);
    onChange("fields", newFields);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label>What should we ask for?</Label>
        <Button size="sm" variant="outline" onClick={addField}>
          <Plus className="h-3 w-3 mr-1" />
          Add question
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Each one becomes a box on the form shown before the workflow runs.
      </p>

      {fields.length === 0 && (
        <p className="text-sm text-muted-foreground py-4 text-center border rounded-lg border-dashed">
          Nothing asked for yet. This workflow will start straight away.
        </p>
      )}

      <div className="space-y-3">
        {fields.map((field, i) => (
          <div key={i} className="p-3 border rounded-lg space-y-3 bg-muted/30">
            <div className="flex items-center gap-2">
              <GripVertical className="h-4 w-4 text-muted-foreground" />
              <Input
                value={field.label ?? ""}
                onChange={(e) => updateLabel(i, e.target.value)}
                placeholder={humanizeFieldName(field.name) || "Question"}
                className="flex-1 h-8"
              />
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-destructive"
                onClick={() => removeField(i)}
                aria-label="Remove question"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>

            <div>
              <Label className="text-xs">Hint (optional)</Label>
              <Input
                value={field.description ?? ""}
                onChange={(e) => updateField(i, { description: e.target.value })}
                placeholder="Shown in small text under the box"
                className="h-8 mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Kind of answer</Label>
                <Select
                  value={field.type}
                  onValueChange={(v) => updateField(i, { type: v })}
                >
                  <SelectTrigger className="h-8 mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FIELD_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Pre-filled answer</Label>
                <Input
                  value={String(field.default ?? "")}
                  onChange={(e) => updateField(i, { default: e.target.value })}
                  placeholder="Optional"
                  className="h-8 mt-1"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id={`required-${i}`}
                checked={field.required ?? false}
                onCheckedChange={(checked) => updateField(i, { required: checked })}
              />
              <Label htmlFor={`required-${i}`} className="text-xs">
                Must be answered before running
              </Label>
            </div>

            {(field.type === "string" || !field.type) && (
              <div className="flex items-center gap-2">
                <Switch
                  id={`multiline-${i}`}
                  checked={field.multiline ?? false}
                  onCheckedChange={(checked) => updateField(i, { multiline: checked })}
                />
                <Label htmlFor={`multiline-${i}`} className="text-xs">
                  Expects more than a line
                </Label>
              </div>
            )}

            <p className="text-[11px] text-muted-foreground">
              Saved as{" "}
              <span className="font-medium">{field.name || "unnamed"}</span>. Other
              steps use this name to refer to the answer.
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

interface HeaderItem {
  key: string;
  value: string;
}

function ApiNodeConfig({ config, onChange, fields = [] }: ConfigProps) {
  const headers = config.headers as Record<string, string> | undefined;
  const headersList: HeaderItem[] = headers
    ? Object.entries(headers).map(([key, value]) => ({ key, value }))
    : [];

  const updateHeaders = (newList: HeaderItem[]) => {
    const newHeaders: Record<string, string> = {};
    newList.forEach((h) => {
      if (h.key.trim()) {
        newHeaders[h.key] = h.value;
      }
    });
    onChange("headers", newHeaders);
  };

  const addHeader = () => {
    updateHeaders([...headersList, { key: "", value: "" }]);
  };

  const updateHeader = (index: number, updates: Partial<HeaderItem>) => {
    const newList = headersList.map((h, i) => (i === index ? { ...h, ...updates } : h));
    updateHeaders(newList);
  };

  const removeHeader = (index: number) => {
    updateHeaders(headersList.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-dashed p-3 space-y-2">
        <p className="text-xs text-muted-foreground">
          Connecting to Slack, Notion, Airtable, email, or somewhere else? Let us
          fill in the technical parts.
        </p>
        <PresetPicker
          onApply={(preset) => {
            for (const [key, value] of Object.entries(preset)) {
              onChange(key, value);
            }
          }}
        />
      </div>

      <div>
        <Label>Web address</Label>
        <div className="mt-1">
          <TemplateInput
            value={(config.url as string) || ""}
            onChange={(next) => onChange("url", next)}
            fields={fields}
            placeholder="https://api.example.com/data"
          />
        </div>
      </div>

      <div>
        <Label>What should we do there?</Label>
        <Select
          value={(config.method as string) || "GET"}
          onValueChange={(v) => onChange("method", v)}
        >
          <SelectTrigger className="mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {HTTP_METHODS.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <Label>Headers</Label>
          <Button size="sm" variant="outline" onClick={addHeader}>
            <Plus className="h-3 w-3 mr-1" />
            Add Header
          </Button>
        </div>

        {headersList.length === 0 && (
          <p className="text-xs text-muted-foreground py-2 text-center border rounded border-dashed">
            No custom headers
          </p>
        )}

        <div className="space-y-2">
          {headersList.map((header, i) => (
            <div key={i} className="flex gap-2">
              <Input
                value={header.key}
                onChange={(e) => updateHeader(i, { key: e.target.value })}
                placeholder="Header name"
                className="h-8 flex-1"
              />
              <Input
                value={header.value}
                onChange={(e) => updateHeader(i, { value: e.target.value })}
                placeholder="Value"
                className="h-8 flex-1"
              />
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => removeHeader(i)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      {["POST", "PUT", "PATCH"].includes((config.method as string) || "") && (
        <RequestBodyEditor
          body={(config.body as string) || ""}
          onChange={(next) => onChange("body", next)}
          fields={fields}
        />
      )}

      <KeyValueEditor
        label="Which parts of the reply do you want to keep?"
        help="Give each piece a name you'll use later, and say where to find it in the reply."
        value={config.responseMapping as Record<string, unknown> | undefined}
        onChange={(next) => onChange("responseMapping", next)}
        keyPlaceholder="Call it…"
        valuePlaceholder="data.title"
        emptyMessage="Keeping the whole reply as-is"
        addLabel="Add a piece"
        showArrow
      />
    </div>
  );
}

/**
 * The request body is stored as a JSON string. Editing it structurally keeps the
 * stored shape identical while removing the need to write JSON by hand.
 *
 * A legacy value that isn't valid JSON stays editable as text rather than being
 * silently discarded, otherwise a saved workflow could lose its body.
 */
function RequestBodyEditor({
  body,
  onChange,
  fields,
}: {
  body: string;
  onChange: (next: string) => void;
  fields: AvailableField[];
}) {
  const parsed = useMemo(() => {
    if (!body.trim()) return { ok: true, value: {} as unknown };
    try {
      return { ok: true, value: JSON.parse(body) as unknown };
    } catch {
      return { ok: false, value: null };
    }
  }, [body]);

  if (!parsed.ok) {
    return (
      <div>
        <Label>What should we send?</Label>
        <p className="text-xs text-muted-foreground mt-1 mb-2">
          This was set up with custom text. Clear it to switch to the simple
          editor.
        </p>
        <TemplateInput
          value={body}
          onChange={onChange}
          fields={fields}
          multiline
          rows={4}
        />
      </div>
    );
  }

  return (
    <div>
      <Label>What should we send?</Label>
      <div className="mt-2">
        <ValueEditor
          value={parsed.value}
          onChange={(next) =>
            onChange(
              next && Object.keys(next as object).length > 0
                ? JSON.stringify(next)
                : ""
            )
          }
          kind="group"
          renderTextInput={({ value, onChange: setText, placeholder }) => (
            <TemplateInput
              value={value}
              onChange={setText}
              fields={fields}
              placeholder={placeholder}
            />
          )}
        />
      </div>
    </div>
  );
}

interface SchemaProperty {
  type: string;
  description: string;
}

function AiNodeConfig({ config, onChange, fields = [] }: ConfigProps) {
  const outputSchema = config.outputSchema as {
    type?: string;
    properties?: Record<string, SchemaProperty>;
    required?: string[];
  } | undefined;

  const properties = outputSchema?.properties || {};
  const propsList = Object.entries(properties).map(([name, prop]) => ({
    name,
    ...prop,
  }));

  const updateSchema = (newProps: Array<{ name: string; type: string; description: string }>) => {
    const newProperties: Record<string, SchemaProperty> = {};
    const required: string[] = [];

    newProps.forEach((p) => {
      if (p.name.trim()) {
        newProperties[p.name] = { type: p.type, description: p.description };
        required.push(p.name);
      }
    });

    onChange("outputSchema", {
      type: "object",
      properties: newProperties,
      required,
    });
  };

  const addProperty = () => {
    updateSchema([...propsList, { name: "newField", type: "string", description: "" }]);
  };

  const updateProperty = (index: number, updates: Partial<{ name: string; type: string; description: string }>) => {
    const newList = propsList.map((p, i) => (i === index ? { ...p, ...updates } : p));
    updateSchema(newList);
  };

  const removeProperty = (index: number) => {
    updateSchema(propsList.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      <div>
        <Label>How should the AI behave?</Label>
        <p className="text-xs text-muted-foreground mt-1 mb-2">
          Optional. Sets the tone and role for every run.
        </p>
        <Textarea
          value={(config.systemPrompt as string) || ""}
          onChange={(e) => onChange("systemPrompt", e.target.value)}
          placeholder="You are a helpful assistant."
          rows={3}
        />
      </div>

      <div>
        <Label>What should the AI do?</Label>
        <p className="text-xs text-muted-foreground mt-1 mb-2">
          Write the instruction. Use the button below to drop in answers from
          earlier steps.
        </p>
        <TemplateInput
          value={(config.userPromptTemplate as string) || ""}
          onChange={(next) => onChange("userPromptTemplate", next)}
          fields={fields}
          placeholder="Summarise this feedback and rate how urgent it is."
          multiline
          rows={4}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Creativity</Label>
          <Input
            type="number"
            min="0"
            max="2"
            step="0.1"
            value={(config.temperature as number) ?? 0.7}
            onChange={(e) => onChange("temperature", parseFloat(e.target.value))}
            className="mt-1"
          />
        </div>
        <div>
          <Label>Longest reply</Label>
          <Input
            type="number"
            min="1"
            max="100000"
            value={(config.maxTokens as number) ?? 2048}
            onChange={(e) => onChange("maxTokens", parseInt(e.target.value))}
            className="mt-1"
          />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <Label>What should the AI give back?</Label>
          <Button size="sm" variant="outline" onClick={addProperty}>
            <Plus className="h-3 w-3 mr-1" />
            Add answer
          </Button>
        </div>

        <p className="text-xs text-muted-foreground mb-2">
          Name each piece of the answer so later steps can use it.
        </p>

        {propsList.length === 0 && (
          <p className="text-sm text-muted-foreground py-4 text-center border rounded-lg border-dashed">
Nothing named yet, the AI will just return plain text.
          </p>
        )}

        <div className="space-y-2">
          {propsList.map((prop, i) => (
            <div key={i} className="p-2 border rounded space-y-2 bg-muted/30">
              <div className="flex gap-2">
                <Input
                  value={prop.name}
                  onChange={(e) => updateProperty(i, { name: e.target.value })}
                  placeholder="Name it, e.g. summary"
                  className="h-8 flex-1"
                />
                <Select
                  value={prop.type}
                  onValueChange={(v) => updateProperty(i, { type: v })}
                >
                  <SelectTrigger className="h-8 w-[130px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SCHEMA_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => removeProperty(i)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
              <Input
                value={prop.description}
                onChange={(e) => updateProperty(i, { description: e.target.value })}
                placeholder="What is this? Helps the AI get it right."
                className="h-8 text-xs"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

interface MappingItem {
  key: string;
  value: string;
}

/**
 * Ways to combine a list into one value. `value` is the operation name in the
 * `op:field` expression the Logic node already parses.
 */
const COMBINE_OPERATIONS = [
  { value: "sum", label: "Add them up", needsField: true },
  { value: "count", label: "Count them", needsField: false },
  { value: "avg", label: "Average them", needsField: true },
  { value: "min", label: "Find the smallest", needsField: true },
  { value: "max", label: "Find the largest", needsField: true },
  { value: "first", label: "Take the first one", needsField: false },
  { value: "last", label: "Take the last one", needsField: false },
  { value: "concat", label: "Join them into text", needsField: true },
];

function LogicNodeConfig({
  config,
  onChange,
  fields: upstreamFields = [],
  itemFields = [],
}: ConfigProps) {
  const operation = (config.operation as string) || "transform";

  // Operations that walk a list compare each `item`; the rest compare the
  // incoming values directly.
  const conditionFields =
    operation === "filter" ? itemFields : upstreamFields;

  const expression = (config.expression as string) || "";
  const [combineOp, combineField] = expression.split(":");
  const activeCombine =
    COMBINE_OPERATIONS.find((o) => o.value === combineOp) ?? COMBINE_OPERATIONS[0];

  const setCombine = (op: string, field: string) => {
    const spec = COMBINE_OPERATIONS.find((o) => o.value === op);
    onChange("expression", spec?.needsField && field ? `${op}:${field}` : op);
  };

  /**
   * Options for a mapping source. A saved mapping may point at a path the picker
   * can't derive yet, so it stays listed rather than disappearing when the row is
   * touched.
   */
  const mappingOptions = (current: string): AvailableField[] => {
    const base = operation === "map" ? itemFields : upstreamFields;
    if (current && !base.some((f) => f.path === current)) {
      return [
        { path: current, label: current, source: "Already set" },
        ...base,
      ];
    }
    return base;
  };
  const mappings = config.mappings as Record<string, string> | undefined;
  const mappingsList: MappingItem[] = mappings
    ? Object.entries(mappings).map(([key, value]) => ({ key, value }))
    : [];

  const updateMappings = (newList: MappingItem[]) => {
    const newMappings: Record<string, string> = {};
    newList.forEach((m) => {
      if (m.key.trim()) {
        newMappings[m.key] = m.value;
      }
    });
    onChange("mappings", newMappings);
  };

  const addMapping = () => {
    updateMappings([...mappingsList, { key: "", value: "" }]);
  };

  const updateMapping = (index: number, updates: Partial<MappingItem>) => {
    const newList = mappingsList.map((m, i) => (i === index ? { ...m, ...updates } : m));
    updateMappings(newList);
  };

  const removeMapping = (index: number) => {
    updateMappings(mappingsList.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      <div>
        <Label>What should this step do?</Label>
        <Select
          value={operation}
          onValueChange={(v) => onChange("operation", v)}
        >
          <SelectTrigger className="mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LOGIC_OPERATIONS.map((op) => (
              <SelectItem key={op.value} value={op.value}>
                {op.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground mt-1">
          {helpFor(LOGIC_OPERATIONS, operation)}
        </p>
      </div>

      {(operation === "filter" || operation === "condition") && (
        <ConditionBuilder
          value={config.condition as string | undefined}
          onChange={(next) => onChange("condition", next)}
          fields={conditionFields}
          label={operation === "filter" ? "Keep an item when…" : "Go this way when…"}
          help={
            operation === "filter"
              ? "Items that don't match are dropped."
              : "Sets which path the workflow takes next."
          }
        />
      )}

      {operation === "reduce" && (
        <div>
          <Label>How should we combine them?</Label>
          <div className="flex flex-wrap gap-2 mt-2">
            <Select
              value={activeCombine.value}
              onValueChange={(op) => setCombine(op, combineField || "")}
            >
              <SelectTrigger className="h-8 flex-1 min-w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COMBINE_OPERATIONS.map((op) => (
                  <SelectItem key={op.value} value={op.value}>
                    {op.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {activeCombine.needsField && (
              <Input
                className="h-8 flex-1 min-w-[120px]"
                value={combineField || ""}
                placeholder="Which value? e.g. amount"
                onChange={(e) => setCombine(activeCombine.value, e.target.value)}
              />
            )}
          </div>
        </div>
      )}

      {(operation === "transform" || operation === "map") && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label>
              {operation === "map"
                ? "What should each item become?"
                : "What should come out of this step?"}
            </Label>
            <Button size="sm" variant="outline" onClick={addMapping}>
              <Plus className="h-3 w-3 mr-1" />
              Add
            </Button>
          </div>

          <p className="text-xs text-muted-foreground mb-2">
            Name each value, then say where it comes from.
          </p>

          {mappingsList.length === 0 && (
            <p className="text-xs text-muted-foreground py-2 text-center border rounded border-dashed">
              Nothing set, everything passes through unchanged
            </p>
          )}

          <div className="space-y-2">
            {mappingsList.map((mapping, i) => (
              <div key={i} className="flex gap-2 items-center">
                <Input
                  value={mapping.key}
                  onChange={(e) => updateMapping(i, { key: e.target.value })}
                  placeholder="Call it…"
                  className="h-8 flex-1"
                />
                <span className="text-muted-foreground text-xs shrink-0">
                  comes from
                </span>
                <Select
                  value={mapping.value || undefined}
                  onValueChange={(v) => updateMapping(i, { value: v })}
                >
                  <SelectTrigger className="h-8 flex-1">
                    <SelectValue placeholder="Choose a value" />
                  </SelectTrigger>
                  <SelectContent>
                    {mappingOptions(mapping.value).length === 0 ? (
                      <SelectItem value="__none" disabled>
                        Connect an earlier step first
                      </SelectItem>
                    ) : (
                      mappingOptions(mapping.value).map((f) => (
                        <SelectItem key={f.path} value={f.path}>
                          {f.label}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => removeMapping(i)}
                  aria-label="Remove"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function OutputNodeConfig({
  config,
  onChange,
  fields: upstreamFields = [],
}: ConfigProps) {
  const format = (config.format as string) || "json";
  const fields = (config.fields as string[]) || [];

  const updateFields = (newFields: string[]) => {
    onChange("fields", newFields.filter((f) => f.trim()));
  };

  return (
    <div className="space-y-4">
      <div>
        <Label>How should the result look?</Label>
        <Select
          value={format}
          onValueChange={(v) => onChange("format", v)}
        >
          <SelectTrigger className="mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OUTPUT_FORMATS.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {format === "json" && (
        <div>
          <Label>Which values should the result include?</Label>
          <p className="text-xs text-muted-foreground mt-1 mb-2">
            Pick none to include everything.
          </p>

          {upstreamFields.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2 text-center border rounded border-dashed">
              Connect an earlier step to choose values
            </p>
          ) : (
            <div className="space-y-1.5">
              {upstreamFields.map((field) => {
                const checked = fields.includes(field.path);
                return (
                  <label
                    key={field.path}
                    className="flex items-center gap-2 text-sm cursor-pointer"
                  >
                    <Switch
                      checked={checked}
                      onCheckedChange={(on) =>
                        updateFields(
                          on
                            ? [...fields, field.path]
                            : fields.filter((f) => f !== field.path)
                        )
                      }
                    />
                    <span className="flex-1">{field.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {field.source}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      )}

      {(format === "text" || format === "markdown") && (
        <div>
          <Label>Write the result</Label>
          <p className="text-xs text-muted-foreground mt-1 mb-2">
            Type the wording you want, and drop in values from earlier steps.
          </p>
          <TemplateInput
            value={(config.template as string) || ""}
            onChange={(next) => onChange("template", next)}
            fields={upstreamFields}
            placeholder={
              format === "markdown"
                ? "# Summary\n\nHere is what we found."
                : "Result: "
            }
            multiline
            rows={6}
          />
        </div>
      )}
    </div>
  );
}

interface Connection {
  _id: string;
  integrationId: string;
  name: string;
  enabled: boolean;
  integration?: {
    id: string;
    name: string;
    icon: string;
  };
}

interface IntegrationAction {
  id: string;
  name: string;
  description: string;
  inputSchema?: Record<string, {
    type: string;
    description?: string;
    required?: boolean;
    default?: unknown;
  }>;
}

interface IntegrationDefinition {
  config: {
    id: string;
    name: string;
    icon: string;
  };
  actions: IntegrationAction[];
}

function IntegrationNodeConfig(props: ConfigProps) {
  if (!INTEGRATIONS_ENABLED) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-center space-y-2">
        <Plug className="h-5 w-5 mx-auto text-muted-foreground" />
        <p className="text-sm font-medium">
          App connections: {COMING_SOON_LABEL}
        </p>
        <p className="text-xs text-muted-foreground">
          Linking Flowys to other apps isn&apos;t ready yet, so this step
          can&apos;t be set up or run. You can delete it, or leave it and finish
          the rest of your workflow.
        </p>
      </div>
    );
  }

  return <IntegrationNodeConfigForm {...props} />;
}

function IntegrationNodeConfigForm({
  config,
  onChange,
  fields = [],
}: ConfigProps) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [integrations, setIntegrations] = useState<IntegrationDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedConnection, setSelectedConnection] = useState<Connection | null>(null);
  const [selectedIntegration, setSelectedIntegration] = useState<IntegrationDefinition | null>(null);

  const connectionId = config.connectionId as string | undefined;
  const actionId = config.actionId as string | undefined;
  const inputConfig = (config.input as Record<string, unknown>) || {};

  // Fetch connections and integrations on mount
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [connectionsRes, integrationsRes] = await Promise.all([
          fetch("/api/connections"),
          fetch("/api/integrations"),
        ]);

        const connectionsData = await connectionsRes.json();
        const integrationsData = await integrationsRes.json();

        setConnections(connectionsData.connections || []);
        setIntegrations(integrationsData.integrations || []);
      } catch (error) {
        console.error("Failed to fetch integration data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Update selected connection/integration when data loads or config changes
  useEffect(() => {
    if (connectionId && connections.length > 0) {
      const conn = connections.find((c) => c._id === connectionId);
      setSelectedConnection(conn || null);

      if (conn && integrations.length > 0) {
        const integ = integrations.find((i) => i.config.id === conn.integrationId);
        setSelectedIntegration(integ || null);
      }
    }
  }, [connectionId, connections, integrations]);

  const handleConnectionChange = (connId: string) => {
    const conn = connections.find((c) => c._id === connId);
    setSelectedConnection(conn || null);

    if (conn) {
      const integ = integrations.find((i) => i.config.id === conn.integrationId);
      setSelectedIntegration(integ || null);

      onChange("connectionId", connId);
      onChange("connectionName", conn.name);
      onChange("integrationId", conn.integrationId);
      onChange("integrationName", integ?.config.name || conn.integrationId);
      // Reset action when connection changes
      onChange("actionId", "");
      onChange("actionName", "");
      onChange("input", {});
    }
  };

  const handleActionChange = (actId: string) => {
    const action = selectedIntegration?.actions.find((a) => a.id === actId);
    onChange("actionId", actId);
    onChange("actionName", action?.name || actId);
    // Reset input when action changes
    onChange("input", {});
  };

  const handleInputChange = (key: string, value: unknown) => {
    onChange("input", { ...inputConfig, [key]: value });
  };

  const selectedAction = selectedIntegration?.actions.find((a) => a.id === actionId);
  const enabledConnections = connections.filter((c) => c.enabled);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (enabledConnections.length === 0) {
    return (
      <div className="space-y-4">
        <div className="text-center py-6 border rounded-lg border-dashed">
          <p className="text-sm text-muted-foreground mb-3">
            No connections available. Connect an app first.
          </p>
          <Button size="sm" asChild>
            <Link href="/integrations">
              <ExternalLink className="h-4 w-4 mr-1" />
              Go to Integrations
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <Label>Connection</Label>
        <Select value={connectionId || ""} onValueChange={handleConnectionChange}>
          <SelectTrigger className="mt-1">
            <SelectValue placeholder="Select a connection" />
          </SelectTrigger>
          <SelectContent>
            {enabledConnections.map((conn) => (
              <SelectItem key={conn._id} value={conn._id}>
                <div className="flex items-center gap-2">
                  {conn.integration?.icon && (
                    <img
                      src={conn.integration.icon}
                      alt=""
                      className="h-4 w-4"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  )}
                  {conn.name}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground mt-1">
          <Link href="/integrations" className="text-primary hover:underline">
            Manage connections
          </Link>
        </p>
      </div>

      {selectedConnection && selectedIntegration && (
        <div>
          <Label>Action</Label>
          <Select value={actionId || ""} onValueChange={handleActionChange}>
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="Select an action" />
            </SelectTrigger>
            <SelectContent>
              {selectedIntegration.actions.map((action) => (
                <SelectItem key={action.id} value={action.id}>
                  {action.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedAction && (
            <p className="text-xs text-muted-foreground mt-1">
              {selectedAction.description}
            </p>
          )}
        </div>
      )}

      {selectedAction?.inputSchema && Object.keys(selectedAction.inputSchema).length > 0 && (
        <div className="space-y-3">
          <Label>Details for this action</Label>
          {Object.entries(selectedAction.inputSchema).map(([key, schema]) => (
            <div key={key} className="space-y-1">
              <Label className="text-xs font-normal">
                {humanizeFieldName(key)}
                {schema.required && <span className="text-destructive ml-1">*</span>}
              </Label>
              {schema.type === "string" && (
                <TemplateInput
                  value={(inputConfig[key] as string) || ""}
                  onChange={(next) => handleInputChange(key, next)}
                  fields={fields}
                  placeholder={schema.description || `Enter ${humanizeFieldName(key)}`}
                />
              )}
              {schema.type === "number" && (
                <Input
                  type="number"
                  value={(inputConfig[key] as number) ?? ""}
                  onChange={(e) => handleInputChange(key, parseFloat(e.target.value) || 0)}
                  placeholder={schema.description || `Enter ${key}`}
                  className="h-8"
                />
              )}
              {schema.type === "boolean" && (
                <div className="flex items-center gap-2">
                  <Switch
                    checked={(inputConfig[key] as boolean) ?? false}
                    onCheckedChange={(checked) => handleInputChange(key, checked)}
                  />
                  <span className="text-xs text-muted-foreground">{schema.description}</span>
                </div>
              )}
              {(schema.type === "array" || schema.type === "object") && (
                <div className="rounded-md border p-2">
                  <ValueEditor
                    value={
                      inputConfig[key] ?? (schema.type === "array" ? [] : {})
                    }
                    onChange={(next) => handleInputChange(key, next)}
                    kind={schema.type === "array" ? "list" : "group"}
                    renderTextInput={({ value, onChange: setText, placeholder }) => (
                      <TemplateInput
                        value={value}
                        onChange={setText}
                        fields={fields}
                        placeholder={placeholder}
                      />
                    )}
                  />
                </div>
              )}
              {schema.description && schema.type !== "boolean" && (
                <p className="text-xs text-muted-foreground">{schema.description}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function WebhookNodeConfig({ config, onChange, fields = [] }: ConfigProps) {
  const headers = config.headers as Record<string, string> | undefined;
  const headersList: { key: string; value: string }[] = headers
    ? Object.entries(headers).map(([key, value]) => ({ key, value }))
    : [];

  const updateHeaders = (newList: { key: string; value: string }[]) => {
    const newHeaders: Record<string, string> = {};
    newList.forEach((h) => {
      if (h.key.trim()) {
        newHeaders[h.key] = h.value;
      }
    });
    onChange("headers", newHeaders);
  };

  const addHeader = () => {
    updateHeaders([...headersList, { key: "", value: "" }]);
  };

  const updateHeader = (index: number, updates: Partial<{ key: string; value: string }>) => {
    const newList = headersList.map((h, i) => (i === index ? { ...h, ...updates } : h));
    updateHeaders(newList);
  };

  const removeHeader = (index: number) => {
    updateHeaders(headersList.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      <div>
        <Label>Where should we send it?</Label>
        <div className="mt-1">
          <TemplateInput
            value={(config.url as string) || ""}
            onChange={(next) => onChange("url", next)}
            fields={fields}
            placeholder="https://example.com/webhook"
          />
        </div>
      </div>

      <div>
        <Label>What should we do there?</Label>
        <Select
          value={(config.method as string) || "POST"}
          onValueChange={(v) => onChange("method", v)}
        >
          <SelectTrigger className="mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {HTTP_METHODS.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <Label>Headers</Label>
          <Button size="sm" variant="outline" onClick={addHeader}>
            <Plus className="h-3 w-3 mr-1" />
            Add
          </Button>
        </div>

        {headersList.length === 0 && (
          <p className="text-xs text-muted-foreground py-2 text-center border rounded border-dashed">
            No custom headers
          </p>
        )}

        <div className="space-y-2">
          {headersList.map((header, i) => (
            <div key={i} className="flex gap-2">
              <Input
                value={header.key}
                onChange={(e) => updateHeader(i, { key: e.target.value })}
                placeholder="Header"
                className="h-8 flex-1"
              />
              <Input
                value={header.value}
                onChange={(e) => updateHeader(i, { value: e.target.value })}
                placeholder="Value"
                className="h-8 flex-1"
              />
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => removeHeader(i)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <Label>What should we send?</Label>
        <p className="text-xs text-muted-foreground mt-1 mb-2">
          Name each piece of information and choose what goes in it.
        </p>
        <ValueEditor
          value={(config.payloadTemplate as Record<string, unknown>) ?? {}}
          onChange={(next) =>
            onChange(
              "payloadTemplate",
              next && Object.keys(next as object).length > 0 ? next : undefined
            )
          }
          kind="group"
          renderTextInput={({ value, onChange: setText, placeholder }) => (
            <TemplateInput
              value={value}
              onChange={setText}
              fields={fields}
              placeholder={placeholder}
            />
          )}
        />
      </div>

      <div>
        <Label>Timeout (ms)</Label>
        <Input
          type="number"
          value={(config.timeout as number) ?? 30000}
          onChange={(e) => onChange("timeout", parseInt(e.target.value) || 30000)}
          className="mt-1"
        />
      </div>

      <div className="flex items-center gap-2">
        <Switch
          id="continueOnError"
          checked={(config.continueOnError as boolean) ?? false}
          onCheckedChange={(checked) => onChange("continueOnError", checked)}
        />
        <Label htmlFor="continueOnError" className="text-sm font-normal">
          Continue workflow on error
        </Label>
      </div>
    </div>
  );
}
