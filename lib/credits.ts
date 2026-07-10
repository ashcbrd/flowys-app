import { v4 as uuid } from "uuid";
import { connectToDatabase } from "@/lib/db";
import { UserCredits, DEFAULT_CREDITS } from "@/lib/db/models/UserCredits";
import type { NodeData } from "@/lib/db/schemas";
import { UNLIMITED_CREDITS } from "@/lib/features";

const CREDIT_COSTS: Record<string, number> = {
  input: 0,
  output: 0,
  logic: 1,
  api: 1,
  ai: 10,
  webhook: 1,
  integration: 1,
  // An image call costs orders of magnitude more than the text call behind
  // `ai`, and the relative prices should say so.
  image: 25,
  // Compositing is local, but a brand kit stores half a dozen assets.
  brand: 5,
  email: 2,
};

export function calculateWorkflowCost(nodes: NodeData[]): number {
  return nodes.reduce((total, node) => total + (CREDIT_COSTS[node.type] || 0), 0);
}

/**
 * What indexing a document costs.
 *
 * Embedding is billed per chunk because that is what is actually sent to the
 * provider: a 200 page policy document is two orders of magnitude more work
 * than a one page FAQ, and charging both the same would make the number
 * meaningless. One credit per ten chunks keeps a typical handbook in single
 * figures while a large corpus still shows up.
 *
 * Indexing was free and untracked until this existed, which meant the one part
 * of the product with an unbounded per-request cost was the one part with no
 * record of what it had spent.
 */
export function calculateIndexingCost(chunkCount: number): number {
  if (chunkCount <= 0) return 0;
  return Math.max(1, Math.ceil(chunkCount / 10));
}

/**
 * What answering one question over documents costs.
 *
 * A retrieval is one embedding of the question plus a vector search, so it is
 * cheap; the answer that follows is an ordinary AI call and is billed at the
 * `ai` rate by whatever makes it.
 */
export const RETRIEVAL_COST = 1;

export async function getOrCreateCredits(userId: string): Promise<{ remaining: number; used: number }> {
  await connectToDatabase();

  if (UNLIMITED_CREDITS) {
    const existing = await UserCredits.findOne({ userId }).lean();
    return { remaining: Number.MAX_SAFE_INTEGER, used: existing?.creditsUsed ?? 0 };
  }

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
  const required = calculateWorkflowCost(nodes);

  // The gate is skipped, but the cost is still reported so anything that
  // displays it keeps working.
  if (UNLIMITED_CREDITS) {
    return { hasCredits: true, required, remaining: Number.MAX_SAFE_INTEGER };
  }

  const credits = await getOrCreateCredits(userId);

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
  // Keep recording what was used, but never fail a run over it. Without this the
  // run would clear the gate above and then be refused here instead.
  if (UNLIMITED_CREDITS) {
    await connectToDatabase();
    const credits = await UserCredits.findOne({ userId });

    if (credits) {
      credits.creditsUsed += amount;
      credits.creditsRemaining = DEFAULT_CREDITS;
      await credits.save();
    }

    return { success: true, remaining: Number.MAX_SAFE_INTEGER };
  }

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
