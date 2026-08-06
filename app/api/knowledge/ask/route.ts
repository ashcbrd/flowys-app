import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-helpers";
import { getOrCreatePersonalWorkspace } from "@/lib/workspaces/service";
import { retrieve, formatContext } from "@/lib/knowledge/retrieval";
import { executePrompt } from "@/lib/providers";
import { FIXED_PROVIDER, FIXED_MODEL } from "@/lib/providers/models";

/**
 * Answer a question from the caller's own documents.
 *
 * Two rules the prompt enforces, because both failures are worse than saying
 * nothing: answer only from the passages provided, and cite the passage each
 * claim came from. An assistant that answers a policy question from its own
 * training data instead of the company handbook is confidently wrong in the
 * one situation where being wrong costs the most.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const question = typeof body?.question === "string" ? body.question.trim() : "";
    if (!question) {
      return NextResponse.json({ error: "Ask a question first" }, { status: 400 });
    }

    const workspaceId = await getOrCreatePersonalWorkspace(user.id);

    const chunks = await retrieve({
      workspaceId,
      userId: user.id,
      query: question,
      knowledgeBaseId:
        typeof body?.knowledgeBaseId === "string" ? body.knowledgeBaseId : undefined,
      topK: 5,
    });

    if (chunks.length === 0) {
      return NextResponse.json({
        answer: "I could not find anything about that in your documents.",
        citations: [],
      });
    }

    const response = await executePrompt(
      FIXED_PROVIDER,
      { model: FIXED_MODEL, temperature: 0 },
      [
        {
          role: "system",
          content: [
            "You answer questions using only the passages provided.",
            "If the passages do not contain the answer, say so plainly and stop. Do not fill the gap from general knowledge.",
            "Cite the passage each claim comes from as [1], [2] and so on, matching the numbers given.",
            "Be brief. Two or three sentences unless the question genuinely needs more.",
          ].join(" "),
        },
        {
          role: "user",
          content: `Passages:\n\n${formatContext(chunks)}\n\nQuestion: ${question}`,
        },
      ]
    );

    // executePrompt auto-parses JSON-looking replies, and models sometimes wrap
    // an answer as {"response": "..."} unprompted. Unwrap the usual key names
    // before falling back to raw JSON, or the user reads braces.
    const record = response as Record<string, unknown>;
    const answer =
      typeof response === "string"
        ? response
        : [record?.content, record?.response, record?.text, record?.answer].find(
            (v): v is string => typeof v === "string"
          ) ?? JSON.stringify(response);

    return NextResponse.json({
      answer,
      citations: chunks.map((chunk, i) => ({
        n: i + 1,
        documentId: chunk.documentId,
        documentTitle: chunk.documentTitle,
        heading: chunk.heading,
        ord: chunk.ord,
        score: chunk.score,
        excerpt: chunk.text.length > 320 ? `${chunk.text.slice(0, 320)}...` : chunk.text,
      })),
    });
  } catch (error) {
    console.error("Error answering question:", error);
    const message = error instanceof Error ? error.message : "Failed to answer";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
