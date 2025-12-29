import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase, ApiKey, hashApiKey, type ApiKeyScope } from "@/lib/db";
import crypto from "crypto";

export interface AuthenticatedRequest {
  apiKey: {
    id: string;
    name: string;
    scopes: ApiKeyScope[];
  };
}

export interface ApiAuthResult {
  success: boolean;
  error?: string;
  statusCode?: number;
  apiKey?: AuthenticatedRequest["apiKey"];
}

// In-memory rate limit store (use Redis in production)
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

/**
 * Authenticate an API request using API key
 */
export async function authenticateApiKey(
  request: NextRequest,
  requiredScopes: ApiKeyScope[] = []
): Promise<ApiAuthResult> {
  // Get API key from header
  const authHeader = request.headers.get("Authorization");
  const apiKeyHeader = request.headers.get("X-API-Key");

  let providedKey: string | null = null;

  if (authHeader?.startsWith("Bearer ")) {
    providedKey = authHeader.substring(7);
  } else if (apiKeyHeader) {
    providedKey = apiKeyHeader;
  }

  if (!providedKey) {
    return {
      success: false,
      error: "API key required. Provide via Authorization: Bearer <key> or X-API-Key header",
      statusCode: 401
    };
  }

  // Validate key format
  if (!providedKey.startsWith("ask_")) {
    return {
      success: false,
      error: "Invalid API key format",
      statusCode: 401
    };
  }

  await connectToDatabase();

  // Hash the provided key and look it up
  const keyHash = hashApiKey(providedKey);
  const apiKeyDoc = await ApiKey.findOne({ keyHash });

  if (!apiKeyDoc) {
    return {
      success: false,
      error: "Invalid API key",
      statusCode: 401
    };
  }

  // Check if key is enabled
  if (!apiKeyDoc.enabled) {
    return {
      success: false,
      error: "API key is disabled",
      statusCode: 403
    };
  }

  // Check expiration
  if (apiKeyDoc.expiresAt && apiKeyDoc.expiresAt < new Date()) {
    return {
      success: false,
      error: "API key has expired",
      statusCode: 403
    };
  }

  // Check IP restrictions
  const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0] ||
                   request.headers.get("x-real-ip") ||
                   "unknown";

  if (apiKeyDoc.allowedIps && apiKeyDoc.allowedIps.length > 0) {
    if (!apiKeyDoc.allowedIps.includes(clientIp)) {
      return {
        success: false,
        error: "IP address not allowed",
        statusCode: 403
      };
    }
  }

  // Check origin restrictions
  const origin = request.headers.get("origin");
  if (apiKeyDoc.allowedOrigins && apiKeyDoc.allowedOrigins.length > 0 && origin) {
    if (!apiKeyDoc.allowedOrigins.includes(origin)) {
      return {
        success: false,
        error: "Origin not allowed",
        statusCode: 403
      };
    }
  }

  // Check rate limit
  const rateLimitKey = `ratelimit:${apiKeyDoc._id}`;
  const now = Date.now();
  const windowMs = apiKeyDoc.rateLimitWindow * 1000;

  let rateData = rateLimitStore.get(rateLimitKey);
  if (!rateData || now > rateData.resetAt) {
    rateData = { count: 0, resetAt: now + windowMs };
  }

  rateData.count++;
  rateLimitStore.set(rateLimitKey, rateData);

  if (rateData.count > apiKeyDoc.rateLimit) {
    return {
      success: false,
      error: `Rate limit exceeded. Limit: ${apiKeyDoc.rateLimit} requests per ${apiKeyDoc.rateLimitWindow} seconds`,
      statusCode: 429
    };
  }

  // Check scopes
  const hasFullAccess = apiKeyDoc.scopes.includes("full_access");
  if (!hasFullAccess && requiredScopes.length > 0) {
    const hasRequiredScopes = requiredScopes.every(scope =>
      apiKeyDoc.scopes.includes(scope)
    );

    if (!hasRequiredScopes) {
      return {
        success: false,
        error: `Insufficient permissions. Required scopes: ${requiredScopes.join(", ")}`,
        statusCode: 403
      };
    }
  }

  // Update usage stats
  await ApiKey.updateOne(
    { _id: apiKeyDoc._id },
    {
      $set: { lastUsedAt: new Date() },
      $inc: { usageCount: 1 }
    }
  );

  return {
    success: true,
    apiKey: {
      id: apiKeyDoc._id.toString(),
      name: apiKeyDoc.name,
      scopes: apiKeyDoc.scopes
    }
  };
}

/**
 * Verify webhook signature (HMAC-SHA256)
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  const providedSignature = signature.startsWith("sha256=")
    ? signature.substring(7)
    : signature;

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(providedSignature)
    );
  } catch {
    return false;
  }
}

/**
 * Generate webhook signature for outgoing requests
 */
export function generateWebhookSignature(
  payload: string,
  secret: string
): string {
  return "sha256=" + crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");
}

/**
 * Create error response with proper headers
 */
export function createApiErrorResponse(
  error: string,
  statusCode: number,
  rateLimit?: { limit: number; remaining: number; reset: number }
): NextResponse {
  const response = NextResponse.json(
    {
      error: {
        message: error,
        code: statusCode
      }
    },
    { status: statusCode }
  );

  if (rateLimit) {
    response.headers.set("X-RateLimit-Limit", rateLimit.limit.toString());
    response.headers.set("X-RateLimit-Remaining", rateLimit.remaining.toString());
    response.headers.set("X-RateLimit-Reset", rateLimit.reset.toString());
  }

  return response;
}
