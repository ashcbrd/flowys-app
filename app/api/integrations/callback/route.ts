import { NextResponse } from "next/server";
import { integrationRegistry } from "@/lib/integrations/registry";
import { createOAuth2Handler } from "@/lib/integrations/oauth";
import { connectToDatabase } from "@/lib/db";
import { Connection, encryptCredentials } from "@/lib/db/models/Connection";
import { v4 as uuid } from "uuid";

/**
 * GET /api/integrations/callback
 * OAuth2 callback handler
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    // Handle OAuth errors
    if (error) {
      const errorDescription = searchParams.get("error_description") || error;
      return NextResponse.redirect(
        new URL(`/integrations?error=${encodeURIComponent(errorDescription)}`, request.url)
      );
    }

    if (!code || !state) {
      return NextResponse.redirect(
        new URL("/integrations?error=Missing+code+or+state", request.url)
      );
    }

    // Verify state and get stored data
    // We need to determine the integration from state
    // For this, we'll iterate through handlers (not ideal but works for now)
    let oauthState = null;
    let integrationId = "";

    // Get all OAuth2 integrations
    const oauthIntegrations = integrationRegistry
      .getAll()
      .filter((i) => i.definition.config.authType === "oauth2");

    for (const integration of oauthIntegrations) {
      const handler = createOAuth2Handler(integration.definition.config.id);
      const verified = handler.verifyState(state);
      if (verified) {
        oauthState = verified;
        integrationId = verified.integrationId;
        break;
      }
    }

    if (!oauthState) {
      return NextResponse.redirect(
        new URL("/integrations?error=Invalid+or+expired+state", request.url)
      );
    }

    // Get the integration
    const integration = integrationRegistry.get(integrationId);
    if (!integration) {
      return NextResponse.redirect(
        new URL("/integrations?error=Integration+not+found", request.url)
      );
    }

    // Exchange code for tokens
    const oauth = createOAuth2Handler(integrationId);
    const credentials = await oauth.exchangeCode(
      integration.definition.config,
      code
    );

    // Validate credentials
    const validation = await integration.validateCredentials(credentials);
    if (!validation.valid) {
      return NextResponse.redirect(
        new URL(`/integrations?error=${encodeURIComponent(validation.error || "Validation failed")}`, request.url)
      );
    }

    // Store connection
    await connectToDatabase();
    const { encrypted, iv } = encryptCredentials(credentials);

    await Connection.create({
      _id: uuid(),
      integrationId,
      name: oauthState.connectionName,
      encryptedCredentials: encrypted,
      credentialsIv: iv,
      metadata: validation.metadata,
      enabled: true,
    });

    // Redirect back to the app
    const redirectUrl = oauthState.redirectUrl || "/integrations";
    return NextResponse.redirect(
      new URL(`${redirectUrl}?success=Connection+created`, request.url)
    );
  } catch (error) {
    console.error("OAuth callback error:", error);
    return NextResponse.redirect(
      new URL("/integrations?error=Authentication+failed", request.url)
    );
  }
}
