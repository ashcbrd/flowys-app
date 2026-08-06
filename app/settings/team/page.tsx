"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, UserPlus, Users, AlertCircle, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/shared/Navbar";

type Role = "owner" | "admin" | "member" | "viewer";

interface Workspace {
  id: string;
  name: string;
  personal: boolean;
  role: Role;
}

interface Member {
  userId: string;
  email: string;
  name?: string;
  role: Role;
}

const ROLE_HELP: Record<Role, string> = {
  owner: "Can do anything, including removing other owners",
  admin: "Can add and remove people, and change who can read a document",
  member: "Can build workflows and read shared documents",
  viewer: "Can read, but not change anything",
};

export default function TeamPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [members, setMembers] = useState<Member[]>([]);
  const [myRole, setMyRole] = useState<Role>("member");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [busy, setBusy] = useState(false);

  const [newWorkspace, setNewWorkspace] = useState("");
  const [creating, setCreating] = useState(false);

  const loadMembers = useCallback(async (workspaceId: string) => {
    if (!workspaceId) return;
    const res = await fetch(`/api/workspaces/${workspaceId}/members`);
    if (!res.ok) return;
    const data = await res.json();
    return data as { members: Member[]; role: Role };
  }, []);

  // Both effects guard against a response arriving after the component has
  // gone, which is easy to hit here: switching workspaces quickly leaves an
  // in-flight request whose answer belongs to the previous selection.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/workspaces");
      if (!res.ok || cancelled) return;
      const list: Workspace[] = await res.json();
      if (cancelled) return;
      setWorkspaces(list);
      setActiveId((current) => current || list.find((w) => !w.personal)?.id || list[0]?.id || "");
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await loadMembers(activeId);
      if (!data || cancelled) return;
      setMembers(data.members);
      setMyRole(data.role);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeId, loadMembers]);

  const active = workspaces.find((w) => w.id === activeId);
  const canManage = myRole === "owner" || myRole === "admin";

  const call = async (input: RequestInfo, init: RequestInit) => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(input, init);
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error || "That did not work");
        return false;
      }
      const data = await loadMembers(activeId);
      if (data) {
        setMembers(data.members);
        setMyRole(data.role);
      }
      return true;
    } finally {
      setBusy(false);
    }
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await call(`/api/workspaces/${activeId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role }),
    });
    if (ok) setEmail("");
  };

  const createWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newWorkspace }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "Could not create that workspace");
        return;
      }
      setNewWorkspace("");
      const listRes = await fetch("/api/workspaces");
      if (listRes.ok) setWorkspaces(await listRes.json());
      setActiveId(data.id);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar title="Team" />
      <main className="mx-auto max-w-3xl space-y-8 px-6 py-10">
        <p className="text-muted-foreground">
          A personal workspace is yours alone. Create a shared one to work on the same
          workflows and documents as other people.
        </p>

        {/* Workspace switcher */}
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 font-semibold text-foreground">
            <Users className="h-4 w-4" /> Workspaces
          </h2>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {workspaces.map((w) => (
                <button
                  key={w.id}
                  onClick={() => setActiveId(w.id)}
                  className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                    w.id === activeId
                      ? "border-foreground bg-foreground text-background"
                      : "border-border hover:bg-muted/50"
                  }`}
                >
                  {w.name}
                  <span className="ml-2 opacity-60">{w.personal ? "personal" : w.role}</span>
                </button>
              ))}
            </div>
          )}

          <form onSubmit={createWorkspace} className="flex gap-2 pt-1">
            <input
              value={newWorkspace}
              onChange={(e) => setNewWorkspace(e.target.value)}
              placeholder="New shared workspace, e.g. Support team"
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
            <Button
              type="submit"
              variant="outline"
              disabled={!newWorkspace.trim() || creating}
              className="gap-2"
            >
              {creating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Create workspace
            </Button>
          </form>
        </section>

        {error && (
          <p className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
            <AlertCircle className="mt-px h-4 w-4 shrink-0" />
            {error}
          </p>
        )}

        {active?.personal ? (
          <p className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
            This is your personal workspace, so it stays a workspace of one. Create a shared
            workspace above to add people, rather than opening up the place your private
            documents live.
          </p>
        ) : (
          <>
            {/* Add someone */}
            {canManage && (
              <section className="space-y-3">
                <h2 className="flex items-center gap-2 font-semibold text-foreground">
                  <UserPlus className="h-4 w-4" /> Add someone
                </h2>
                <form onSubmit={add} className="flex flex-col gap-2 sm:flex-row">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Their email address"
                    className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  />
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as Role)}
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  >
                    <option value="admin">Admin</option>
                    <option value="member">Member</option>
                    <option value="viewer">Viewer</option>
                  </select>
                  <Button type="submit" disabled={!email.trim() || busy}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
                  </Button>
                </form>
                <p className="text-xs text-muted-foreground">{ROLE_HELP[role]}</p>
              </section>
            )}

            {/* Members */}
            <section className="space-y-3">
              <h2 className="font-semibold text-foreground">
                In this workspace ({members.length})
              </h2>
              <ul className="space-y-2">
                {members.map((m) => (
                  <li
                    key={m.userId}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {m.name || m.email}
                      </p>
                      {m.name && (
                        <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {canManage && m.role !== "owner" ? (
                        <select
                          value={m.role}
                          disabled={busy}
                          onChange={(e) =>
                            call(`/api/workspaces/${activeId}/members`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ userId: m.userId, role: e.target.value }),
                            })
                          }
                          className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                        >
                          <option value="admin">Admin</option>
                          <option value="member">Member</option>
                          <option value="viewer">Viewer</option>
                        </select>
                      ) : (
                        <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                          {m.role}
                        </span>
                      )}

                      {canManage && (
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={busy}
                          title="Remove from workspace"
                          onClick={() =>
                            call(
                              `/api/workspaces/${activeId}/members?userId=${encodeURIComponent(m.userId)}`,
                              { method: "DELETE" }
                            )
                          }
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
