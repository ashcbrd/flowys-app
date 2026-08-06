import type { NodeHandler, NodeContext, NodeResult, RetrievalNodeConfig } from "./types";
import { interpolateVariables } from "@/lib/utils/template";

/**
 * The step that searches the owner's documents mid-workflow.
 *
 * It runs through the same retrieval service as the chat surface, so access
 * rules cannot drift between the two: what a workflow can read is exactly what
 * its owner can read, nothing more, on every trigger path including schedules
 * and webhooks where nobody is signed in.
 *
 * Output shape is designed for the step after it, which is nearly always an AI
 * step: `context` is ready to paste into a prompt with numbered passages, and
 * `citations` carries the structured provenance so an output step can show
 * where every claim came from.
 */
export class RetrievalNodeHandler implements NodeHandler {
  type = "retrieval" as const;

  async execute(context: NodeContext): Promise<NodeResult> {
    const config = context.config as unknown as RetrievalNodeConfig;

    if (!context.userId) {
      // Fail closed. Guessing an identity here would mean a workflow reading
      // documents its owner cannot see.
      return {
        success: false,
        error: "This run has no owner attached, so the documents cannot be searched",
      };
    }

    const query = interpolateVariables(config.queryTemplate ?? "", {
      ...context.globalContext,
      ...context.inputs,
    }).trim();

    // An unresolved placeholder survives interpolation as literal "{{name}}"
    // text. A query that is nothing but unresolved placeholders would search
    // the documents for the string "{{missing}}", fail to match anything, and
    // report success. Empty and effectively-empty both stop here instead.
    const withoutPlaceholders = query.replace(/\{\{[^}]*\}\}/g, "").trim();
    if (!withoutPlaceholders) {
      return {
        success: false,
        error: "The search came out empty. Check the step's search text and its {{placeholders}}.",
      };
    }

    try {
      // Imported lazily: the engine also runs in tests with no database, and
      // this keeps the retrieval dependency out of every other node's path.
      const { retrieve, formatContext } = await import("@/lib/knowledge/retrieval");
      const { getOrCreatePersonalWorkspace } = await import("@/lib/workspaces/service");

      const workspaceId = await getOrCreatePersonalWorkspace(context.userId);

      const chunks = await retrieve({
        workspaceId,
        userId: context.userId,
        query,
        knowledgeBaseId: config.knowledgeBaseId || undefined,
        topK: config.topK ?? 5,
      });

      return {
        success: true,
        output: {
          found: chunks.length,
          query,
          context: formatContext(chunks),
          citations: chunks.map((chunk, i) => ({
            n: i + 1,
            document: chunk.documentTitle,
            section: chunk.heading ?? null,
            score: chunk.score,
          })),
          passages: chunks.map((chunk) => chunk.text),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Searching the documents failed",
      };
    }
  }

  validateConfig(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    const c = config as Partial<RetrievalNodeConfig>;

    if (!c.queryTemplate || typeof c.queryTemplate !== "string" || !c.queryTemplate.trim()) {
      errors.push("Say what to search for. It can use {{placeholders}} from earlier steps.");
    }
    if (c.topK !== undefined) {
      const n = Number(c.topK);
      if (!Number.isInteger(n) || n < 1 || n > 20) {
        errors.push("How many passages must be a whole number between 1 and 20.");
      }
    }

    return errors.length ? { valid: false, errors } : { valid: true };
  }
}
