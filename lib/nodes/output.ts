import type { NodeHandler, NodeContext, NodeResult, OutputNodeConfig } from "./types";

export class OutputNodeHandler implements NodeHandler {
  type = "output" as const;

  async execute(context: NodeContext): Promise<NodeResult> {
    const config = context.config as unknown as OutputNodeConfig;

    try {
      // Handle empty inputs gracefully
      if (!context.inputs || Object.keys(context.inputs).length === 0) {
        return {
          success: true,
          output: { result: null, message: "No data to output", format: config.format || "json" },
        };
      }

      let output: Record<string, unknown>;
      const format = config.format || "json";

      switch (format) {
        case "json":
          output = this.formatJson(context, config);
          break;
        case "text":
          output = this.formatText(context, config);
          break;
        case "markdown":
          output = this.formatMarkdown(context, config);
          break;
        default:
          output = { result: context.inputs, format: "json" };
      }

      return {
        success: true,
        output,
      };
    } catch (error) {
      return {
        success: false,
        error: `Output error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  private formatJson(context: NodeContext, config: OutputNodeConfig): Record<string, unknown> {
    if (config.fields && config.fields.length > 0) {
      const filtered: Record<string, unknown> = {};
      for (const field of config.fields) {
        const value = this.getNestedValue(context.inputs, field);
        if (value !== undefined) {
          filtered[field] = value;
        }
      }
      return { result: filtered, format: "json" };
    }

    return { result: context.inputs, format: "json" };
  }

  private formatText(context: NodeContext, config: OutputNodeConfig): Record<string, unknown> {
    if (config.template) {
      const text = this.interpolateVariables(config.template, context.inputs);
      return { result: text, format: "text" };
    }

    const values = Object.values(context.inputs);
    const text = values
      .map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v)))
      .join("\n");

    return { result: text, format: "text" };
  }

  private formatMarkdown(context: NodeContext, config: OutputNodeConfig): Record<string, unknown> {
    if (config.template) {
      const md = this.interpolateVariables(config.template, context.inputs);
      return { result: md, format: "markdown" };
    }

    let md = "";

    for (const [key, value] of Object.entries(context.inputs)) {
      md += `## ${key}\n\n`;
      if (typeof value === "object") {
        md += "```json\n" + JSON.stringify(value, null, 2) + "\n```\n\n";
      } else {
        md += `${value}\n\n`;
      }
    }

    return { result: md.trim(), format: "markdown" };
  }

  private interpolateVariables(template: string, inputs: Record<string, unknown>): string {
    return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_, path) => {
      const value = this.getNestedValue(inputs, path);
      if (value === undefined) return `{{${path}}}`;
      if (typeof value === "object") return JSON.stringify(value);
      return String(value);
    });
  }

  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    const keys = path.split(".");
    let current: unknown = obj;

    for (const key of keys) {
      if (current === null || current === undefined) return undefined;
      if (typeof current !== "object") return undefined;
      current = (current as Record<string, unknown>)[key];
    }

    return current;
  }

  validateConfig(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];

    if (config.format && !["json", "text", "markdown"].includes(config.format as string)) {
      errors.push("format must be json, text, or markdown");
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }
}
