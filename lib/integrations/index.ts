/**
 * Flowys Integration Framework
 *
 * A comprehensive framework for connecting third-party services
 * to the Flowys workflow automation platform.
 */

// Core exports
export * from "./types";
export * from "./base";
export * from "./registry";
export * from "./oauth";

// Re-export individual integrations for direct access if needed
export { SlackIntegration } from "./providers/slack";
export { GoogleSheetsIntegration } from "./providers/google-sheets";
export { NotionIntegration } from "./providers/notion";
export { AirtableIntegration } from "./providers/airtable";
export { DiscordIntegration } from "./providers/discord";
export { GitHubIntegration } from "./providers/github";
export { OpenAIIntegration } from "./providers/openai";
export { SendGridIntegration } from "./providers/sendgrid";
export { TwilioIntegration } from "./providers/twilio";
export { StripeIntegration } from "./providers/stripe";
