"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Plug,
  Plus,
  Loader2,
  Trash2,
  RefreshCw,
  ExternalLink,
  Search,
  ChevronDown,
  Key,
  Link2,
  AlertTriangle,
  Play,
  CheckCircle,
  Lock,
  Sparkles,
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
import { Navbar } from "@/components/shared/Navbar";
import { cn } from "@/lib/utils";
import { useUpgradeModal } from "@/components/shared/UpgradeModal";

type PlanType = "free" | "builder" | "team";

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

export default function IntegrationsPage() {
  const router = useRouter();
  const [integrations, setIntegrations] = useState<IntegrationDefinition[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("available");
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [userPlan, setUserPlan] = useState<PlanType | null>(null);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const { openUpgradeModal } = useUpgradeModal();

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

  // Check user plan access
  useEffect(() => {
    const checkAccess = async () => {
      try {
        const res = await fetch("/api/subscription");
        if (res.ok) {
          const data = await res.json();
          const plan = data.subscription?.plan || "free";
          setUserPlan(plan);
          if (plan === "free") {
            setCheckingAccess(false);
            return;
          }
        }
      } catch {
        setUserPlan("free");
      }
      setCheckingAccess(false);
    };
    checkAccess();
  }, []);

  useEffect(() => {
    if (userPlan && userPlan !== "free") {
      fetchIntegrations();
      fetchConnections();
    }
  }, [userPlan]);

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

  const filteredIntegrations = integrations.filter((int) => {
    const matchesSearch =
      int.config.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      int.config.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory =
      categoryFilter === "all" || int.config.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const categories = [...new Set(integrations.map((i) => i.config.category))];

  const getConnectionCount = (integrationId: string) =>
    connections.filter((c) => c.integrationId === integrationId).length;

  // Show loading while checking access
  if (checkingAccess) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar title="App Integrations" icon={Plug} />
        <div className="flex items-center justify-center py-32">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  // Show upgrade prompt for free users
  if (userPlan === "free") {
    return (
      <div className="min-h-screen bg-background">
        <Navbar title="App Integrations" icon={Plug} />
        <main className="max-w-2xl mx-auto px-6 py-16">
          <div className="text-center">
            <div className="w-20 h-20 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center mx-auto mb-6">
              <Lock className="h-10 w-10 text-amber-600 dark:text-amber-400" />
            </div>
            <h1 className="text-2xl font-bold mb-2">App Integrations Require an Upgrade</h1>
            <p className="text-muted-foreground mb-8 max-w-md mx-auto">
              App Integrations are available on the Builder and Team plans. Upgrade to connect Slack, GitHub, Gmail, and more to your workflows.
            </p>
            <Button
              onClick={openUpgradeModal}
              className="bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700"
            >
              <Sparkles className="h-4 w-4 mr-2" />
              Upgrade Now
            </Button>
            <Button
              variant="outline"
              className="ml-3"
              onClick={() => router.push("/workflow")}
            >
              Back to Editor
            </Button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar title="App Integrations" icon={Plug}>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            fetchIntegrations();
            fetchConnections();
          }}
          disabled={loading}
        >
          <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
          Refresh
        </Button>
      </Navbar>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6">
          <p className="text-muted-foreground">
            Connect third-party services to power your workflows
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="available">
              Available Integrations ({integrations.length})
            </TabsTrigger>
            <TabsTrigger value="connections">
              My Connections ({connections.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="available" className="mt-0">
            <div className="flex items-center gap-4 mb-6">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search integrations..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[200px]">
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

            {filteredIntegrations.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Plug className="h-16 w-16 mx-auto mb-4 opacity-50" />
                <p className="font-medium text-lg">No integrations found</p>
                <p className="text-sm">Try adjusting your search or filters</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredIntegrations.map((integration) => {
                  const connCount = getConnectionCount(integration.config.id);
                  return (
                    <div
                      key={integration.config.id}
                      className="border rounded-lg p-5 hover:border-primary/50 transition-colors bg-card"
                    >
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                          <img
                            src={integration.config.icon}
                            alt={integration.config.name}
                            className="w-7 h-7"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = "none";
                            }}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold truncate">
                              {integration.config.name}
                            </h3>
                            {connCount > 0 && (
                              <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded flex items-center gap-1">
                                <CheckCircle className="h-3 w-3" />
                                {connCount}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {integration.config.description}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between mt-4 pt-4 border-t">
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            {integration.config.authType === "oauth2" && <Link2 className="h-3 w-3" />}
                            {integration.config.authType === "api_key" && <Key className="h-3 w-3" />}
                            {integration.config.authType === "basic_auth" && <Key className="h-3 w-3" />}
                            {integration.config.authType === "oauth2"
                              ? "OAuth"
                              : integration.config.authType === "api_key"
                              ? "API Key"
                              : integration.config.authType === "basic_auth"
                              ? "Basic Auth"
                              : ""}
                          </span>
                          <span>{integration.actions.length} actions</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {integration.config.docsUrl && (
                            <Button variant="ghost" size="sm" asChild>
                              <a
                                href={integration.config.docsUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            </Button>
                          )}
                          <Button size="sm" onClick={() => openConnectDialog(integration)}>
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
          </TabsContent>

          <TabsContent value="connections" className="mt-0">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : connections.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Link2 className="h-16 w-16 mx-auto mb-4 opacity-50" />
                <p className="font-medium text-lg">No connections yet</p>
                <p className="text-sm mb-4">Connect an integration to get started</p>
                <Button onClick={() => setActiveTab("available")}>
                  Browse Integrations
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {connections.map((connection) => (
                  <div
                    key={connection._id}
                    className={cn(
                      "border rounded-lg p-5 bg-card",
                      !connection.enabled && "opacity-60"
                    )}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-4 min-w-0">
                        <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                          {connection.integration?.icon && (
                            <img
                              src={connection.integration.icon}
                              alt={connection.integration.name}
                              className="w-7 h-7"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = "none";
                              }}
                            />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold truncate">{connection.name}</h3>
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
                              <span>Last used: {formatRelativeTime(connection.lastUsedAt)}</span>
                            )}
                            <span>Created: {formatRelativeTime(connection.createdAt)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
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
                            <DropdownMenuItem onClick={() => handleTestConnection(connection)}>
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
          </TabsContent>
        </Tabs>
      </main>

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
                  You will be redirected to {selectedIntegration.config.name} to authorize the
                  connection.
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
              Are you sure you want to delete &quot;{connectionToDelete?.name}&quot;? Workflows
              using this connection will stop working.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>
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
    </div>
  );
}
