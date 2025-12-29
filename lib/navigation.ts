/**
 * Cross-domain navigation utility
 *
 * Handles:
 * 1. Environment-aware URLs (localhost in dev, live domains in production)
 * 2. Smart tab management (reuses existing tabs for the same domain)
 */

// Domain configuration from environment variables
const DOMAINS = {
  landing: {
    dev: process.env.NEXT_PUBLIC_LANDING_URL_DEV || "http://localhost:3000",
    prod: process.env.NEXT_PUBLIC_LANDING_URL || "https://flowys.io",
  },
  app: {
    dev: process.env.NEXT_PUBLIC_APP_URL_DEV || "http://localhost:3001",
    prod: process.env.NEXT_PUBLIC_APP_URL || "https://app.flowys.io",
  },
  marketplace: {
    dev: process.env.NEXT_PUBLIC_MARKETPLACE_URL_DEV || "http://localhost:3002",
    prod: process.env.NEXT_PUBLIC_MARKETPLACE_URL || "https://marketplace.flowys.io",
  },
} as const;

type DomainKey = "landing" | "app" | "marketplace";

// Window names for tab reuse
const WINDOW_NAMES: Record<DomainKey, string> = {
  landing: "flowys_landing",
  app: "flowys_app",
  marketplace: "flowys_marketplace",
};

/**
 * Check if we're in development mode
 */
function isDev(): boolean {
  // Check for localhost or common dev indicators
  if (typeof window === "undefined") {
    return process.env.NODE_ENV === "development";
  }
  return (
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname.includes(".local")
  );
}

/**
 * Get the base URL for a domain
 */
export function getDomainUrl(domain: DomainKey): string {
  const env = isDev() ? "dev" : "prod";
  return DOMAINS[domain][env];
}

/**
 * Get all domain URLs (useful for components that need multiple)
 */
export function getAllDomainUrls() {
  return {
    landing: getDomainUrl("landing"),
    app: getDomainUrl("app"),
    marketplace: getDomainUrl("marketplace"),
  };
}

/**
 * Detect which domain a URL belongs to
 */
function detectDomain(url: string): DomainKey | null {
  const urlLower = url.toLowerCase();

  // Check against configured domains (check app and marketplace first as they're subdomains)
  if (urlLower.includes(DOMAINS.app.dev) || urlLower.includes(DOMAINS.app.prod)) {
    return "app";
  }
  if (urlLower.includes(DOMAINS.marketplace.dev) || urlLower.includes(DOMAINS.marketplace.prod)) {
    return "marketplace";
  }
  if (urlLower.includes(DOMAINS.landing.dev) || urlLower.includes(DOMAINS.landing.prod)) {
    return "landing";
  }

  return null;
}

/**
 * Navigate to a cross-domain URL with smart tab management
 *
 * - If the target domain's tab is already open, it will navigate there
 * - If not, it opens a new tab with a named window
 * - Subsequent navigations to the same domain reuse the same tab
 */
export function navigateToDomain(
  domain: DomainKey,
  path: string = "/",
  options: { newTab?: boolean } = {}
): void {
  const baseUrl = getDomainUrl(domain);
  const fullUrl = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;

  // If same domain, use regular navigation
  if (typeof window !== "undefined") {
    const currentDomain = detectDomain(window.location.href);
    if (currentDomain === domain) {
      window.location.href = fullUrl;
      return;
    }
  }

  // Cross-domain navigation with tab reuse
  const windowName = WINDOW_NAMES[domain];

  // Try to reuse existing window/tab
  const existingWindow = window.open("", windowName);

  if (existingWindow && !existingWindow.closed) {
    // Window exists, navigate it to the new URL
    existingWindow.location.href = fullUrl;
    existingWindow.focus();
  } else {
    // No existing window, open new one with the name
    window.open(fullUrl, windowName);
  }
}

/**
 * Navigate to the workflow app
 */
export function navigateToApp(path: string = "/"): void {
  navigateToDomain("app", path);
}

/**
 * Navigate to the marketplace
 */
export function navigateToMarketplace(path: string = "/"): void {
  navigateToDomain("marketplace", path);
}

/**
 * Navigate to the landing page
 */
export function navigateToLanding(path: string = "/"): void {
  navigateToDomain("landing", path);
}

/**
 * Build a URL for a domain (for use in href attributes)
 * Use this when you need the URL but will handle navigation yourself
 */
export function buildDomainUrl(domain: DomainKey, path: string = "/"): string {
  const baseUrl = getDomainUrl(domain);
  return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * React hook-friendly navigation handlers
 * Returns onClick handlers that use smart tab management
 */
export function createDomainNavigator(domain: DomainKey) {
  return {
    navigate: (path: string = "/") => navigateToDomain(domain, path),
    buildUrl: (path: string = "/") => buildDomainUrl(domain, path),
    onClick: (path: string = "/") => (e: React.MouseEvent) => {
      e.preventDefault();
      navigateToDomain(domain, path);
    },
  };
}
