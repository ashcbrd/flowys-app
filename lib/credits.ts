import { v4 as uuid } from "uuid";
import { connectToDatabase } from "@/lib/db";
import { UserCredits, DEFAULT_CREDITS } from "@/lib/db/models/UserCredits";
import type { NodeData } from "@/lib/db/schemas";

const CREDIT_COSTS: Record<string, number> = {
  input: 0,
  output: 0,
  logic: 1,
  api: 1,
  ai: 10,
  webhook: 1,
  integration: 1,
};

export function calculateWorkflowCost(nodes: NodeData[]): number {
  return nodes.reduce((total, node) => total + (CREDIT_COSTS[node.type] || 0), 0);
}

export async function getOrCreateCredits(userId: string): Promise<{ remaining: number; used: number }> {
  await connectToDatabase();

  const existing = await UserCredits.findOne({ userId }).lean();
  if (existing) {
    return {
      remaining: existing.creditsRemaining,
      used: existing.creditsUsed,
    };
  }

  const created = await UserCredits.create({
    _id: uuid(),
    userId,
    creditsRemaining: DEFAULT_CREDITS,
    creditsUsed: 0,
  });

  return {
    remaining: created.creditsRemaining,
    used: created.creditsUsed,
  };
}

export async function hasEnoughCredits(
  userId: string,
  nodes: NodeData[]
): Promise<{ hasCredits: boolean; required: number; remaining: number }> {
  const credits = await getOrCreateCredits(userId);
  const required = calculateWorkflowCost(nodes);

  return {
    hasCredits: credits.remaining >= required,
    required,
    remaining: credits.remaining,
  };
}

export async function deductCredits(
  userId: string,
  amount: number
): Promise<{ success: boolean; remaining: number; error?: string }> {
  await connectToDatabase();

  const credits = await UserCredits.findOne({ userId });
  if (!credits) {
    return { success: false, remaining: 0, error: "Credits not found" };
  }

  if (credits.creditsRemaining < amount) {
    return {
      success: false,
      remaining: credits.creditsRemaining,
      error: "Insufficient credits",
    };
  }

  credits.creditsRemaining -= amount;
  credits.creditsUsed += amount;
  await credits.save();

  return { success: true, remaining: credits.creditsRemaining };
}
