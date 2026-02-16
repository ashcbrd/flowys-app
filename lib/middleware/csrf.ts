import { NextRequest, NextResponse } from "next/server";

/**
 * CSRF Protection Middleware
 *
 * Validates Origin/Referer headers against allowed domains to prevent
 * cross-site request forgery attacks on state-changing operations.
 */

// Get allowed origins from environment or use defaults
function getAllowedOrigins(): string[] {
  const origins: string[] = [];

  // Add app URLs
  if (process.env.NEXT_PUBLIC_APP_URL) {
    origins.push(new URL(process.env.NEXT_PUBLIC_APP_URL).origin);
  }
  if (process.env.NEXT_PUBLIC_LANDING_URL) {
    origins.push(new URL(process.env.NEXT_PUBLIC_LANDING_URL).origin);
  }

  // Development origins
  if (process.env.NODE_ENV === "development") {
    origins.push("http://localhost:3000");
    origins.push("http://localhost:3001");
    origins.push("http://127.0.0.1:3000");
    origins.push("http://127.0.0.1:3001");
  }

  return origins;
}

/**
 * Validate that the request origin is allowed
 * Returns null if valid, or an error response if invalid
 */
export function validateCsrf(request: NextRequest): NextResponse | null {
  const method = request.method.toUpperCase();

  // Only check state-changing methods
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    return null;
  }

  // Skip CSRF check for API key authenticated requests (external API calls)
  const hasApiKey =
    request.headers.get("Authorization")?.startsWith("Bearer ask_") ||
    request.headers.get("X-API-Key")?.startsWith("ask_");

  if (hasApiKey) {
    return null;
  }

  // Skip CSRF check for webhook endpoints (they have signature verification)
  const pathname = request.nextUrl.pathname;
  if (pathname.includes("/webhooks/")) {
    return null;
  }

  // Get origin from headers
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");

  // If no origin header (same-origin request in some browsers), check referer
  let requestOrigin = origin;
  if (!requestOrigin && referer) {
    try {
      requestOrigin = new URL(referer).origin;
    } catch {
      // Invalid referer URL
    }
  }

  // For same-origin requests from browsers, origin might be null
  // In this case, we allow the request if there's a valid session cookie
  if (!requestOrigin) {
    // Check if this looks like a browser request with cookies
    const hasCookies = request.headers.get("cookie");
    if (hasCookies) {
      // Allow same-origin requests with cookies (browser behavior)
      return null;
    }
    // No origin and no cookies - block
    return NextResponse.json(
      { error: "Missing origin header" },
      { status: 403 }
    );
  }

  // Validate origin against allowed list
  const allowedOrigins = getAllowedOrigins();

  if (!allowedOrigins.includes(requestOrigin)) {
    console.warn(`CSRF: Blocked request from origin: ${requestOrigin}`);
    return NextResponse.json(
      { error: "Invalid origin" },
      { status: 403 }
    );
  }

  return null;
}

/**
 * CSRF validation for use in API routes
 * Call at the start of POST/PUT/PATCH/DELETE handlers
 */
export function csrfCheck(request: NextRequest): { valid: boolean; error?: NextResponse } {
  const csrfError = validateCsrf(request);
  if (csrfError) {
    return { valid: false, error: csrfError };
  }
  return { valid: true };
}
