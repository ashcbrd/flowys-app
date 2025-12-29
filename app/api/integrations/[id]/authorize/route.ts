import { NextResponse } from "next/server";
import { integrationRegistry } from "@/lib/integrations/registry";
import { createOAuth2Handler } from "@/lib/integrations/oauth";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/integrations/[id]/authorize
 * Start OAuth2 authorization flow
 */
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const integration = integrationRegistry.get(id);

    if (!integration) {
      return NextResponse.json(
        { error: "Integration not found" },
        { status: 404 }
      );
    }

    const config = integration.definition.config;

    if (config.authType !== "oauth2") {
      return NextResponse.json(
        { error: "Integration does not support OAuth2" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { connectionName, redirectUrl } = body;

    if (!connectionName) {
      return NextResponse.json(
        { error: "connectionName is required" },
        { status: 400 }
      );
    }

    const oauth = createOAuth2Handler(id);
    const { url, state } = oauth.getAuthorizationUrl(
      config,
      connectionName,
      redirectUrl || "/"
    );

    return NextResponse.json({ authorizationUrl: url, state });
  } catch (error) {
    console.error("Error starting OAuth flow:", error);
    return NextResponse.json(
      { error: "Failed to start authorization" },
      { status: 500 }
    );
  }
}
