import { describe, expect, it } from "vitest";
import {
  CONDITION_OPERATORS,
  buildCondition,
  parseCondition,
} from "@/lib/vocabulary";
import { LogicNodeHandler } from "@/lib/nodes/logic";

/**
 * The condition builder writes a string that the Logic node parses. Those two
 * pieces live in different files and neither imports the other, so this suite
 * pins the contract between them: anything the builder can produce, the engine
 * must evaluate correctly.
 */

const logic = new LogicNodeHandler();

async function evaluate(
  condition: string,
  inputs: Record<string, unknown>
): Promise<boolean> {
  const result = await logic.execute({
    nodeId: "n1",
    inputs,
    config: { operation: "condition", condition },
    globalContext: {},
  });

  if (!result.success) throw new Error(result.error);
  return result.output?.result as boolean;
}

describe("buildCondition / parseCondition round-trip", () => {
  it("round-trips a text comparison", () => {
    const built = buildCondition("status", "===", "active");
    expect(parseCondition(built)).toEqual({
      field: "status",
      operator: "===",
      value: "active",
    });
  });

  it("round-trips a numeric comparison", () => {
    const built = buildCondition("score", ">", "80");
    expect(parseCondition(built)).toEqual({
      field: "score",
      operator: ">",
      value: "80",
    });
  });

  it("round-trips a nested field path", () => {
    const built = buildCondition("item.score", ">=", "5");
    expect(parseCondition(built)).toEqual({
      field: "item.score",
      operator: ">=",
      value: "5",
    });
  });

  it("round-trips an operator that takes no value", () => {
    const built = buildCondition("email", "exists", "");
    expect(parseCondition(built).operator).toBe("exists");
  });

  it("returns a usable default for an empty condition", () => {
    expect(parseCondition(undefined)).toEqual({
      field: "",
      operator: "===",
      value: "",
    });
  });

  it("keeps a bare field as the field rather than losing it", () => {
    expect(parseCondition("someField").field).toBe("someField");
  });
});

describe("quoting", () => {
  it("quotes text so the engine does not treat it as a field path", () => {
    // Unquoted, `active` would be looked up as a field and resolve to undefined.
    expect(buildCondition("status", "===", "active")).toBe("status === 'active'");
  });

  it("leaves numbers bare so numeric comparators work", () => {
    expect(buildCondition("score", ">", "80")).toBe("score > 80");
  });

  it("leaves booleans bare", () => {
    expect(buildCondition("flag", "===", "true")).toBe("flag === true");
  });
});

describe("engine evaluation of every builder operator", () => {
  it("has an engine-recognised token for each offered operator", async () => {
    // A token the engine does not know falls through to a truthiness check,
    // which silently produces wrong answers rather than an error.
    for (const op of CONDITION_OPERATORS) {
      const condition = buildCondition("value", op.value, "x");
      const parsed = parseCondition(condition);
      expect(parsed.operator, `operator ${op.value} did not survive`).toBe(
        op.value
      );
    }
  });

  it("is / is not", async () => {
    expect(await evaluate(buildCondition("s", "===", "a"), { s: "a" })).toBe(true);
    expect(await evaluate(buildCondition("s", "===", "a"), { s: "b" })).toBe(false);
    expect(await evaluate(buildCondition("s", "!==", "a"), { s: "b" })).toBe(true);
  });

  it("greater / less than", async () => {
    expect(await evaluate(buildCondition("n", ">", "5"), { n: 10 })).toBe(true);
    expect(await evaluate(buildCondition("n", ">", "5"), { n: 1 })).toBe(false);
    expect(await evaluate(buildCondition("n", "<", "5"), { n: 1 })).toBe(true);
    expect(await evaluate(buildCondition("n", ">=", "5"), { n: 5 })).toBe(true);
    expect(await evaluate(buildCondition("n", "<=", "5"), { n: 5 })).toBe(true);
  });

  it("contains / does not contain", async () => {
    expect(
      await evaluate(buildCondition("s", "contains", "urgent"), {
        s: "this is urgent",
      })
    ).toBe(true);
    expect(
      await evaluate(buildCondition("s", "notContains", "urgent"), {
        s: "all calm",
      })
    ).toBe(true);
    expect(
      await evaluate(buildCondition("s", "notContains", "urgent"), {
        s: "this is urgent",
      })
    ).toBe(false);
  });

  it("starts with / ends with", async () => {
    expect(
      await evaluate(buildCondition("s", "startsWith", "re:"), { s: "re: hello" })
    ).toBe(true);
    expect(
      await evaluate(buildCondition("s", "endsWith", ".pdf"), { s: "a.pdf" })
    ).toBe(true);
  });

  it("is empty / is not empty", async () => {
    expect(await evaluate(buildCondition("s", "empty", ""), { s: "" })).toBe(true);
    expect(await evaluate(buildCondition("s", "empty", ""), { s: "x" })).toBe(false);
    expect(await evaluate(buildCondition("s", "exists", ""), { s: "x" })).toBe(true);
    expect(await evaluate(buildCondition("s", "exists", ""), { s: "" })).toBe(false);
  });

  it("evaluates a nested path against real data", async () => {
    expect(
      await evaluate(buildCondition("item.score", ">", "7"), {
        item: { score: 9 },
      })
    ).toBe(true);
  });
});

describe("regression: strict-equality operator ordering", () => {
  it("evaluates `===` rather than matching `==` and stranding the value", async () => {
    // The operator alternation used to be ordered `==|===`, so `x === 5` matched
    // `==` and left `= 5` as the right-hand side — always false.
    expect(await evaluate("n === 5", { n: 5 })).toBe(true);
    expect(await evaluate("n === 5", { n: 6 })).toBe(false);
  });

  it("still evaluates the loose form for conditions saved earlier", async () => {
    expect(await evaluate("n == 5", { n: 5 })).toBe(true);
  });

  it("evaluates `!==` rather than matching `!=`", async () => {
    expect(await evaluate("n !== 5", { n: 6 })).toBe(true);
    expect(await evaluate("n !== 5", { n: 5 })).toBe(false);
  });
});
