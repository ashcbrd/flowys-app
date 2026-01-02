import { NextRequest } from "next/server";

/**
 * IP Address Utilities
 *
 * Provides secure IP extraction from request headers.
 * Handles proxy chains and validates IP formats.
 */

// Known trusted proxies (add your CDN/proxy IPs here)
const TRUSTED_PROXIES = new Set<string>([
  // Add Vercel, Cloudflare, or other CDN IPs if needed
  // For now, we trust the first IP in the chain
]);

/**
 * Validate IPv4 address format
 */
function isValidIPv4(ip: string): boolean {
  const parts = ip.split(".");
  if (parts.length !== 4) return false;

  return parts.every((part) => {
    const num = parseInt(part, 10);
    return !isNaN(num) && num >= 0 && num <= 255 && part === num.toString();
  });
}

/**
 * Validate IPv6 address format (simplified)
 */
function isValidIPv6(ip: string): boolean {
  // Basic IPv6 validation
  const parts = ip.split(":");
  if (parts.length < 3 || parts.length > 8) return false;

  // Allow :: notation
  const hasDoubleColon = ip.includes("::");
  if (hasDoubleColon && ip.split("::").length > 2) return false;

  return parts.every((part) => {
    if (part === "") return true; // Empty parts from ::
    return /^[0-9a-fA-F]{1,4}$/.test(part);
  });
}

/**
 * Validate IP address format
 */
export function isValidIP(ip: string): boolean {
  return isValidIPv4(ip) || isValidIPv6(ip);
}

/**
 * Clean and normalize IP address
 */
function normalizeIP(ip: string): string {
  // Remove port if present
  let normalized = ip.trim();

  // Handle IPv6 with brackets
  if (normalized.startsWith("[")) {
    const bracketEnd = normalized.indexOf("]");
    if (bracketEnd !== -1) {
      normalized = normalized.substring(1, bracketEnd);
    }
  }

  // Handle IPv4 with port
  if (normalized.includes(":") && !normalized.includes("::")) {
    const lastColon = normalized.lastIndexOf(":");
    const afterColon = normalized.substring(lastColon + 1);
    if (/^\d+$/.test(afterColon)) {
      normalized = normalized.substring(0, lastColon);
    }
  }

  // Handle IPv6-mapped IPv4 (::ffff:192.168.1.1)
  if (normalized.toLowerCase().startsWith("::ffff:")) {
    normalized = normalized.substring(7);
  }

  return normalized;
}

/**
 * Extract client IP address from request
 *
 * Priority:
 * 1. CF-Connecting-IP (Cloudflare)
 * 2. X-Real-IP (common proxy header)
 * 3. X-Forwarded-For (first untrusted IP)
 * 4. Request socket address
 *
 * @param request - NextRequest object
 * @param trustProxy - Whether to trust proxy headers (default: true)
 * @returns Client IP address or "unknown"
 */
export function getClientIP(request: NextRequest, trustProxy = true): string {
  if (!trustProxy) {
    // Don't trust any headers, use socket IP
    // Note: In serverless, this might not be available
    return "unknown";
  }

  // Cloudflare provides the real client IP
  const cfIP = request.headers.get("cf-connecting-ip");
  if (cfIP) {
    const normalized = normalizeIP(cfIP);
    if (isValidIP(normalized)) {
      return normalized;
    }
  }

  // X-Real-IP is set by nginx and other proxies
  const realIP = request.headers.get("x-real-ip");
  if (realIP) {
    const normalized = normalizeIP(realIP);
    if (isValidIP(normalized)) {
      return normalized;
    }
  }

  // X-Forwarded-For contains a chain of IPs
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    // Get the first IP that isn't a trusted proxy
    const ips = forwardedFor.split(",").map((ip) => normalizeIP(ip));

    for (const ip of ips) {
      if (isValidIP(ip) && !TRUSTED_PROXIES.has(ip)) {
        return ip;
      }
    }

    // If all IPs are trusted proxies, return the first one
    if (ips.length > 0 && isValidIP(ips[0])) {
      return ips[0];
    }
  }

  return "unknown";
}

/**
 * Hash an IP address for privacy-preserving logging
 */
export function hashIP(ip: string): string {
  // Simple hash for logging (not for security purposes)
  let hash = 0;
  for (let i = 0; i < ip.length; i++) {
    const char = ip.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

export default getClientIP;
