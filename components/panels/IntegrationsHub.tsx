"use client";

import { useState, useEffect } from "react";
import {
  Plug,
  Plus,
  Loader2,
  Trash2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Search,
  ChevronDown,
  Key,
  Link2,
  AlertTriangle,
  Settings,
  Play,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface IntegrationConfig {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  authType: "oauth2" | "api_key" | "basic_auth" | "none";
  website: string;
  docsUrl?: string;
  oauth2?: {
    authorizationUrl: string;
    tokenUrl: string;
    scopes: string[];
  };
  apiKey?: {
    headerName?: string;
    prefix?: string;
    instructions?: string;
  };
  basicAuth?: {
    usernameLabel?: string;
    passwordLabel?: string;
    instructions?: string;
  };
}

interface IntegrationAction {
  id: string;
  name: string;
  description: string;
}

interface IntegrationDefinition {
  config: IntegrationConfig;
  actions: IntegrationAction[];
}

interface Connection {
  _id: string;
  integrationId: string;
  name: string;
  metadata?: Record<string, unknown>;
  enabled: boolean;
  lastUsedAt?: string;
  createdAt: string;
  updatedAt: string;
  integration?: IntegrationConfig;
}

interface IntegrationsHubProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const categoryLabels: Record<string, string> = {
  communication: "Communication",
  productivity: "Productivity",
  data: "Data & Storage",
  ai: "AI & ML",
  developer: "Developer Tools",
  marketing: "Marketing",
  analytics: "Analytics",
  crm: "CRM",
  other: "Other",
};

export function IntegrationsHub({ open, onOpenChange }: IntegrationsHubProps) {
  const [integrations, setIntegrations] = useState<IntegrationDefinition[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("available");
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  // Connection dialogs
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);
  const [selectedIntegration, setSelectedIntegration] = useState<IntegrationDefinition | null>(null);
  const [connectionName, setConnectionName] = useState("");
  const [apiKeyValue, setApiKeyValue] = useState("");
  const [usernameValue, setUsernameValue] = useState("");
  const [passwordValue, setPasswordValue] = useState("");
  const [connecting, setConnecting] = useState(false);

  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [connectionToDelete, setConnectionToDelete] = useState<Connection | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Test dialog
  const [testing, setTesting] = useState<string | null>(null);

  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      fetchIntegrations();
      fetchConnections();
    }
  }, [open]);

  const fetchIntegrations = async () => {
    try {
      const res = await fetch("/api/integrations");
      const data = await res.json();
      setIntegrations(data.integrations || []);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load integrations",
        variant: "destructive",
      });
    }
  };

  const fetchConnections = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/connections");
      const data = await res.json();
      setConnections(data.connections || []);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load connections",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const openConnectDialog = (integration: IntegrationDefinition) => {
    setSelectedIntegration(integration);
    setConnectionName(`My ${integration.config.name}`);
    setApiKeyValue("");
    setUsernameValue("");
    setPasswordValue("");
    setConnectDialogOpen(true);
  };

  const handleConnect = async () => {
    if (!selectedIntegration || !connectionName.trim()) {
      toast({
        title: "Error",
        description: "Please provide a connection name",
        variant: "destructive",
      });
      return;
    }

    const config = selectedIntegration.config;
    setConnecting(true);

    try {
      if (config.authType === "oauth2") {
        // Start OAuth flow
        const res = await fetch(`/api/integrations/${config.id}/authorize`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            connectionName,
            redirectUrl: "/integrations",
          }),
        });

        const data = await res.json();
        if (data.authorizationUrl) {
          window.location.href = data.authorizationUrl;
          return;
        }

        throw new Error(data.error || "Failed to start authorization");
      } else {
        // API Key or Basic Auth
        const credentials: Record<string, string> = {};

        if (config.authType === "api_key") {
          if (!apiKeyValue.trim()) {
            throw new Error("API key is required");
          }
          credentials.apiKey = apiKeyValue;
        } else if (config.authType === "basic_auth") {
          if (!usernameValue.trim() || !passwordValue.trim()) {
            throw new Error("Username and password are required");
          }
          credentials.username = usernameValue;
          credentials.password = passwordValue;
        }

        const res = await fetch("/api/connections", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            integrationId: config.id,
            name: connectionName,
            credentials,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Failed to create connection");
        }

        toast({
          title: "Success",
          description: "Connection created successfully",
        });

        setConnectDialogOpen(false);
        fetchConnections();
        setActiveTab("connections");
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to connect",
        variant: "destructive",
      });
    } finally {
      setConnecting(false);
    }
  };

  const handleTestConnection = async (connection: Connection) => {
    setTesting(connection._id);
    try {
      const res = await fetch(`/api/connections/${connection._id}/test`, {
        method: "POST",
      });
      const data = await res.json();

      if (data.valid) {
        toast({
          title: "Connection Valid",
          description: "Credentials are working correctly",
        });
      } else {
        toast({
          title: "Connection Failed",
          description: data.error || "Invalid credentials",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to test connection",
        variant: "destructive",
      });
    } finally {
      setTesting(null);
    }
  };

  const handleToggleEnabled = async (connection: Connection) => {
    try {
      const res = await fetch(`/api/connections/${connection._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !connection.enabled }),
      });

      if (res.ok) {
        setConnections((prev) =>
          prev.map((c) =>
            c._id === connection._id ? { ...c, enabled: !c.enabled } : c
          )
        );
        toast({
          title: connection.enabled ? "Connection Disabled" : "Connection Enabled",
          description: `"${connection.name}" has been ${connection.enabled ? "disabled" : "enabled"}`,
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update connection",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!connectionToDelete) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/connections/${connectionToDelete._id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        toast({
          title: "Success",
          description: "Connection deleted successfully",
        });
        setDeleteDialogOpen(false);
        setConnectionToDelete(null);
        fetchConnections();
      } else {
        throw new Error("Failed to delete");
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete connection",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  // Filter integrations
  const filteredIntegrations = integrations.filter((int) => {
    const matchesSearch =
      int.config.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      int.config.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory =
      categoryFilter === "all" || int.config.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  // Get unique categories
  const categories = [...new Set(integrations.map((i) => i.config.category))];

  // Get connection count per integration
  const getConnectionCount = (integrationId: string) =>
    connections.filter((c) => c.integrationId === integrationId).length;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plug className="h-5 w-5" />
              Integrations Hub
            </DialogTitle>
            <DialogDescription>
              Connect third-party services to power your workflows
            </DialogDescription>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between gap-4 py-2">
              <TabsList>
                <TabsTrigger value="available">
                  Available ({integrations.length})
                </TabsTrigger>
                <TabsTrigger value="connections">
                  My Connections ({connections.length})
                </TabsTrigger>
              </TabsList>
              <Button variant="outline" size="sm" onClick={() => { fetchIntegrations(); fetchConnections(); }} disabled={loading}>
                <RefreshCw className={cn("h-4 w-4 mr-1", loading && "animate-spin")} />
                Refresh
              </Button>
            </div>

            <TabsContent value="available" className="flex-1 overflow-hidden flex flex-col mt-0">
              <div className="flex items-center gap-3 py-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search integrations..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="All categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {categories.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {categoryLabels[cat] || cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex-1 overflow-y-auto">
                {filteredIntegrations.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Plug className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p className="font-medium">No integrations found</p>
                    <p className="text-sm">Try adjusting your search or filters</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {filteredIntegrations.map((integration) => {
                      const connCount = getConnectionCount(integration.config.id);
                      return (
                        <div
                          key={integration.config.id}
                          className="border rounded-lg p-4 hover:border-primary/50 transition-colors"
                        >
                          <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                              <img
                                src={integration.config.icon}
                                alt={integration.config.name}
                                className="w-6 h-6"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = "none";
                                }}
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <h3 className="font-medium truncate">
                                  {integration.config.name}
                                </h3>
                                {connCount > 0 && (
                                  <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                                    {connCount} connected
                                  </span>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5">
                                {integration.config.description}
                              </p>
                              <div className="flex items-center gap-3 mt-2">
                                <span className="text-xs text-muted-foreground">
                                  {categoryLabels[integration.config.category] || integration.config.category}
                                </span>
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  {integration.config.authType === "oauth2" && <Link2 className="h-3 w-3" />}
                                  {integration.config.authType === "api_key" && <Key className="h-3 w-3" />}
                                  {integration.config.authType === "basic_auth" && <Key className="h-3 w-3" />}
                                  {integration.config.authType === "oauth2" ? "OAuth" :
                                   integration.config.authType === "api_key" ? "API Key" :
                                   integration.config.authType === "basic_auth" ? "Basic Auth" : ""}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {integration.actions.length} actions
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {integration.config.docsUrl && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  asChild
                                >
                                  <a
                                    href={integration.config.docsUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    <ExternalLink className="h-4 w-4" />
                                  </a>
                                </Button>
                              )}
                              <Button
                                size="sm"
                                onClick={() => openConnectDialog(integration)}
                              >
                                <Plus className="h-4 w-4 mr-1" />
                                Connect
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="connections" className="flex-1 overflow-hidden flex flex-col mt-0">
              <div className="flex-1 overflow-y-auto py-3">
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : connections.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Link2 className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p className="font-medium">No connections yet</p>
                    <p className="text-sm">Connect an integration to get started</p>
                    <Button
                      className="mt-4"
                      onClick={() => setActiveTab("available")}
                    >
                      Browse Integrations
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {connections.map((connection) => (
                      <div
                        key={connection._id}
                        className={cn(
                          "border rounded-lg p-4",
                          !connection.enabled && "opacity-60"
                        )}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                              {connection.integration?.icon && (
                                <img
                                  src={connection.integration.icon}
                                  alt={connection.integration.name}
                                  className="w-6 h-6"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = "none";
                                  }}
                                />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <h3 className="font-medium truncate">{connection.name}</h3>
                                {!connection.enabled && (
                                  <span className="text-xs bg-muted px-2 py-0.5 rounded">
                                    Disabled
                                  </span>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground truncate">
                                {connection.integration?.name || connection.integrationId}
                              </p>
                              <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                                {connection.metadata?.email ? (
                                  <span className="truncate max-w-[200px]">
                                    {String(connection.metadata.email)}
                                  </span>
                                ) : null}
                                {connection.lastUsedAt && (
                                  <span>
                                    Last used: {formatRelativeTime(connection.lastUsedAt)}
                                  </span>
                                )}
                                <span>
                                  Created: {formatRelativeTime(connection.createdAt)}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Switch
                              checked={connection.enabled}
                              onCheckedChange={() => handleToggleEnabled(connection)}
                            />
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleTestConnection(connection)}
                              disabled={testing === connection._id}
                              title="Test Connection"
                            >
                              {testing === connection._id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Play className="h-4 w-4" />
                              )}
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm">
                                  <ChevronDown className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() => handleTestConnection(connection)}
                                >
                                  Test Connection
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-red-600"
                                  onClick={() => {
                                    setConnectionToDelete(connection);
                                    setDeleteDialogOpen(true);
                                  }}
                                >
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Connect Dialog */}
      <Dialog open={connectDialogOpen} onOpenChange={setConnectDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedIntegration?.config.icon && (
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                  <img
                    src={selectedIntegration.config.icon}
                    alt={selectedIntegration.config.name}
                    className="w-5 h-5"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                </div>
              )}
              Connect {selectedIntegration?.config.name}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="connectionName">Connection Name</Label>
              <Input
                id="connectionName"
                placeholder="My Connection"
                value={connectionName}
                onChange={(e) => setConnectionName(e.target.value)}
              />
            </div>

            {selectedIntegration?.config.authType === "oauth2" && (
              <div className="bg-muted p-4 rounded-lg">
                <p className="text-sm text-muted-foreground">
                  You will be redirected to {selectedIntegration.config.name} to authorize the connection.
                </p>
              </div>
            )}

            {selectedIntegration?.config.authType === "api_key" && (
              <div className="space-y-2">
                <Label htmlFor="apiKey">API Key</Label>
                <Input
                  id="apiKey"
                  type="password"
                  placeholder="Enter your API key"
                  value={apiKeyValue}
                  onChange={(e) => setApiKeyValue(e.target.value)}
                />
                {selectedIntegration.config.apiKey?.instructions && (
                  <p className="text-xs text-muted-foreground">
                    {selectedIntegration.config.apiKey.instructions}
                  </p>
                )}
              </div>
            )}

            {selectedIntegration?.config.authType === "basic_auth" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="username">
                    {selectedIntegration.config.basicAuth?.usernameLabel || "Username"}
                  </Label>
                  <Input
                    id="username"
                    placeholder="Enter username"
                    value={usernameValue}
                    onChange={(e) => setUsernameValue(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">
                    {selectedIntegration.config.basicAuth?.passwordLabel || "Password"}
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter password"
                    value={passwordValue}
                    onChange={(e) => setPasswordValue(e.target.value)}
                  />
                </div>
                {selectedIntegration.config.basicAuth?.instructions && (
                  <p className="text-xs text-muted-foreground">
                    {selectedIntegration.config.basicAuth.instructions}
                  </p>
                )}
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConnectDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleConnect} disabled={connecting}>
              {connecting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Connecting...
                </>
              ) : selectedIntegration?.config.authType === "oauth2" ? (
                <>
                  <ExternalLink className="h-4 w-4 mr-1" />
                  Authorize
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-1" />
                  Connect
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Delete Connection
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{connectionToDelete?.name}&quot;?
              Workflows using this connection will stop working.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-1" />
                  Delete
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
