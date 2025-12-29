import type { NodeHandler, NodeContext, NodeResult, IntegrationNodeConfig } from "./types";
import { connectToDatabase } from "@/lib/db";
import { Connection, decryptCredentials } from "@/lib/db/models/Connection";
import { integrationRegistry } from "@/lib/integrations/registry";
import type { ConnectionData } from "@/lib/integrations/types";

export class IntegrationNodeHandler implements NodeHandler {
  type = "integration" as const;

  async execute(context: NodeContext): Promise<NodeResult> {
    const config = context.config as unknown as IntegrationNodeConfig;

    if (!config.connectionId) {
      return { success: false, error: "Connection ID is required" };
    }

    if (!config.actionId) {
      return { success: false, error: "Action ID is required" };
    }

    try {
      await connectToDatabase();

      // Get the connection
      const connection = await Connection.findById(config.connectionId);
      if (!connection) {
        return { success: false, error: `Connection not found: ${config.connectionId}` };
      }

      if (!connection.enabled) {
        return { success: false, error: "Connection is disabled" };
      }

      // Get the integration
      const integration = integrationRegistry.get(connection.integrationId);
      if (!integration) {
        return { success: false, error: `Integration not found: ${connection.integrationId}` };
      }

      // Verify action exists
      const action = integration.definition.actions.find((a) => a.id === config.actionId);
      if (!action) {
        return { success: false, error: `Action not found: ${config.actionId}` };
      }

      // Decrypt credentials
      const credentials = decryptCredentials(
        connection.encryptedCredentials,
        connection.credentialsIv
      );

      // Build connection data
      const connectionData: ConnectionData = {
        id: connection._id,
        integrationId: connection.integrationId,
        name: connection.name,
        credentials,
        metadata: connection.metadata,
        enabled: connection.enabled,
        lastUsedAt: connection.lastUsedAt,
        createdAt: connection.createdAt,
        updatedAt: connection.updatedAt,
      };

      // Merge static config input with dynamic inputs from workflow
      const actionInput = {
        ...config.input,
        ...context.inputs,
      };

      // Execute the action
      const result = await integration.executeAction(config.actionId, {
        connection: connectionData,
        input: actionInput,
      });

      // Update last used timestamp
      connection.lastUsedAt = new Date();
      await connection.save();

      if (result.success) {
        return {
          success: true,
          output: result.output,
        };
      }

      return {
        success: false,
        error: result.error || "Integration action failed",
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Integration execution failed",
      };
    }
  }

  validateConfig(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    // Integration config can be empty during save (will be validated at execution time)
    // Only validate types, not required values
    const errors: string[] = [];

    if (config.connectionId !== undefined && typeof config.connectionId !== "string") {
      errors.push("Connection ID must be a string");
    }

    if (config.integrationId !== undefined && typeof config.integrationId !== "string") {
      errors.push("Integration ID must be a string");
    }

    if (config.actionId !== undefined && typeof config.actionId !== "string") {
      errors.push("Action ID must be a string");
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }
}
