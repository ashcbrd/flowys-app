import DodoPayments from "dodopayments";

// Environment mode detection
export const IS_PRODUCTION = process.env.DODO_PAYMENTS_ENVIRONMENT === "live_mode";

/**
 * Get the appropriate API key based on environment mode
 */
function getApiKey(): string {
  if (IS_PRODUCTION) {
    const liveKey = process.env.DODO_PAYMENTS_API_KEY_LIVE;
    if (!liveKey) {
      throw new Error(
        "DODO_PAYMENTS_API_KEY_LIVE environment variable is not configured. " +
        "Please add it to your .env file for production payments."
      );
    }
    return liveKey;
  }

  const testKey = process.env.DODO_PAYMENTS_API_KEY_TEST;
  if (!testKey) {
    throw new Error(
      "DODO_PAYMENTS_API_KEY_TEST environment variable is not configured. " +
      "Please add it to your .env file for test payments."
    );
  }
  return testKey;
}

/**
 * Get the appropriate webhook secret based on environment mode
 */
export function getWebhookSecret(): string {
  if (IS_PRODUCTION) {
    const liveSecret = process.env.DODO_WEBHOOK_SECRET_LIVE;
    if (!liveSecret) {
      throw new Error(
        "DODO_WEBHOOK_SECRET_LIVE environment variable is not configured. " +
        "Please add it to your .env file for production webhooks."
      );
    }
    return liveSecret;
  }

  const testSecret = process.env.DODO_WEBHOOK_SECRET_TEST;
  if (!testSecret) {
    throw new Error(
      "DODO_WEBHOOK_SECRET_TEST environment variable is not configured. " +
      "Please add it to your .env file for test webhooks."
    );
  }
  return testSecret;
}

// Backwards compatibility export
export const DODO_WEBHOOK_SECRET = "";

// Lazy-initialized DodoPayments client singleton
let _dodoClient: DodoPayments | null = null;

/**
 * Get the DodoPayments client instance.
 * Uses lazy initialization to avoid build-time errors when env vars aren't set.
 * Automatically selects test or live mode based on DODO_PAYMENTS_ENVIRONMENT.
 */
export function getDodoClient(): DodoPayments {
  if (!_dodoClient) {
    _dodoClient = new DodoPayments({
      bearerToken: getApiKey(),
      environment: IS_PRODUCTION ? "live_mode" : "test_mode",
    });
  }
  return _dodoClient;
}

// For backwards compatibility - exports a getter that lazily creates the client
export const dodoClient = new Proxy({} as DodoPayments, {
  get(_, prop) {
    return getDodoClient()[prop as keyof DodoPayments];
  },
});

