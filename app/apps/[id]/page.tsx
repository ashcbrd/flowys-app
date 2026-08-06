"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Play, RotateCcw, Sparkles, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { ResultView } from "@/components/shared/ResultView";

interface AppFormField {
  name: string;
  label: string;
  type: "string" | "number" | "boolean" | "json";
  required: boolean;
  placeholder?: string;
  description?: string;
  multiline?: boolean;
  default?: unknown;
}

interface AppData {
  id: string;
  title: string;
  description?: string;
  icon?: string;
  color?: string;
  published: boolean;
  fields: AppFormField[];
}

interface RunStep {
  nodeName: string;
  status: string;
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function AppRunPage({ params }: PageProps) {
  const { id } = use(params);

  const [app, setApp] = useState<AppData | null>(null);
  const [loadError, setLoadError] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});

  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState("");
  const [output, setOutput] = useState<unknown>(undefined);
  const [steps, setSteps] = useState<RunStep[]>([]);
  const [revealed, setRevealed] = useState(0);

  useEffect(() => {
    let active = true;
    (async () => {
      const res = await fetch(`/api/apps/${id}`);
      if (!active) return;
      if (!res.ok) {
        setLoadError(
          res.status === 404
            ? "This app isn't available to you."
            : "Something went wrong loading this app."
        );
        return;
      }
      const data: AppData = await res.json();
      setApp(data);
      const initial: Record<string, string> = {};
      for (const f of data.fields) {
        if (f.default !== undefined && f.default !== null) initial[f.name] = String(f.default);
      }
      setValues(initial);
    })();
    return () => {
      active = false;
    };
  }, [id]);

  // Reveal the step trail one at a time, for a "watch it run" feel.
  useEffect(() => {
    if (revealed >= steps.length) return;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Scheduled rather than set in the effect body. Someone who asked for
    // reduced motion still wants every step, just without the stagger, and a
    // synchronous setState here cascades an extra render on each reveal.
    const t = setTimeout(
      () => setRevealed((n) => (reduce ? steps.length : n + 1)),
      reduce ? 0 : 260
    );
    return () => clearTimeout(t);
  }, [revealed, steps]);

  const accent = app?.color || "#0a6cff";
  const requiredMissing = useMemo(() => {
    if (!app) return false;
    return app.fields.some((f) => f.required && !values[f.name]?.trim());
  }, [app, values]);

  const run = async (e: React.FormEvent) => {
    e.preventDefault();
    setRunning(true);
    setRunError("");
    setOutput(undefined);
    setSteps([]);
    setRevealed(0);

    const input: Record<string, unknown> = {};
    for (const f of app!.fields) {
      const raw = values[f.name];
      if (raw === undefined || raw === "") continue;
      input[f.name] =
        f.type === "number" ? Number(raw) : f.type === "boolean" ? raw === "true" : raw;
    }

    const res = await fetch(`/api/apps/${id}/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input }),
    });
    const data = await res.json().catch(() => null);
    setRunning(false);

    if (!res.ok) {
      setRunError(data?.error || "The run couldn't be completed. Please try again.");
      return;
    }
    setSteps(Array.isArray(data?.steps) ? data.steps : []);
    setOutput(data?.output);
  };

  if (loadError) {
    return (
      <Shell>
        <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-xl">
          <p className="text-lg font-medium text-foreground">{loadError}</p>
          <Link href="/apps" className="mt-4 inline-block text-sm text-primary hover:underline">
            Back to apps
          </Link>
        </div>
      </Shell>
    );
  }

  if (!app) {
    return (
      <Shell>
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="mx-auto max-w-2xl">
        <Link
          href="/apps"
          className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> All apps
        </Link>

        {/* Branded header */}
        <div className="mb-8 flex items-start gap-4">
          <div
            className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl text-2xl shadow-sm"
            style={{ background: `${accent}1a`, color: accent }}
            aria-hidden
          >
            {app.icon || "✦"}
          </div>
          <div>
            <h1 className="fy-display text-3xl text-foreground">{app.title}</h1>
            {app.description && (
              <p className="mt-1 text-muted-foreground">{app.description}</p>
            )}
          </div>
        </div>

        {!app.published ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-center text-muted-foreground shadow-xl">
            This app hasn&apos;t been published yet.
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card p-6 shadow-xl sm:p-8">
            <form className="space-y-5" onSubmit={run}>
              {app.fields.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  This app takes no input — just run it.
                </p>
              )}
              {app.fields.map((f) => (
                <div key={f.name} className="space-y-2">
                  <label htmlFor={f.name} className="text-sm font-medium text-foreground">
                    {f.label}
                    {f.required && <span className="ml-1 text-primary">*</span>}
                  </label>
                  {f.description && (
                    <p className="text-xs text-muted-foreground">{f.description}</p>
                  )}
                  {f.type === "boolean" ? (
                    <select
                      id={f.name}
                      value={values[f.name] ?? "false"}
                      onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                      className="h-11 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="true">Yes</option>
                      <option value="false">No</option>
                    </select>
                  ) : f.multiline ? (
                    <textarea
                      id={f.name}
                      value={values[f.name] ?? ""}
                      onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                      placeholder={f.placeholder}
                      rows={5}
                      className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                    />
                  ) : (
                    <input
                      id={f.name}
                      type={f.type === "number" ? "number" : "text"}
                      value={values[f.name] ?? ""}
                      onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                      placeholder={f.placeholder}
                      className="h-11 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                    />
                  )}
                </div>
              ))}

              {runError && (
                <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                  {runError}
                </p>
              )}

              <Button
                type="submit"
                disabled={running || requiredMissing}
                className="fy-pill h-11 w-full text-base font-semibold"
              >
                {running ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Running…
                  </>
                ) : output !== undefined ? (
                  <>
                    <RotateCcw className="mr-2 h-4 w-4" /> Run again
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-4 w-4" /> Run
                  </>
                )}
              </Button>
            </form>

            {/* The run trail + result */}
            {(steps.length > 0 || output !== undefined) && (
              <div className="mt-8">
                <hr className="fy-hairline mb-6" />
                {steps.length > 0 && (
                  <ol className="mb-6 space-y-2">
                    {steps.map((s, i) => (
                      <li
                        key={i}
                        className={`flex items-center gap-3 text-sm transition-opacity duration-500 ${
                          i < revealed ? "opacity-100" : "opacity-0"
                        }`}
                      >
                        <span
                          className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                          style={{
                            background:
                              s.status === "completed" || s.status === "success"
                                ? "linear-gradient(100deg,#0a6cff,#5ccdff)"
                                : "hsl(var(--border))",
                          }}
                        />
                        <span className="text-foreground">{s.nodeName}</span>
                      </li>
                    ))}
                  </ol>
                )}
                {output !== undefined && (
                  <div>
                    <p className="fy-eyebrow mb-3 flex items-center gap-1.5 text-primary">
                      <Sparkles className="h-3.5 w-3.5" /> Result
                    </p>
                    <ResultView value={output} />
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
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
      <section className="relative px-6 pb-20 pt-28">{children}</section>
    </div>
  );
}
