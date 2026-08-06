"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, FileText, Plus, Search, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/shared/Navbar";

interface DocumentRow {
  id: string;
  title: string;
  status: "pending" | "processing" | "ready" | "failed";
  error?: string;
  chunkCount: number;
  createdAt: string;
}

interface Citation {
  n: number;
  documentTitle: string;
  heading?: string;
  score: number;
  excerpt: string;
}

export default function KnowledgePage() {
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");

  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState("");
  const [citations, setCitations] = useState<Citation[]>([]);
  const [askError, setAskError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/knowledge/documents");
      if (res.ok) setDocuments(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // A queued document is indexed by a background worker, so the page has to
  // find out on its own that it finished. Polling stops as soon as nothing is
  // in flight, so an idle page makes no requests.
  const anyInFlight = documents.some(
    (d) => d.status === "pending" || d.status === "processing"
  );
  useEffect(() => {
    if (!anyInFlight) return;
    const timer = setInterval(load, 4000);
    return () => clearInterval(timer);
  }, [anyInFlight, load]);

  const submitDocument = async (request: RequestInit) => {
    setAdding(true);
    setAddError("");
    try {
      const res = await fetch("/api/knowledge/documents", { method: "POST", ...request });
      const data = await res.json();
      if (!res.ok) {
        setAddError(data.error || "Could not add that document");
        return false;
      }
      await load();
      return true;
    } catch {
      setAddError("Could not reach the server");
      return false;
    } finally {
      setAdding(false);
    }
  };

  const addDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await submitDocument({
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, text }),
    });
    if (ok) {
      setTitle("");
      setText("");
    }
  };

  const addUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await submitDocument({
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    if (ok) setUrl("");
  };

  const addFile = async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    await submitDocument({ body: form });
  };

  const ask = async (e: React.FormEvent) => {
    e.preventDefault();
    setAsking(true);
    setAskError("");
    setAnswer("");
    setCitations([]);
    try {
      const res = await fetch("/api/knowledge/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAskError(data.error || "Could not answer that");
      } else {
        setAnswer(data.answer);
        setCitations(data.citations ?? []);
      }
    } catch {
      setAskError("Could not reach the server");
    } finally {
      setAsking(false);
    }
  };

  const readyCount = documents.filter((d) => d.status === "ready").length;

  return (
    <div className="min-h-screen bg-background">
      <Navbar title="Your documents" />
      <main className="max-w-4xl mx-auto px-6 py-10 space-y-10">
        <header>
          <p className="text-muted-foreground">
            Add what your team keeps re-explaining, then ask it questions. Answers only ever
            come from what you put here.
          </p>
        </header>

        {/* Ask */}
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="font-semibold text-foreground mb-3 flex items-center gap-2">
            <Search className="w-4 h-4" /> Ask a question
          </h2>
          <form onSubmit={ask} className="flex gap-2">
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={
                readyCount === 0 ? "Add a document first" : "How long do refunds take?"
              }
              disabled={readyCount === 0 || asking}
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:opacity-50"
            />
            <Button type="submit" disabled={!question.trim() || asking || readyCount === 0}>
              {asking ? <Loader2 className="w-4 h-4 animate-spin" /> : "Ask"}
            </Button>
          </form>

          {askError && (
            <p className="mt-3 text-sm text-destructive flex items-center gap-2">
              <AlertCircle className="w-4 h-4" /> {askError}
            </p>
          )}

          {answer && (
            <div className="mt-4 space-y-4">
              <p className="text-sm text-foreground whitespace-pre-wrap">{answer}</p>
              {citations.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Where this came from
                  </p>
                  {citations.map((c) => (
                    <div
                      key={c.n}
                      className="rounded-lg border border-border bg-muted/40 p-3 text-xs"
                    >
                      <p className="font-medium text-foreground">
                        [{c.n}] {c.documentTitle}
                        {c.heading ? ` > ${c.heading}` : ""}
                        <span className="ml-2 font-normal text-muted-foreground">
                          {c.score.toFixed(3)}
                        </span>
                      </p>
                      <p className="mt-1 text-muted-foreground">{c.excerpt}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Add */}
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="font-semibold text-foreground mb-3 flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add a document
          </h2>
          <div className="flex flex-col sm:flex-row gap-2 mb-4">
            <label className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground cursor-pointer hover:bg-muted/40">
              <Plus className="w-4 h-4" />
              {adding ? "Working..." : "Upload a file (.pdf, .docx, .txt, .md, .csv)"}
              <input
                type="file"
                accept=".pdf,.docx,.txt,.md,.markdown,.csv,.json,.log"
                className="hidden"
                disabled={adding}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) addFile(file);
                  e.target.value = "";
                }}
              />
            </label>
          </div>

          <form onSubmit={addUrl} className="flex gap-2 mb-4">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Or a web page: https://..."
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
            <Button type="submit" variant="outline" disabled={!url.trim() || adding}>
              Fetch
            </Button>
          </form>

          <form onSubmit={addDocument} className="space-y-3">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What is this? e.g. Support handbook"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
              placeholder="Paste the text. Markdown headings become sections, which is what a citation points at."
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono"
            />
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={!title.trim() || !text.trim() || adding}>
                {adding ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" /> Indexing
                  </>
                ) : (
                  "Add"
                )}
              </Button>
              {addError && (
                <p className="text-sm text-destructive flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" /> {addError}
                </p>
              )}
            </div>
          </form>
        </section>

        {/* List */}
        <section>
          <h2 className="font-semibold text-foreground mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4" /> Added so far
          </h2>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : documents.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing yet.</p>
          ) : (
            <ul className="space-y-2">
              {documents.map((doc) => (
                <li
                  key={doc.id}
                  className="rounded-lg border border-border bg-card px-4 py-3 flex items-center justify-between"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">{doc.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {doc.status === "ready"
                        ? `${doc.chunkCount} section${doc.chunkCount === 1 ? "" : "s"}, searchable`
                        : doc.status === "failed"
                          ? doc.error || "Failed"
                          : doc.status === "pending"
                            ? "Queued. Large documents are indexed in the background, so you can leave this page."
                            : "Indexing now"}
                    </p>
                  </div>
                  <span
                    className={`text-xs px-2 py-1 rounded-md ${
                      doc.status === "ready"
                        ? "bg-emerald-500/10 text-emerald-600"
                        : doc.status === "failed"
                          ? "bg-destructive/10 text-destructive"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {doc.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
