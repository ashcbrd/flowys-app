"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Zap } from "lucide-react";
import { ThemeToggle } from "@/components/ui/theme-toggle";

interface AppCard {
  id: string;
  slug: string;
  title: string;
  description?: string;
  icon?: string;
  color?: string;
  category?: string;
  status: string;
}

export default function AppsPortalPage() {
  const [apps, setApps] = useState<AppCard[] | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetch("/api/apps")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setApps(Array.isArray(data) ? data : []))
      .catch(() => setApps([]));
  }, []);

  const filtered =
    apps?.filter(
      (a) =>
        a.title.toLowerCase().includes(query.toLowerCase()) ||
        (a.description || "").toLowerCase().includes(query.toLowerCase())
    ) ?? [];

  return (
    <div className="relative min-h-screen bg-background">
      <div className="fy-light pointer-events-none absolute inset-0" />
      <nav className="fixed left-0 right-0 top-0 z-50 border-b border-border bg-background/80 backdrop-blur-lg">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/workflow" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-blue-700">
              <Zap className="h-5 w-5 text-white" />
            </div>
            <span className="text-lg font-bold text-foreground">Flowys</span>
          </Link>
          <ThemeToggle />
        </div>
      </nav>

      <section className="relative mx-auto max-w-5xl px-6 pb-20 pt-28">
        <div className="mb-8">
          <p className="fy-eyebrow text-primary">Your team</p>
          <h1 className="fy-display mt-1 text-4xl text-foreground">Apps</h1>
          <p className="mt-2 text-muted-foreground">
            Tools your team built from workflows. Open one and run it — no building required.
          </p>
        </div>

        {apps && apps.length > 0 && (
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search apps"
            className="mb-8 h-11 w-full max-w-sm rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        )}

        {apps === null ? (
          <div className="flex items-center py-24 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…
          </div>
        ) : apps.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/50 p-12 text-center">
            <p className="text-lg font-medium text-foreground">No apps yet</p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
              Open a workflow and choose “Publish as app” to turn it into a tool your team can use.
            </p>
            <Link
              href="/workflow"
              className="fy-pill mt-6 inline-flex h-11 items-center justify-center bg-primary px-6 text-sm font-semibold text-primary-foreground"
            >
              Go to workflows
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((a) => {
              const accent = a.color || "#0a6cff";
              return (
                <Link
                  key={a.id}
                  href={`/apps/${a.id}`}
                  className="group rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div
                    className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl text-xl"
                    style={{ background: `${accent}1a`, color: accent }}
                    aria-hidden
                  >
                    {a.icon || "✦"}
                  </div>
                  <p className="font-semibold text-foreground group-hover:text-primary">
                    {a.title}
                  </p>
                  {a.description && (
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {a.description}
                    </p>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
