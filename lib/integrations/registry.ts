import type { IntegrationDefinition, IntegrationCategory } from "./types";
import { BaseIntegration } from "./base";

// Import all integration providers
import { SlackIntegration } from "./providers/slack";
import { GoogleSheetsIntegration } from "./providers/google-sheets";
import { NotionIntegration } from "./providers/notion";
import { AirtableIntegration } from "./providers/airtable";
import { DiscordIntegration } from "./providers/discord";
import { GitHubIntegration } from "./providers/github";
import { OpenAIIntegration } from "./providers/openai";
import { SendGridIntegration } from "./providers/sendgrid";
import { TwilioIntegration } from "./providers/twilio";
import { StripeIntegration } from "./providers/stripe";

/**
 * Central registry for all available integrations
 */
class IntegrationRegistry {
  private integrations: Map<string, BaseIntegration> = new Map();

  constructor() {
    // Register all integrations
    this.register(new SlackIntegration());
    this.register(new GoogleSheetsIntegration());
    this.register(new NotionIntegration());
    this.register(new AirtableIntegration());
    this.register(new DiscordIntegration());
    this.register(new GitHubIntegration());
    this.register(new OpenAIIntegration());
    this.register(new SendGridIntegration());
    this.register(new TwilioIntegration());
    this.register(new StripeIntegration());
  }

  /**
   * Register an integration
   */
  register(integration: BaseIntegration): void {
    this.integrations.set(integration.definition.config.id, integration);
  }

  /**
   * Get an integration by ID
   */
  get(id: string): BaseIntegration | undefined {
    return this.integrations.get(id);
  }

  /**
   * Get all integrations
   */
  getAll(): BaseIntegration[] {
    return Array.from(this.integrations.values());
  }

  /**
   * Get all integration definitions (for API responses)
   */
  getAllDefinitions(): IntegrationDefinition[] {
    return this.getAll().map((i) => i.definition);
  }

  /**
   * Get integrations by category
   */
  getByCategory(category: IntegrationCategory): BaseIntegration[] {
    return this.getAll().filter(
      (i) => i.definition.config.category === category
    );
  }

  /**
   * Search integrations by name or description
   */
  search(query: string): BaseIntegration[] {
    const lowerQuery = query.toLowerCase();
    return this.getAll().filter(
      (i) =>
        i.definition.config.name.toLowerCase().includes(lowerQuery) ||
        i.definition.config.description.toLowerCase().includes(lowerQuery)
    );
  }
}

// Singleton instance
export const integrationRegistry = new IntegrationRegistry();

// Export helper to get integration
export function getIntegration(id: string): BaseIntegration | undefined {
  return integrationRegistry.get(id);
}
