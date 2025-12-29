"use client";

import { useState, useEffect } from "react";
import {
  Webhook,
  Plus,
  Trash2,
  Copy,
  Check,
  RefreshCw,
  AlertTriangle,
  Play,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  api,
  type Webhook as WebhookType,
  type WebhookEvent,
} from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Navbar } from "@/components/shared/Navbar";
import { cn } from "@/lib/utils";

const WEBHOOK_EVENTS: { value: WebhookEvent; label: string }[] = [
  { value: "workflow.started", label: "Workflow Started" },
  { value: "workflow.completed", label: "Workflow Completed" },
  { value: "workflow.failed", label: "Workflow Failed" },
  { value: "node.started", label: "Node Started" },
  { value: "node.completed", label: "Node Completed" },
  { value: "node.failed", label: "Node Failed" },
];

export default function WebhooksPage() {
  const [webhooks, setWebhooks] = useState<WebhookType[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Create webhook modal
  const [createWebhookOpen, setCreateWebhookOpen] = useState(false);
  const [creatingWebhook, setCreatingWebhook] = useState(false);
  const [webhookForm, setWebhookForm] = useState({
    name: "",
    type: "outgoing" as "incoming" | "outgoing",
    url: "",
    method: "POST",
    events: [] as WebhookEvent[],
  });

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Testing
  const [testingWebhook, setTestingWebhook] = useState<string | null>(null);

  const { toast } = useToast();

  useEffect(() => {
    fetchWebhooks();
  }, []);

  const fetchWebhooks = async () => {
    setLoading(true);
    try {
      const data = await api.webhooks.list();
      setWebhooks(data);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load webhooks",
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
    setCreatingWebhook(true);
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
    } finally {
      setCreatingWebhook(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    setDeleting(true);
    try {
      await api.webhooks.delete(deleteTarget.id);
      setWebhooks((prev) => prev.filter((w) => w.id !== deleteTarget.id));
      toast({ title: "Webhook deleted" });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete webhook",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const handleTestWebhook = async (webhookId: string) => {
    setTestingWebhook(webhookId);
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
    } finally {
      setTestingWebhook(null);
    }
  };

  const toggleWebhookEnabled = async (webhook: WebhookType) => {
    try {
      const updated = await api.webhooks.update(webhook.id, { enabled: !webhook.enabled });
      setWebhooks((prev) => prev.map((w) => (w.id === webhook.id ? updated : w)));
      toast({
        title: webhook.enabled ? "Webhook Disabled" : "Webhook Enabled",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update webhook",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar title="Webhooks" icon={Webhook}>
        <Button variant="outline" size="sm" onClick={fetchWebhooks} disabled={loading}>
          <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
          Refresh
        </Button>
      </Navbar>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex justify-between items-center mb-6">
          <p className="text-muted-foreground">
            Configure incoming and outgoing webhooks for workflow automation
          </p>
          <Button onClick={() => setCreateWebhookOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Webhook
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : webhooks.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Webhook className="h-16 w-16 mx-auto mb-4 opacity-50" />
            <p className="font-medium text-lg">No webhooks configured</p>
            <p className="text-sm mb-4">Create your first webhook to get started</p>
            <Button onClick={() => setCreateWebhookOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Webhook
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {webhooks.map((webhook) => (
              <div
                key={webhook.id}
                className={cn(
                  "border rounded-lg p-5 bg-card",
                  !webhook.enabled && "opacity-60"
                )}
              >
                <div className="flex justify-between items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="font-semibold">{webhook.name}</h4>
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded text-xs font-medium",
                          webhook.type === "incoming"
                            ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                            : "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                        )}
                      >
                        {webhook.type}
                      </span>
                      {!webhook.enabled && (
                        <span className="px-2 py-0.5 rounded text-xs bg-muted text-muted-foreground">
                          Disabled
                        </span>
                      )}
                    </div>

                    {webhook.type === "incoming" && webhook.triggerUrl && (
                      <div className="flex items-center gap-2 mb-2">
                        <code className="text-xs bg-muted px-3 py-1.5 rounded font-mono truncate max-w-lg">
                          {webhook.triggerUrl}
                        </code>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopy(webhook.triggerUrl!, `webhook-${webhook.id}`)}
                          className="flex-shrink-0"
                        >
                          {copiedId === `webhook-${webhook.id}` ? (
                            <Check className="h-4 w-4" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    )}

                    {webhook.type === "outgoing" && webhook.url && (
                      <p className="text-sm text-muted-foreground mb-2 truncate max-w-lg">
                        {webhook.method} {webhook.url}
                      </p>
                    )}

                    {webhook.events && webhook.events.length > 0 && (
                      <div className="flex gap-1 mb-2 flex-wrap">
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

                    <div className="flex gap-4 text-xs text-muted-foreground">
                      <span>Success: {webhook.successCount}</span>
                      <span>Failed: {webhook.failureCount}</span>
                      {webhook.lastTriggeredAt && (
                        <span>
                          Last: {new Date(webhook.lastTriggeredAt).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {webhook.type === "outgoing" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleTestWebhook(webhook.id)}
                        disabled={testingWebhook === webhook.id}
                        title="Test Webhook"
                      >
                        {testingWebhook === webhook.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggleWebhookEnabled(webhook)}
                    >
                      {webhook.enabled ? "Disable" : "Enable"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setDeleteTarget({
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
      </main>

      {/* Create Webhook Modal */}
      <Dialog open={createWebhookOpen} onOpenChange={setCreateWebhookOpen}>
        <DialogContent className="max-w-md">
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
                creatingWebhook ||
                !webhookForm.name ||
                (webhookForm.type === "outgoing" &&
                  (!webhookForm.url || webhookForm.events.length === 0))
              }
            >
              {creatingWebhook ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Delete Webhook
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
