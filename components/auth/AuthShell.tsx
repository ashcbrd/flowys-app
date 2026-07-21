"use client";

import * as React from "react";
import { Zap, ArrowLeft, Eye, EyeOff } from "lucide-react";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { getDomainUrl, navigateToLanding } from "@/lib/navigation";

/**
 * The frame around signing in and signing up.
 *
 * These two pages are the seam between the marketing site and the product. A
 * visitor arrives from a page set in Manrope at 800 weight over a wide radial
 * light, and anything that is merely close to it reads as a different company.
 * So the navbar, the light, the type scale and the entrance stagger here are
 * the landing site's, not the app's denser in-product versions.
 *
 * Both pages share this rather than each rendering their own, because the last
 * time they were separate they drifted: different logo sizes, different max
 * widths, different headline weights.
 */
export function AuthShell({
  eyebrow,
  title,
  subtitle,
  children,
  footer,
}: {
  eyebrow: string;
  /** Rendered as two lines: the second carries the muted slate colour. */
  title: React.ReactNode;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  // The marketing site is a different origin, so href="/" would land on the
  // app's own root instead of the home page the link promises. The real URL
  // goes in the href rather than only in a click handler, so middle-click and
  // open-in-new-tab work and the address the browser shows is not a lie.
  const homeUrl = getDomainUrl("landing");
  const goHome = (e: React.MouseEvent) => {
    e.preventDefault();
    navigateToLanding("/");
  };

  return (
    <div className="min-h-screen bg-background">
      <nav className="fixed left-0 right-0 top-0 z-50 border-b border-[var(--fy-line)] bg-white/70 backdrop-blur-xl dark:bg-[#0b1120]/70">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
          <a href={homeUrl} onClick={goHome} className="z-10 flex shrink-0 items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--fy-blue)] to-[var(--fy-blue-deep)]">
              <Zap className="h-4 w-4 text-white" />
            </div>
            <span className="fy-display-hero text-base text-[var(--fy-ink)]">Flowys</span>
          </a>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <a
              href={homeUrl}
              onClick={goHome}
              className="hidden items-center gap-1.5 rounded-full border border-[var(--fy-line)] px-3.5 py-2 text-[13px] font-semibold text-[var(--fy-ink)] transition-colors hover:bg-[var(--fy-mist)] sm:inline-flex"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to home
            </a>
          </div>
        </div>
      </nav>

      <section className="relative overflow-hidden px-6 pt-32 pb-20 sm:pt-36">
        <div className="fy-hero-light pointer-events-none absolute inset-0" />

        {/* The headline block breathes at the landing site's width; the card
            stays narrow, because a sign-in form wider than its content reads as
            an empty page with a form dropped on it. */}
        <div className="relative mx-auto w-full max-w-2xl text-center">
          <p
            className="fy-eyebrow-hero fy-rise text-[var(--fy-blue)]"
            style={{ animationDelay: "80ms" }}
          >
            {eyebrow}
          </p>

          <h1
            className="fy-display-hero fy-rise mt-6 text-[clamp(2.2rem,5.5vw,3.4rem)]"
            style={{ animationDelay: "160ms" }}
          >
            {title}
          </h1>

          <p
            className="fy-rise mx-auto mt-7 max-w-xl text-lg leading-relaxed text-[var(--fy-slate)]"
            style={{ animationDelay: "260ms" }}
          >
            {subtitle}
          </p>
        </div>

        <div className="relative mx-auto w-full max-w-md">
          <div
            className="fy-rise mt-12 rounded-2xl border border-[var(--fy-line)] bg-background/80 p-7 shadow-[0_1px_2px_rgba(11,17,32,0.04),0_12px_32px_-12px_rgba(11,17,32,0.12)] backdrop-blur-sm sm:p-8"
            style={{ animationDelay: "340ms" }}
          >
            {children}
          </div>

          {footer && (
            <div
              className="fy-rise mt-7 text-center text-[14px] text-[var(--fy-slate)]"
              style={{ animationDelay: "420ms" }}
            >
              {footer}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

/** A labelled field, at the landing site's control proportions. */
export function AuthField({
  id,
  label,
  hint,
  type,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  // A password field gets a show/hide toggle. Typing a password blind is the
  // one place a sign-in form makes people fail, and "was it a typo or is the
  // password wrong" is not a question a form should ask.
  const isPassword = type === "password";
  const [revealed, setRevealed] = React.useState(false);

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-[13px] font-semibold text-[var(--fy-ink)]">
        {label}
        {!props.required && (
          <span className="ml-1.5 font-normal text-[var(--fy-slate)]">optional</span>
        )}
      </label>
      <div className="relative">
        <input
          id={id}
          type={isPassword && revealed ? "text" : type}
          {...props}
          className={`h-11 w-full rounded-xl border border-[var(--fy-line)] bg-background px-3.5 text-[15px] text-[var(--fy-ink)] outline-none transition-colors placeholder:text-[var(--fy-slate)]/70 focus:border-[var(--fy-blue)] focus:ring-4 focus:ring-[var(--fy-blue)]/12 ${
            isPassword ? "pr-11" : ""
          }`}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setRevealed((r) => !r)}
            aria-label={revealed ? "Hide password" : "Show password"}
            className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-[var(--fy-slate)] transition-colors hover:bg-[var(--fy-mist)] hover:text-[var(--fy-ink)]"
          >
            {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>
      {hint && <p className="text-[12px] text-[var(--fy-slate)]">{hint}</p>}
    </div>
  );
}

/**
 * The primary action, matching the landing hero's button exactly: ink in light
 * mode, white in dark, and a half-pixel lift on hover.
 */
export function AuthSubmit({
  loading,
  loadingLabel,
  children,
}: {
  loading: boolean;
  loadingLabel: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="group inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--fy-ink)] text-[15px] font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-60 dark:bg-white dark:text-[#0b1120]"
    >
      {loading ? loadingLabel : children}
    </button>
  );
}
