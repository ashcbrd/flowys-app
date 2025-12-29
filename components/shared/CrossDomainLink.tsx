"use client";

import { ReactNode, useCallback } from "react";
import { navigateToDomain, buildDomainUrl } from "@/lib/navigation";

type DomainKey = "landing" | "app" | "marketplace";

interface CrossDomainLinkProps {
  /**
   * Target domain
   */
  domain: DomainKey;
  /**
   * Path within the domain (e.g., "/workflow/123")
   */
  href: string;
  /**
   * Link content
   */
  children: ReactNode;
  /**
   * Additional CSS classes
   */
  className?: string;
  /**
   * Title attribute for accessibility
   */
  title?: string;
}

/**
 * Cross-domain link component with smart tab management
 *
 * - Automatically uses correct URL for dev/prod environments
 * - Reuses existing tabs for the same domain instead of opening duplicates
 * - Provides native link behavior (right-click, cmd+click, etc.)
 */
export function CrossDomainLink({
  domain,
  href,
  children,
  className,
  title,
}: CrossDomainLinkProps) {
  const fullUrl = buildDomainUrl(domain, href);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      // Allow default behavior for modifier keys (cmd+click, ctrl+click, etc.)
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }

      e.preventDefault();
      navigateToDomain(domain, href);
    },
    [domain, href]
  );

  return (
    <a
      href={fullUrl}
      onClick={handleClick}
      className={className}
      title={title}
      // These attributes help with SEO and accessibility while still
      // allowing our custom navigation logic
      rel="noopener"
    >
      {children}
    </a>
  );
}

/**
 * Pre-configured link to the workflow app
 */
export function AppLink({
  href,
  children,
  className,
  title,
}: Omit<CrossDomainLinkProps, "domain">) {
  return (
    <CrossDomainLink domain="app" href={href} className={className} title={title}>
      {children}
    </CrossDomainLink>
  );
}

/**
 * Pre-configured link to the marketplace
 */
export function MarketplaceLink({
  href,
  children,
  className,
  title,
}: Omit<CrossDomainLinkProps, "domain">) {
  return (
    <CrossDomainLink domain="marketplace" href={href} className={className} title={title}>
      {children}
    </CrossDomainLink>
  );
}

/**
 * Pre-configured link to the landing page
 */
export function LandingLink({
  href,
  children,
  className,
  title,
}: Omit<CrossDomainLinkProps, "domain">) {
  return (
    <CrossDomainLink domain="landing" href={href} className={className} title={title}>
      {children}
    </CrossDomainLink>
  );
}
