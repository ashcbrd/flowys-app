/**
 * API Presets
 *
 * Pre-filled configurations for the API step.
 *
 * The API step can already reach any service with a public endpoint — but it
 * asks for a URL, a method, headers, and a body, which is a developer's mental
 * model. A preset supplies all of that and leaves the user one thing to provide:
 * their own key or webhook URL.
 *
 * This is deliberately not an OAuth integration. Nothing is stored on our side,
 * no app registration is involved, and the request is an ordinary API call made
 * by `lib/nodes/api.ts`. That is why presets work today and app connections
 * don't.
 */

export interface PresetSecret {
  /** Which config field the user's value lands in. */
  target: "url" | "header" | "bodyField";
  /** Header name, or body field path, depending on `target`. */
  key?: string;
  label: string;
  help: string;
  placeholder: string;
  /** Wrap the value, e.g. `Bearer {{value}}`. */
  format?: string;
}

/**
 * A non-secret value the request also needs — a database id, a table name, a
 * from-address. Collected in the same dialog so the user never has to hunt for a
 * placeholder buried in a request body.
 */
export interface PresetField {
  /** Placeholder token in the preset config, e.g. YOUR_DATABASE_ID. */
  token: string;
  label: string
  help: string;
  placeholder: string;
}

export interface ApiPreset {
  id: string;
  name: string;
  /** What this preset does, in plain language. */
  description: string;
  category: string;
  /** Where the user finds the secret they need. */
  whereToGetIt: string;
  secret: PresetSecret;
  /** Additional non-secret values this request needs. */
  extraFields?: PresetField[];
  config: {
    url: string;
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    headers?: Record<string, string>;
    body?: string;
    responseMapping?: Record<string, string>;
  };
}

export const API_PRESETS: ApiPreset[] = [
  {
    id: "slack-message",
    name: "Send a Slack message",
    description: "Posts a message into a Slack channel you choose.",
    category: "Send a message",
    whereToGetIt:
      "In Slack: Settings → Manage apps → Incoming Webhooks → add one to a channel. Copy the URL it gives you.",
    secret: {
      target: "url",
      label: "Your Slack webhook URL",
      help: "It starts with https://hooks.slack.com/services/",
      placeholder: "https://hooks.slack.com/services/T000/B000/xxxx",
    },
    config: {
      url: "",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"text": "{{result}}"}',
    },
  },
  {
    id: "discord-message",
    name: "Send a Discord message",
    description: "Posts a message into a Discord channel.",
    category: "Send a message",
    whereToGetIt:
      "In Discord: Edit Channel → Integrations → Webhooks → New Webhook. Copy the URL.",
    secret: {
      target: "url",
      label: "Your Discord webhook URL",
      help: "It starts with https://discord.com/api/webhooks/",
      placeholder: "https://discord.com/api/webhooks/000/xxxx",
    },
    config: {
      url: "",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"content": "{{result}}"}',
    },
  },
  {
    id: "resend-email",
    name: "Send an email",
    description: "Sends an email through Resend.",
    category: "Send a message",
    whereToGetIt: "Sign up at resend.com, then API Keys → Create API Key.",
    secret: {
      target: "header",
      key: "Authorization",
      format: "Bearer {{value}}",
      label: "Your Resend API key",
      help: "It starts with re_",
      placeholder: "re_xxxxxxxx",
    },
    extraFields: [
      {
        token: "YOUR_FROM_ADDRESS",
        label: "Send from",
        help: "Must be an address on a domain you've verified with Resend.",
        placeholder: "you@yourdomain.com",
      },
      {
        token: "YOUR_TO_ADDRESS",
        label: "Send to",
        help: "Where the email should go.",
        placeholder: "them@example.com",
      },
    ],
    config: {
      url: "https://api.resend.com/emails",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"from": "YOUR_FROM_ADDRESS", "to": "YOUR_TO_ADDRESS", "subject": "From my workflow", "text": "{{result}}"}',
    },
  },
  {
    id: "notion-page",
    name: "Add a page to Notion",
    description: "Creates a page in a Notion database.",
    category: "Save it somewhere",
    whereToGetIt:
      "At notion.so/my-integrations create an integration, copy its secret, then share your database with it.",
    secret: {
      target: "header",
      key: "Authorization",
      format: "Bearer {{value}}",
      label: "Your Notion integration secret",
      help: "It starts with ntn_ or secret_",
      placeholder: "ntn_xxxxxxxx",
    },
    extraFields: [
      {
        token: "YOUR_DATABASE_ID",
        label: "Which database?",
        help: "Open the database in Notion — the id is the long code in the address bar, before the ?.",
        placeholder: "a1b2c3d4e5f6...",
      },
    ],
    config: {
      url: "https://api.notion.com/v1/pages",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28",
      },
      body: '{"parent": {"database_id": "YOUR_DATABASE_ID"}, "properties": {"Name": {"title": [{"text": {"content": "{{summary}}"}}]}}}',
    },
  },
  {
    id: "airtable-record",
    name: "Add a row to Airtable",
    description: "Creates a record in an Airtable table.",
    category: "Save it somewhere",
    whereToGetIt:
      "At airtable.com/create/tokens create a personal access token with data.records:write.",
    secret: {
      target: "header",
      key: "Authorization",
      format: "Bearer {{value}}",
      label: "Your Airtable token",
      help: "It starts with pat",
      placeholder: "patXXXXXXXX",
    },
    extraFields: [
      {
        token: "YOUR_BASE_ID",
        label: "Which base?",
        help: "Open your base — the id starts with app and is in the address bar.",
        placeholder: "appXXXXXXXX",
      },
      {
        token: "YOUR_TABLE_NAME",
        label: "Which table?",
        help: "The table name exactly as it appears in Airtable.",
        placeholder: "Feedback",
      },
    ],
    config: {
      url: "https://api.airtable.com/v0/YOUR_BASE_ID/YOUR_TABLE_NAME",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"fields": {"Notes": "{{summary}}"}}',
    },
  },
  {
    id: "google-sheets-append",
    name: "Add a row to Google Sheets",
    description: "Appends a row to a sheet via an Apps Script web app.",
    category: "Save it somewhere",
    whereToGetIt:
      "In your sheet: Extensions → Apps Script → publish as a web app that accepts POST, then copy the /exec URL.",
    secret: {
      target: "url",
      label: "Your Apps Script web app URL",
      help: "It ends with /exec",
      placeholder: "https://script.google.com/macros/s/xxxx/exec",
    },
    config: {
      url: "",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"row": ["{{summary}}"]}',
    },
  },
  {
    id: "generic-webhook",
    name: "Send to any web address",
    description: "Posts your result to any URL that accepts JSON.",
    category: "Something else",
    whereToGetIt: "Whatever address you want to send to.",
    secret: {
      target: "url",
      label: "The web address",
      help: "Anything that accepts a POST with JSON.",
      placeholder: "https://example.com/hook",
    },
    config: {
      url: "",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"result": "{{result}}"}',
    },
  },
  {
    id: "fetch-json",
    name: "Fetch data from a web address",
    description: "Reads JSON from a URL so later steps can use it.",
    category: "Something else",
    whereToGetIt: "The address of the data you want to read.",
    secret: {
      target: "url",
      label: "The web address to read",
      help: "It should return JSON.",
      placeholder: "https://api.example.com/items",
    },
    config: {
      url: "",
      method: "GET",
      responseMapping: { data: "data" },
    },
  },
];

/** Build an API-node config from a preset, the user's secret, and any extras. */
export function applyPreset(
  preset: ApiPreset,
  value: string,
  extras: Record<string, string> = {}
): Record<string, unknown> {
  const config: Record<string, unknown> = {
    url: preset.config.url,
    method: preset.config.method,
  };

  if (preset.config.headers) config.headers = { ...preset.config.headers };
  if (preset.config.body) config.body = preset.config.body;
  if (preset.config.responseMapping) {
    config.responseMapping = { ...preset.config.responseMapping };
  }

  const formatted = preset.secret.format
    ? preset.secret.format.replace("{{value}}", value)
    : value;

  switch (preset.secret.target) {
    case "url":
      config.url = value;
      break;
    case "header":
      if (preset.secret.key) {
        config.headers = {
          ...((config.headers as Record<string, string>) || {}),
          [preset.secret.key]: formatted,
        };
      }
      break;
    case "bodyField":
      // Presets that need the secret inside the body carry a {{secret}} marker.
      if (typeof config.body === "string") {
        config.body = config.body.replace("{{secret}}", formatted);
      }
      break;
  }

  // Replace placeholder tokens with what the user supplied, in the url and the
  // body alike. An unanswered token is left in place so it stays visible in the
  // step's settings rather than silently becoming an empty string.
  for (const field of preset.extraFields || []) {
    const supplied = extras[field.token]?.trim();
    if (!supplied) continue;

    if (typeof config.url === "string") {
      config.url = config.url.split(field.token).join(supplied);
    }
    if (typeof config.body === "string") {
      config.body = config.body.split(field.token).join(supplied);
    }
  }

  return config;
}

export function presetsByCategory(): [string, ApiPreset[]][] {
  const map = new Map<string, ApiPreset[]>();
  for (const preset of API_PRESETS) {
    const list = map.get(preset.category) || [];
    list.push(preset);
    map.set(preset.category, list);
  }
  return [...map.entries()];
}
