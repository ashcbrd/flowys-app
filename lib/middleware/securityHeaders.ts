import { NextResponse } from "next/server";

/**
 * Security Headers Configuration
 *
 * Adds security headers to responses including CSP, HSTS, and other
 * security-related headers to protect against common web attacks.
 */

// Content Security Policy directives
const cspDirectives = {
  "default-src": ["'self'"],
  "script-src": [
    "'self'",
    "'unsafe-inline'", // Required for Next.js
    "'unsafe-eval'", // Required for Next.js dev mode - remove in strict mode
    "https://accounts.google.com", // Google OAuth
  ],
  "style-src": [
    "'self'",
    "'unsafe-inline'", // Required for Tailwind and inline styles
    "https://fonts.googleapis.com",
  ],
  "font-src": ["'self'", "https://fonts.gstatic.com", "data:"],
  "img-src": [
    "'self'",
    "data:",
    "blob:",
    "https:",
  ],
  "connect-src": [
    "'self'",
    "https://api.openai.com",
    "https://api.anthropic.com",
    "https://accounts.google.com",
    process.env.NEXT_PUBLIC_APP_URL || "",
    process.env.NEXT_PUBLIC_MARKETPLACE_URL || "",
    process.env.NEXT_PUBLIC_LANDING_URL || "",
  ].filter(Boolean),
  "frame-src": [
    "'self'",
    "https://accounts.google.com",
  ],
  "frame-ancestors": ["'self'"],
  "form-action": ["'self'"],
  "base-uri": ["'self'"],
  "object-src": ["'none'"],
  "upgrade-insecure-requests": [],
};

// Build CSP string
function buildCsp(): string {
  return Object.entries(cspDirectives)
    .map(([directive, values]) => {
      if (values.length === 0) {
        return directive;
      }
      return `${directive} ${values.join(" ")}`;
    })
    .join("; ");
}

/**
 * Add security headers to a response
 */
export function addSecurityHeaders(response: NextResponse): NextResponse {
  const headers = response.headers;

  // Content Security Policy
  headers.set("Content-Security-Policy", buildCsp());

  // Strict Transport Security (HSTS)
  // Only enable in production with HTTPS
  if (process.env.NODE_ENV === "production") {
    headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload"
    );
  }

  // Prevent clickjacking
  headers.set("X-Frame-Options", "SAMEORIGIN");

  // Prevent MIME type sniffing
  headers.set("X-Content-Type-Options", "nosniff");

  // XSS Protection (legacy, but still useful for older browsers)
  headers.set("X-XSS-Protection", "1; mode=block");

  // Referrer Policy
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // Permissions Policy (formerly Feature Policy)
  headers.set(
    "Permissions-Policy",
    "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()"
  );

  return response;
}

/**
 * Create a response with security headers
 */
export function secureResponse(
  body: unknown,
  init?: ResponseInit
): NextResponse {
  const response = NextResponse.json(body, init);
  return addSecurityHeaders(response);
}
