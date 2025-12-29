"use client";

import { useState, useEffect } from "react";
import {
  Webhook,
  Key,
  Plus,
  Trash2,
  Copy,
  Check,
  ExternalLink,
  RefreshCw,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Play,
  Settings,
  X,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  api,
  type Webhook as WebhookType,
  type ApiKey,
  type WebhookEvent,
  type ApiKeyScope,
} from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const WEBHOOK_EVENTS: { value: WebhookEvent; label: string }[] = [
  { value: "workflow.started", label: "Workflow Started" },
  { value: "workflow.completed", label: "Workflow Completed" },
  { value: "workflow.failed", label: "Workflow Failed" },
  { value: "node.started", label: "Node Started" },
  { value: "node.completed", label: "Node Completed" },
  { value: "node.failed", label: "Node Failed" },
];

const API_SCOPES: { value: ApiKeyScope; label: string; description: string }[] = [
  { value: "workflows:read", label: "Read Workflows", description: "View workflow details" },
  { value: "workflows:write", label: "Write Workflows", description: "Create and update workflows" },
  { value: "workflows:execute", label: "Execute Workflows", description: "Run workflows via API" },
  { value: "executions:read", label: "Read Executions", description: "View execution history" },
  { value: "webhooks:read", label: "Read Webhooks", description: "View webhook configurations" },
  { value: "webhooks:write", label: "Write Webhooks", description: "Manage webhooks" },
  { value: "full_access", label: "Full Access", description: "All permissions" },
];

interface IntegrationsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function IntegrationsPanel({ open, onOpenChange }: IntegrationsPanelProps) {
  const [activeTab, setActiveTab] = useState<"webhooks" | "apiKeys">("webhooks");
  const [webhooks, setWebhooks] = useState<WebhookType[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Create webhook modal
  const [createWebhookOpen, setCreateWebhookOpen] = useState(false);
  const [webhookForm, setWebhookForm] = useState({
    name: "",
    type: "outgoing" as "incoming" | "outgoing",
    url: "",
    method: "POST",
    events: [] as WebhookEvent[],
  });

  // Create API key modal
  const [createApiKeyOpen, setCreateApiKeyOpen] = useState(false);
  const [apiKeyForm, setApiKeyForm] = useState({
    name: "",
    description: "",
    scopes: ["workflows:read", "executions:read"] as ApiKeyScope[],
  });
  const [newApiKey, setNewApiKey] = useState<string | null>(null);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<{ type: "webhook" | "apiKey"; id: string; name: string } | null>(null);

  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      fetchData();
    }
  }, [open, activeTab]);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === "webhooks") {
        const data = await api.webhooks.list();
        setWebhooks(data);
      } else {
        const data = await api.apiKeys.list();
        setApiKeys(data);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load data",
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

  const handleCreateWebhook = async () => {
    try {
      const webhook = await api.webhooks.create({
        name: webhookForm.name,
        type: webhookForm.type,
        url: webhookForm.type === "outgoing" ? webhookForm.url : undefined,
        method: webhookForm.type === "outgoing" ? webhookForm.method : undefined,
        events: webhookForm.type === "outgoing" ? webhookForm.events : undefined,
      });

      setWebhooks((prev) => [webhook, ...prev]);
      setCreateWebhookOpen(false);
      setWebhookForm({ name: "", type: "outgoing", url: "", method: "POST", events: [] });

      if (webhook.type === "incoming" && webhook.secret) {
        toast({
          title: "Webhook Created",
          description: `Secret: ${webhook.secret} (save this now!)`,
        });
      } else {
        toast({ title: "Webhook Created" });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create webhook",
        variant: "destructive",
      });
    }
  };

  const handleCreateApiKey = async () => {
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
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    try {
      if (deleteTarget.type === "webhook") {
        await api.webhooks.delete(deleteTarget.id);
        setWebhooks((prev) => prev.filter((w) => w.id !== deleteTarget.id));
      } else {
        await api.apiKeys.delete(deleteTarget.id);
        setApiKeys((prev) => prev.filter((k) => k.id !== deleteTarget.id));
      }

      toast({ title: "Deleted successfully" });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete",
        variant: "destructive",
      });
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleTestWebhook = async (webhookId: string) => {
    try {
      const result = await api.webhooks.test(webhookId);
      if (result.success) {
        toast({ title: "Test Successful", description: `Response: ${result.statusCode}` });
      } else {
        toast({
          title: "Test Failed",
          description: result.error,
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to test webhook",
        variant: "destructive",
      });
    }
  };

  const toggleWebhookEnabled = async (webhook: WebhookType) => {
    try {
      const updated = await api.webhooks.update(webhook.id, { enabled: !webhook.enabled });
      setWebhooks((prev) => prev.map((w) => (w.id === webhook.id ? updated : w)));
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update webhook",
        variant: "destructive",
      });
    }
  };

  const toggleApiKeyEnabled = async (apiKey: ApiKey) => {
    try {
      const updated = await api.apiKeys.update(apiKey.id, { enabled: !apiKey.enabled });
      setApiKeys((prev) => prev.map((k) => (k.id === apiKey.id ? updated : k)));
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update API key",
        variant: "destructive",
      });
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Integrations
            </DialogTitle>
            <DialogDescription>
              Manage webhooks and API keys for external integrations
            </DialogDescription>
          </DialogHeader>

          {/* Tabs */}
          <div className="flex gap-2 border-b pb-2">
            <Button
              variant={activeTab === "webhooks" ? "default" : "ghost"}
              size="sm"
              onClick={() => setActiveTab("webhooks")}
            >
              <Webhook className="h-4 w-4 mr-1" />
              Webhooks
            </Button>
            <Button
              variant={activeTab === "apiKeys" ? "default" : "ghost"}
              size="sm"
              onClick={() => setActiveTab("apiKeys")}
            >
              <Key className="h-4 w-4 mr-1" />
              API Keys
            </Button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            {activeTab === "webhooks" ? (
              <div className="space-y-4 py-4">
                <div className="flex justify-between items-center">
                  <p className="text-sm text-muted-foreground">
                    Configure incoming and outgoing webhooks for workflow automation
                  </p>
                  <Button size="sm" onClick={() => setCreateWebhookOpen(true)}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add Webhook
                  </Button>
                </div>

                {loading ? (
                  <div className="text-center py-8 text-muted-foreground">Loading...</div>
                ) : webhooks.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Webhook className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No webhooks configured</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {webhooks.map((webhook) => (
                      <div
                        key={webhook.id}
                        className={cn(
                          "border rounded-lg p-4",
                          !webhook.enabled && "opacity-60"
                        )}
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h4 className="font-medium">{webhook.name}</h4>
                              <span
                                className={cn(
                                  "px-2 py-0.5 rounded text-xs",
                                  webhook.type === "incoming"
                                    ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                                    : "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                                )}
                              >
                                {webhook.type}
                              </span>
                              {!webhook.enabled && (
                                <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                                  Disabled
                                </span>
                              )}
                            </div>

                            {webhook.type === "incoming" && webhook.triggerUrl && (
                              <div className="mt-2 flex items-center gap-2">
                                <code className="text-xs bg-muted px-2 py-1 rounded truncate max-w-md">
                                  {webhook.triggerUrl}
                                </code>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleCopy(webhook.triggerUrl!, webhook.id)}
                                >
                                  {copiedId === webhook.id ? (
                                    <Check className="h-3 w-3" />
                                  ) : (
                                    <Copy className="h-3 w-3" />
                                  )}
                                </Button>
                              </div>
                            )}

                            {webhook.type === "outgoing" && webhook.url && (
                              <p className="text-sm text-muted-foreground mt-1 truncate max-w-md">
                                {webhook.method} {webhook.url}
                              </p>
                            )}

                            {webhook.events && webhook.events.length > 0 && (
                              <div className="flex gap-1 mt-2 flex-wrap">
                                {webhook.events.map((event) => (
                                  <span
                                    key={event}
                                    className="text-xs bg-muted px-2 py-0.5 rounded"
                                  >
                                    {event}
                                  </span>
                                ))}
                              </div>
                            )}

                            <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                              <span>Success: {webhook.successCount}</span>
                              <span>Failed: {webhook.failureCount}</span>
                              {webhook.lastTriggeredAt && (
                                <span>
                                  Last: {new Date(webhook.lastTriggeredAt).toLocaleString()}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1">
                            {webhook.type === "outgoing" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleTestWebhook(webhook.id)}
                              >
                                <Play className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleWebhookEnabled(webhook)}
                            >
                              {webhook.enabled ? "Disable" : "Enable"}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setDeleteTarget({
                                  type: "webhook",
                                  id: webhook.id,
                                  name: webhook.name,
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
              </div>
            ) : (
              <div className="space-y-4 py-4">
                <div className="flex justify-between items-center">
                  <p className="text-sm text-muted-foreground">
                    Create API keys to access workflows programmatically
                  </p>
                  <Button size="sm" onClick={() => setCreateApiKeyOpen(true)}>
                    <Plus className="h-4 w-4 mr-1" />
                    Create API Key
                  </Button>
                </div>

                {loading ? (
                  <div className="text-center py-8 text-muted-foreground">Loading...</div>
                ) : apiKeys.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Key className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No API keys created</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {apiKeys.map((key) => (
                      <div
                        key={key.id}
                        className={cn(
                          "border rounded-lg p-4",
                          !key.enabled && "opacity-60"
                        )}
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h4 className="font-medium">{key.name}</h4>
                              {!key.enabled && (
                                <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                                  Disabled
                                </span>
                              )}
                            </div>

                            {key.description && (
                              <p className="text-sm text-muted-foreground mt-1">
                                {key.description}
                              </p>
                            )}

                            <div className="mt-2 flex items-center gap-2">
                              <code className="text-xs bg-muted px-2 py-1 rounded">
                                {key.keyPrefix}...
                              </code>
                            </div>

                            <div className="flex gap-1 mt-2 flex-wrap">
                              {key.scopes.map((scope) => (
                                <span
                                  key={scope}
                                  className="text-xs bg-muted px-2 py-0.5 rounded"
                                >
                                  {scope}
                                </span>
                              ))}
                            </div>

                            <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
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

                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleApiKeyEnabled(key)}
                            >
                              {key.enabled ? "Disable" : "Enable"}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setDeleteTarget({
                                  type: "apiKey",
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
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Webhook Modal */}
      <Dialog open={createWebhookOpen} onOpenChange={setCreateWebhookOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Webhook</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium">Name</label>
              <Input
                value={webhookForm.name}
                onChange={(e) => setWebhookForm({ ...webhookForm, name: e.target.value })}
                placeholder="My Webhook"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Type</label>
              <Select
                value={webhookForm.type}
                onValueChange={(v) =>
                  setWebhookForm({ ...webhookForm, type: v as "incoming" | "outgoing" })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="incoming">Incoming (trigger workflow)</SelectItem>
                  <SelectItem value="outgoing">Outgoing (send data)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {webhookForm.type === "outgoing" && (
              <>
                <div>
                  <label className="text-sm font-medium">URL</label>
                  <Input
                    value={webhookForm.url}
                    onChange={(e) => setWebhookForm({ ...webhookForm, url: e.target.value })}
                    placeholder="https://example.com/webhook"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Method</label>
                  <Select
                    value={webhookForm.method}
                    onValueChange={(v) => setWebhookForm({ ...webhookForm, method: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="POST">POST</SelectItem>
                      <SelectItem value="PUT">PUT</SelectItem>
                      <SelectItem value="PATCH">PATCH</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm font-medium">Events</label>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {WEBHOOK_EVENTS.map((event) => (
                      <label key={event.value} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={webhookForm.events.includes(event.value)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setWebhookForm({
                                ...webhookForm,
                                events: [...webhookForm.events, event.value],
                              });
                            } else {
                              setWebhookForm({
                                ...webhookForm,
                                events: webhookForm.events.filter((ev) => ev !== event.value),
                              });
                            }
                          }}
                          className="rounded"
                        />
                        <span className="text-sm">{event.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateWebhookOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateWebhook}
              disabled={
                !webhookForm.name ||
                (webhookForm.type === "outgoing" &&
                  (!webhookForm.url || webhookForm.events.length === 0))
              }
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create API Key Modal */}
      <Dialog
        open={createApiKeyOpen}
        onOpenChange={(open) => {
          setCreateApiKeyOpen(open);
          if (!open) setNewApiKey(null);
        }}
      >
        <DialogContent>
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

              <div className="bg-muted p-3 rounded-lg">
                <code className="text-sm break-all">{newApiKey}</code>
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
                    {API_SCOPES.map((scope) => (
                      <label key={scope.value} className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={apiKeyForm.scopes.includes(scope.value)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setApiKeyForm({
                                ...apiKeyForm,
                                scopes: [...apiKeyForm.scopes, scope.value],
                              });
                            } else {
                              setApiKeyForm({
                                ...apiKeyForm,
                                scopes: apiKeyForm.scopes.filter((s) => s !== scope.value),
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

              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateApiKeyOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleCreateApiKey}
                  disabled={!apiKeyForm.name || apiKeyForm.scopes.length === 0}
                >
                  Create
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
              Delete {deleteTarget?.type === "webhook" ? "Webhook" : "API Key"}
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deleteTarget?.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="h-4 w-4 mr-1" />
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
