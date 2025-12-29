import type { NodeHandler, NodeContext, NodeResult, InputNodeConfig } from "./types";

export class InputNodeHandler implements NodeHandler {
  type = "input" as const;

  async execute(context: NodeContext): Promise<NodeResult> {
    const config = context.config as unknown as InputNodeConfig;
    const output: Record<string, unknown> = {};

    if (!config.fields || config.fields.length === 0) {
      return {
        success: true,
        output: { ...context.inputs },
      };
    }

    for (const field of config.fields) {
      const inputValue = context.inputs[field.name];

      if (inputValue === undefined || inputValue === null || inputValue === "") {
        if (field.default !== undefined) {
          output[field.name] = field.default;
        } else {
          output[field.name] = this.getDefaultForType(field.type);
        }
      } else {
        const converted = this.convertValue(inputValue, field.type);
        if (converted.error) {
          console.warn(`Field "${field.name}" conversion warning: ${converted.error}`);
          output[field.name] = inputValue;
        } else {
          output[field.name] = converted.value;
        }
      }
    }

    return {
      success: true,
      output,
    };
  }

  private getDefaultForType(type: string): unknown {
    switch (type) {
      case "string":
        return "";
      case "number":
        return 0;
      case "boolean":
        return false;
      case "json":
        return {};
      default:
        return "";
    }
  }

  private convertValue(
    value: unknown,
    type: string
  ): { value?: unknown; error?: string } {
    switch (type) {
      case "string":
        return { value: String(value) };
      case "number":
        const num = Number(value);
        if (isNaN(num)) {
          return { error: "Cannot convert to number" };
        }
        return { value: num };
      case "boolean":
        if (typeof value === "boolean") return { value };
        if (value === "true") return { value: true };
        if (value === "false") return { value: false };
        return { error: "Cannot convert to boolean" };
      case "json":
        if (typeof value === "object") return { value };
        try {
          return { value: JSON.parse(String(value)) };
        } catch {
          return { error: "Invalid JSON" };
        }
      default:
        return { value };
    }
  }

  validateConfig(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];

    if (!config.fields || !Array.isArray(config.fields)) {
      errors.push("fields must be an array");
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }
}
