/**
 * SSRF protection, shared by everything in the app that fetches a URL a user
 * typed: the API step, and knowledge-base URL ingestion.
 *
 * This used to live inside the API node handler. It moved here the day a second
 * feature needed to fetch user-supplied URLs, because two copies of an SSRF
 * guard is how one of them quietly falls behind.
 *
 * Blocks requests to:
 * - Private IPv4 ranges (10.x, 172.16-31.x, 192.168.x)
 * - Loopback addresses (127.x, localhost)
 * - Link-local addresses (169.254.x, which includes cloud metadata endpoints)
 * - IPv6 private/loopback addresses
 */
export function isPrivateOrReservedHost(hostname: string): boolean {
  const blockedHostnames = [
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "::1",
    "::ffff:127.0.0.1",
    "metadata.google.internal",
    "metadata.goog",
    "169.254.169.254", // AWS/GCP/Azure metadata endpoint
  ];

  const lowerHostname = hostname.toLowerCase();
  if (blockedHostnames.includes(lowerHostname)) {
    return true;
  }

  if (lowerHostname.endsWith(".local") || lowerHostname.endsWith(".internal")) {
    return true;
  }

  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const match = hostname.match(ipv4Regex);

  if (match) {
    const [, a, b, c, d] = match.map(Number);

    if ([a, b, c, d].some((n) => n > 255)) {
      return true; // Invalid IP
    }

    if (a === 10) return true; // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 127) return true; // loopback
    if (a === 169 && b === 254) return true; // link-local + metadata
    if (a === 0) return true; // current network
    if (a >= 224 && a <= 239) return true; // multicast
    if (a >= 240) return true; // reserved
  }

  if (hostname.includes(":")) {
    const lowerIp = hostname.toLowerCase();
    if (lowerIp === "::1" || lowerIp.startsWith("::ffff:127.")) return true;
    if (lowerIp.startsWith("fe80:")) return true;
    if (lowerIp.startsWith("fc") || lowerIp.startsWith("fd")) return true;
  }

  return false;
}

/**
 * Parse and vet a user-supplied URL for outbound fetching.
 * Returns the parsed URL or an error message, never both.
 */
export function vetOutboundUrl(raw: string): { url?: URL; error?: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { error: "That is not a valid web address" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { error: "Only http and https addresses can be fetched" };
  }

  if (isPrivateOrReservedHost(url.hostname)) {
    return { error: "That address points inside a private network and cannot be fetched" };
  }

  return { url };
}
