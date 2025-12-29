import type { NodeHandler, NodeContext, NodeResult, LogicNodeConfig } from "./types";

export class LogicNodeHandler implements NodeHandler {
  type = "logic" as const;

  // Find array data in inputs - checks common keys and falls back to first array found
  private findArrayData(inputs: Record<string, unknown>): unknown[] | null {
    // Check common array keys first
    const commonKeys = ["data", "items", "results", "list", "records", "rows", "caregivers", "users", "entries"];
    for (const key of commonKeys) {
      if (Array.isArray(inputs[key])) {
        return inputs[key] as unknown[];
      }
    }

    // Fall back to first array found in inputs
    for (const value of Object.values(inputs)) {
      if (Array.isArray(value)) {
        return value;
      }
    }

    // Check if inputs itself is an array
    if (Array.isArray(inputs)) {
      return inputs;
    }

    return null;
  }

  async execute(context: NodeContext): Promise<NodeResult> {
    const config = context.config as unknown as LogicNodeConfig;

    try {
      // Default to passthrough if no operation specified
      const operation = config.operation || "passthrough";

      switch (operation) {
        case "filter":
          return this.executeFilter(context, config);
        case "map":
          return this.executeMap(context, config);
        case "reduce":
          return this.executeReduce(context, config);
        case "condition":
          return this.executeCondition(context, config);
        case "transform":
          return this.executeTransform(context, config);
        case "passthrough":
          return this.executePassthrough(context);
        case "sort":
          return this.executeSort(context, config);
        case "slice":
          return this.executeSlice(context, config);
        default:
          // Try passthrough for unknown operations
          return this.executePassthrough(context);
      }
    } catch (error) {
      return {
        success: false,
        error: `Logic error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  private executeFilter(context: NodeContext, config: LogicNodeConfig): NodeResult {
    const data = this.findArrayData(context.inputs);
    if (!data) {
      return {
        success: false,
        error: "Filter needs a list of items to work with. The previous node didn't output any array data. Check that your API or data source is returning a list."
      };
    }

    const condition = config.condition;
    if (!condition) {
      return {
        success: false,
        error: "Filter needs a condition to know what to keep. Click this node and add a condition like 'item.score > 80' in the settings."
      };
    }

    const filtered = data.filter((item) => {
      return this.evaluateCondition(condition, { item, ...context.inputs });
    });

    return { success: true, output: { data: filtered, count: filtered.length } };
  }

  private executeMap(context: NodeContext, config: LogicNodeConfig): NodeResult {
    const data = this.findArrayData(context.inputs);
    if (!data) {
      return {
        success: false,
        error: "Map needs a list of items to transform. The previous node didn't output any array data. Check that your API or data source is returning a list."
      };
    }

    const mappings = config.mappings;
    if (!mappings) {
      // If no mappings, just pass through the data
      return { success: true, output: { data, count: data.length } };
    }

    const mapped = data.map((item, index) => {
      const result: Record<string, unknown> = {};
      // Create context with both 'item' reference and direct item properties
      const itemContext = {
        item,
        index,
        ...(typeof item === "object" && item !== null ? item as Record<string, unknown> : {}),
      };

      for (const [key, path] of Object.entries(mappings)) {
        // Try getting value from item context first
        let value = this.getNestedValue(itemContext, path);

        // If not found and path starts with 'item.', try without prefix
        if (value === undefined && path.startsWith("item.")) {
          value = this.getNestedValue(item as Record<string, unknown>, path.slice(5));
        }

        // If still not found, try direct property access on item
        if (value === undefined && typeof item === "object" && item !== null) {
          value = (item as Record<string, unknown>)[path];
        }

        result[key] = value;
      }
      return result;
    });

    return { success: true, output: { data: mapped, count: mapped.length } };
  }

  private executeReduce(context: NodeContext, config: LogicNodeConfig): NodeResult {
    const data = this.findArrayData(context.inputs);
    if (!data) {
      return {
        success: false,
        error: "Reduce needs a list of items to combine. The previous node didn't output any array data. Check that your API or data source is returning a list."
      };
    }

    const expression = config.expression;
    if (!expression) {
      return {
        success: false,
        error: "Reduce needs an expression to know how to combine items. Click this node and add an expression like 'sum:score' or 'count' in the settings."
      };
    }

    const operations: Record<string, (arr: unknown[]) => unknown> = {
      sum: (arr) => arr.reduce((acc: number, val) => acc + (Number(val) || 0), 0),
      count: (arr) => arr.length,
      avg: (arr) => {
        const nums = arr.filter((v) => typeof v === "number") as number[];
        return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
      },
      min: (arr) => Math.min(...arr.filter((v) => typeof v === "number") as number[]),
      max: (arr) => Math.max(...arr.filter((v) => typeof v === "number") as number[]),
      concat: (arr) => arr.join(""),
      first: (arr) => arr[0],
      last: (arr) => arr[arr.length - 1],
    };

    const [op, field] = expression.split(":");
    const values = field
      ? data.map((item) => this.getNestedValue(item as Record<string, unknown>, field))
      : data;

    const operation = operations[op];
    if (!operation) {
      return { success: false, error: `Unknown reduce operation: ${op}` };
    }

    return { success: true, output: { result: operation(values) } };
  }

  private executeCondition(context: NodeContext, config: LogicNodeConfig): NodeResult {
    const condition = config.condition;
    if (!condition) {
      return {
        success: false,
        error: "Condition needs a rule to check. Click this node and add a condition like 'data.status == \"active\"' in the settings."
      };
    }

    const result = this.evaluateCondition(condition, context.inputs);

    return {
      success: true,
      output: {
        result,
        branch: result ? "true" : "false",
        data: context.inputs,
      },
    };
  }

  private executeTransform(context: NodeContext, config: LogicNodeConfig): NodeResult {
    const mappings = config.mappings;
    if (!mappings) {
      // No mappings - just pass through the inputs
      return { success: true, output: { ...context.inputs } };
    }

    const result: Record<string, unknown> = {};
    for (const [key, path] of Object.entries(mappings)) {
      result[key] = this.getNestedValue(context.inputs, path);
    }

    return { success: true, output: result };
  }

  private executePassthrough(context: NodeContext): NodeResult {
    // Simply pass through all inputs unchanged
    const data = this.findArrayData(context.inputs);
    if (data) {
      return { success: true, output: { data, count: data.length, ...context.inputs } };
    }
    return { success: true, output: { ...context.inputs } };
  }

  private executeSort(context: NodeContext, config: LogicNodeConfig): NodeResult {
    const data = this.findArrayData(context.inputs);
    if (!data) {
      return {
        success: false,
        error: "Sort needs a list of items to sort. The previous node didn't output any array data."
      };
    }

    const expression = config.expression || "asc";
    const [direction, field] = expression.includes(":")
      ? expression.split(":")
      : [expression, undefined];

    const sorted = [...data].sort((a, b) => {
      let valA: unknown, valB: unknown;

      if (field && typeof a === "object" && typeof b === "object") {
        valA = this.getNestedValue(a as Record<string, unknown>, field);
        valB = this.getNestedValue(b as Record<string, unknown>, field);
      } else {
        valA = a;
        valB = b;
      }

      // Handle different types
      if (typeof valA === "number" && typeof valB === "number") {
        return direction === "desc" ? valB - valA : valA - valB;
      }

      const strA = String(valA || "");
      const strB = String(valB || "");
      return direction === "desc"
        ? strB.localeCompare(strA)
        : strA.localeCompare(strB);
    });

    return { success: true, output: { data: sorted, count: sorted.length } };
  }

  private executeSlice(context: NodeContext, config: LogicNodeConfig): NodeResult {
    const data = this.findArrayData(context.inputs);
    if (!data) {
      return {
        success: false,
        error: "Slice needs a list of items. The previous node didn't output any array data."
      };
    }

    const expression = config.expression || "0:10";
    const [startStr, endStr] = expression.split(":");
    const start = parseInt(startStr) || 0;
    const end = endStr ? parseInt(endStr) : undefined;

    const sliced = data.slice(start, end);

    return { success: true, output: { data: sliced, count: sliced.length } };
  }

  private evaluateCondition(condition: string, context: Record<string, unknown>): boolean {
    const operators: Record<string, (a: unknown, b: unknown) => boolean> = {
      "==": (a, b) => a == b,
      "===": (a, b) => a === b,
      "!=": (a, b) => a != b,
      "!==": (a, b) => a !== b,
      ">": (a, b) => Number(a) > Number(b),
      ">=": (a, b) => Number(a) >= Number(b),
      "<": (a, b) => Number(a) < Number(b),
      "<=": (a, b) => Number(a) <= Number(b),
      contains: (a, b) => String(a).includes(String(b)),
      startsWith: (a, b) => String(a).startsWith(String(b)),
      endsWith: (a, b) => String(a).endsWith(String(b)),
      exists: (a) => a !== undefined && a !== null,
      empty: (a) => !a || (Array.isArray(a) && a.length === 0),
    };

    const match = condition.match(/^(\S+)\s+(==|===|!=|!==|>=|<=|>|<|contains|startsWith|endsWith|exists|empty)\s*(.*)$/);
    if (!match) {
      return Boolean(this.getNestedValue(context, condition));
    }

    const [, leftPath, operator, rightValue] = match;
    const leftVal = this.getNestedValue(context, leftPath);
    const rightVal = rightValue.startsWith("'") || rightValue.startsWith('"')
      ? rightValue.slice(1, -1)
      : this.getNestedValue(context, rightValue) ?? rightValue;

    const op = operators[operator];
    return op ? op(leftVal, rightVal) : false;
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
    const validOperations = ["filter", "map", "reduce", "condition", "transform", "passthrough", "sort", "slice"];

    // Operation is optional - defaults to passthrough
    if (config.operation && !validOperations.includes(config.operation as string)) {
      return {
        valid: false,
        errors: [`operation must be one of: ${validOperations.join(", ")}`],
      };
    }

    return { valid: true };
  }
}
