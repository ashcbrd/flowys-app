"use client";

import { useState, useEffect } from "react";
import {
  Key,
  Plus,
  Trash2,
  Copy,
  Check,
  RefreshCw,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  api,
  type ApiKey,
  type ApiKeyScope,
} from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Navbar } from "@/components/shared/Navbar";
import { cn } from "@/lib/utils";

// Individual scopes (without full_access)
const INDIVIDUAL_SCOPES: { value: ApiKeyScope; label: string; description: string }[] = [
  { value: "workflows:read", label: "Read Workflows", description: "View workflow details" },
  { value: "workflows:write", label: "Write Workflows", description: "Create and update workflows" },
  { value: "workflows:execute", label: "Execute Workflows", description: "Run workflows via API" },
  { value: "executions:read", label: "Read Executions", description: "View execution history" },
  { value: "webhooks:read", label: "Read Webhooks", description: "View webhook configurations" },
  { value: "webhooks:write", label: "Write Webhooks", description: "Manage webhooks" },
];

export default function ApiKeysPage() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Create API key modal
  const [createApiKeyOpen, setCreateApiKeyOpen] = useState(false);
  const [creatingApiKey, setCreatingApiKey] = useState(false);
  const [apiKeyForm, setApiKeyForm] = useState({
    name: "",
    description: "",
    scopes: ["workflows:read", "executions:read"] as ApiKeyScope[],
  });
  const [newApiKey, setNewApiKey] = useState<string | null>(null);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { toast } = useToast();

  useEffect(() => {
    fetchApiKeys();
  }, []);

  const fetchApiKeys = async () => {
    setLoading(true);
    try {
      const data = await api.apiKeys.list();
      setApiKeys(data);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load API keys",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    toast({ title: "Copied to clipboard" });
  };

  const handleCreateApiKey = async () => {
    setCreatingApiKey(true);
    try {
      const result = await api.apiKeys.create({
        name: apiKeyForm.name,
        description: apiKeyForm.description,
        scopes: apiKeyForm.scopes,
      });

      setApiKeys((prev) => [result, ...prev]);
      setNewApiKey(result.key);
      setApiKeyForm({ name: "", description: "", scopes: ["workflows:read", "executions:read"] });

      toast({
        title: "API Key Created",
        description: "Make sure to copy the key now. It won't be shown again!",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create API key",
        variant: "destructive",
      });
    } finally {
      setCreatingApiKey(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    setDeleting(true);
    try {
      await api.apiKeys.delete(deleteTarget.id);
      setApiKeys((prev) => prev.filter((k) => k.id !== deleteTarget.id));
      toast({ title: "API key deleted" });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete API key",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const toggleApiKeyEnabled = async (apiKey: ApiKey) => {
    try {
      const updated = await api.apiKeys.update(apiKey.id, { enabled: !apiKey.enabled });
      setApiKeys((prev) => prev.map((k) => (k.id === apiKey.id ? updated : k)));
      toast({
        title: apiKey.enabled ? "API Key Disabled" : "API Key Enabled",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update API key",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar title="API Keys" icon={Key}>
        <Button variant="outline" size="sm" onClick={fetchApiKeys} disabled={loading}>
          <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
          Refresh
        </Button>
      </Navbar>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex justify-between items-center mb-6">
          <p className="text-muted-foreground">
            Create API keys to access workflows programmatically
          </p>
          <Button onClick={() => setCreateApiKeyOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create API Key
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : apiKeys.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Key className="h-16 w-16 mx-auto mb-4 opacity-50" />
            <p className="font-medium text-lg">No API keys created</p>
            <p className="text-sm mb-4">Create your first API key to get started</p>
            <Button onClick={() => setCreateApiKeyOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create API Key
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {apiKeys.map((key) => (
              <div
                key={key.id}
                className={cn(
                  "border rounded-lg p-5 bg-card",
                  !key.enabled && "opacity-60"
                )}
              >
                <div className="flex justify-between items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="font-semibold">{key.name}</h4>
                      {!key.enabled && (
                        <span className="px-2 py-0.5 rounded text-xs bg-muted text-muted-foreground">
                          Disabled
                        </span>
                      )}
                    </div>

                    {key.description && (
                      <p className="text-sm text-muted-foreground mb-2">
                        {key.description}
                      </p>
                    )}

                    <div className="flex items-center gap-2 mb-2">
                      <code className="text-xs bg-muted px-3 py-1.5 rounded font-mono">
                        {key.keyPrefix}...
                      </code>
                    </div>

                    <div className="flex gap-1 mb-2 flex-wrap">
                      {key.scopes.map((scope) => (
                        <span
                          key={scope}
                          className="text-xs bg-muted px-2 py-0.5 rounded"
                        >
                          {scope}
                        </span>
                      ))}
                    </div>

                    <div className="flex gap-4 text-xs text-muted-foreground">
                      <span>Used: {key.usageCount} times</span>
                      {key.lastUsedAt && (
                        <span>
                          Last: {new Date(key.lastUsedAt).toLocaleString()}
                        </span>
                      )}
                      {key.expiresAt && (
                        <span>Expires: {new Date(key.expiresAt).toLocaleDateString()}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggleApiKeyEnabled(key)}
                    >
                      {key.enabled ? "Disable" : "Enable"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setDeleteTarget({
                          id: key.id,
                          name: key.name,
                        })
                      }
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Create API Key Modal */}
      <Dialog
        open={createApiKeyOpen}
        onOpenChange={(open) => {
          setCreateApiKeyOpen(open);
          if (!open) setNewApiKey(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {newApiKey ? "API Key Created" : "Create API Key"}
            </DialogTitle>
          </DialogHeader>

          {newApiKey ? (
            <div className="space-y-4 py-4">
              <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                      Save this key now!
                    </p>
                    <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                      This is the only time you'll see this key. Store it securely.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-muted p-4 rounded-lg">
                <code className="text-sm break-all font-mono">{newApiKey}</code>
              </div>

              <Button
                className="w-full"
                onClick={() => handleCopy(newApiKey, "new-key")}
              >
                {copiedId === "new-key" ? (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 mr-2" />
                    Copy to Clipboard
                  </>
                )}
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-4 py-4">
                <div>
                  <label className="text-sm font-medium">Name</label>
                  <Input
                    value={apiKeyForm.name}
                    onChange={(e) => setApiKeyForm({ ...apiKeyForm, name: e.target.value })}
                    placeholder="My API Key"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Description (optional)</label>
                  <Input
                    value={apiKeyForm.description}
                    onChange={(e) =>
                      setApiKeyForm({ ...apiKeyForm, description: e.target.value })
                    }
                    placeholder="Used for production integration"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Permissions</label>
                  <div className="space-y-2 mt-2">
                    {/* Full Access - Master checkbox */}
                    <label className="flex items-start gap-2 pb-2 border-b">
                      <input
                        type="checkbox"
                        checked={apiKeyForm.scopes.includes("full_access")}
                        onChange={(e) => {
                          if (e.target.checked) {
                            // Check full_access and all individual scopes
                            const allScopes: ApiKeyScope[] = [
                              "full_access",
                              ...INDIVIDUAL_SCOPES.map((s) => s.value),
                            ];
                            setApiKeyForm({
                              ...apiKeyForm,
                              scopes: allScopes,
                            });
                          } else {
                            // Uncheck all scopes
                            setApiKeyForm({
                              ...apiKeyForm,
                              scopes: [],
                            });
                          }
                        }}
                        className="rounded mt-1"
                      />
                      <div>
                        <span className="text-sm font-medium">Full Access</span>
                        <p className="text-xs text-muted-foreground">All permissions</p>
                      </div>
                    </label>

                    {/* Individual scopes as sub-items */}
                    <div className="pl-6 space-y-2">
                      {INDIVIDUAL_SCOPES.map((scope) => (
                        <label key={scope.value} className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            checked={apiKeyForm.scopes.includes(scope.value)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                const newScopes = [...apiKeyForm.scopes, scope.value];
                                // Check if all individual scopes are now selected
                                const allIndividualSelected = INDIVIDUAL_SCOPES.every((s) =>
                                  newScopes.includes(s.value)
                                );
                                if (allIndividualSelected) {
                                  // Also check full_access
                                  setApiKeyForm({
                                    ...apiKeyForm,
                                    scopes: [...newScopes, "full_access"],
                                  });
                                } else {
                                  setApiKeyForm({
                                    ...apiKeyForm,
                                    scopes: newScopes,
                                  });
                                }
                              } else {
                                // Uncheck this scope and also uncheck full_access
                                setApiKeyForm({
                                  ...apiKeyForm,
                                  scopes: apiKeyForm.scopes.filter(
                                    (s) => s !== scope.value && s !== "full_access"
                                  ),
                                });
                              }
                            }}
                            className="rounded mt-1"
                          />
                          <div>
                            <span className="text-sm font-medium">{scope.label}</span>
                            <p className="text-xs text-muted-foreground">{scope.description}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateApiKeyOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleCreateApiKey}
                  disabled={creatingApiKey || !apiKeyForm.name || apiKeyForm.scopes.length === 0}
                >
                  {creatingApiKey ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create"
                  )}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Delete API Key
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{deleteTarget?.name}&quot;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
