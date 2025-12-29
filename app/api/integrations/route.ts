import { NextResponse } from "next/server";
import { integrationRegistry } from "@/lib/integrations/registry";

/**
 * GET /api/integrations
 * List all available integrations
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const search = searchParams.get("search");

    let integrations = integrationRegistry.getAll();

    // Filter by category
    if (category) {
      integrations = integrations.filter(
        (i) => i.definition.config.category === category
      );
    }

    // Search by name/description
    if (search) {
      const query = search.toLowerCase();
      integrations = integrations.filter(
        (i) =>
          i.definition.config.name.toLowerCase().includes(query) ||
          i.definition.config.description.toLowerCase().includes(query)
      );
    }

    // Return definitions only (not the class instances)
    const definitions = integrations.map((i) => i.definition);

    return NextResponse.json({
      integrations: definitions,
      count: definitions.length,
    });
  } catch (error) {
    console.error("Error listing integrations:", error);
    return NextResponse.json(
      { error: "Failed to list integrations" },
      { status: 500 }
    );
  }
}
