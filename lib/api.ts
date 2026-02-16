export interface Workflow {
  id: string;
  name: string;
  description?: string;
  nodes: NodeData[];
  edges: EdgeData[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowVersion {
  id: string;
  workflowId: string;
  version: number;
  name: string;
  description?: string;
  message?: string;
  nodes?: NodeData[];
  edges?: EdgeData[];
  nodeCount?: number;
  edgeCount?: number;
  createdAt: string;
  createdBy?: string;
}

export interface NodeData {
  id: string;
  type: "input" | "api" | "ai" | "logic" | "output" | "webhook" | "integration";
  position: { x: number; y: number };
  data: {
    label: string;
    config: Record<string, unknown>;
  };
}

export interface EdgeData {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface ErrorAnalysis {
  summary: string;
  failedNode: string;
  failedNodeType: string;
  possibleCauses: string[];
  suggestedFixes: string[];
  affectedNodes: string[];
}

export interface Execution {
  id: string;
  workflowId: string;
  status: "pending" | "running" | "completed" | "failed";
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  logs?: ExecutionLog[];
  error?: string;
  errorAnalysis?: ErrorAnalysis;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

export interface ExecutionLog {
  nodeId: string;
  nodeName: string;
  status: "pending" | "running" | "completed" | "failed";
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  startedAt: string;
  completedAt?: string;
  duration?: number;
}

export type WebhookEvent =
  | "workflow.started"
  | "workflow.completed"
  | "workflow.failed"
  | "node.started"
  | "node.completed"
  | "node.failed"
  | "manual";

export interface Webhook {
  id: string;
  name: string;
  description?: string;
  type: "incoming" | "outgoing";
  workflowId?: string;
  slug?: string;
  secret?: string;
  url?: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
  events?: WebhookEvent[];
  enabled: boolean;
  retryCount: number;
  retryDelay: number;
  timeout: number;
  lastTriggeredAt?: string;
  successCount: number;
  failureCount: number;
  triggerUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookLog {
  id: string;
  webhookId: string;
  workflowId?: string;
  executionId?: string;
  direction: "incoming" | "outgoing";
  event?: string;
  method: string;
  url: string;
  status: "pending" | "success" | "failed" | "retrying";
  statusCode?: number;
  error?: string;
  duration?: number;
  attemptNumber: number;
  sourceIp?: string;
  createdAt: string;
}

export type ApiKeyScope =
  | "workflows:read"
  | "workflows:write"
  | "workflows:execute"
  | "executions:read"
  | "webhooks:read"
  | "webhooks:write"
  | "full_access";

export interface ApiKey {
  id: string;
  name: string;
  description?: string;
  key?: string; // Only returned on creation
  keyPrefix: string;
  scopes: ApiKeyScope[];
  rateLimit: number;
  rateLimitWindow: number;
  allowedIps?: string[];
  allowedOrigins?: string[];
  enabled: boolean;
  lastUsedAt?: string;
  usageCount: number;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type ScheduleFrequency =
  | "every_minute"
  | "every_5_minutes"
  | "every_15_minutes"
  | "every_30_minutes"
  | "hourly"
  | "daily"
  | "weekly"
  | "monthly"
  | "custom";

export interface Schedule {
  id: string;
  workflowId: string;
  name: string;
  description?: string;
  frequency: ScheduleFrequency;
  cronExpression: string;
  timezone: string;
  input?: Record<string, unknown>;
  enabled: boolean;
  lastRunAt?: string;
  nextRunAt?: string;
  lastRunStatus?: "success" | "failed";
  lastRunError?: string;
  lastExecutionId?: string;
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  createdAt: string;
  updatedAt: string;
}

async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(endpoint, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || "Request failed");
  }

  if (res.status === 204) {
    return {} as T;
  }

  return res.json();
}

export const api = {
  workflows: {
    list: () => fetchApi<Workflow[]>("/api/workflows"),
    get: (id: string) => fetchApi<Workflow>(`/api/workflows/${id}`),
    create: (data: Omit<Workflow, "id" | "createdAt" | "updatedAt">) =>
      fetchApi<Workflow>("/api/workflows", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (id: string, data: Omit<Workflow, "id" | "createdAt" | "updatedAt">) =>
      fetchApi<Workflow>(`/api/workflows/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      fetchApi<void>(`/api/workflows/${id}`, { method: "DELETE" }),
    execute: (id: string, data?: { input?: Record<string, unknown>; nodes?: NodeData[]; edges?: EdgeData[] }) =>
      fetchApi<Execution>(`/api/workflows/${id}/execute`, {
        method: "POST",
        body: JSON.stringify(data || {}),
      }),
    duplicate: (id: string, name?: string) =>
      fetchApi<Workflow>(`/api/workflows/${id}/duplicate`, {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    versions: {
      list: (id: string) =>
        fetchApi<{
          workflowId: string;
          currentVersion: number;
          versions: WorkflowVersion[];
        }>(`/api/workflows/${id}/versions`),
      create: (id: string, message?: string) =>
        fetchApi<WorkflowVersion>(`/api/workflows/${id}/versions`, {
          method: "POST",
          body: JSON.stringify({ message }),
        }),
      get: (id: string, versionId: string) =>
        fetchApi<WorkflowVersion>(`/api/workflows/${id}/versions/${versionId}`),
      restore: (id: string, versionId: string) =>
        fetchApi<{
          success: boolean;
          message: string;
          workflow: Workflow;
          restoredFromVersion: number;
          savedAsVersion: number;
        }>(`/api/workflows/${id}/versions/${versionId}`, {
          method: "POST",
        }),
      delete: (id: string, versionId: string) =>
        fetchApi<{ success: boolean }>(`/api/workflows/${id}/versions/${versionId}`, {
          method: "DELETE",
        }),
    },
  },
  executions: {
    list: (limit?: number) =>
      fetchApi<Execution[]>(`/api/executions?limit=${limit || 50}`),
    get: (id: string) => fetchApi<Execution>(`/api/executions/${id}`),
    byWorkflow: (workflowId: string) =>
      fetchApi<Execution[]>(`/api/executions/workflow/${workflowId}`),
  },
  nodes: {
    types: () =>
      fetchApi<
        Array<{
          type: string;
          name: string;
          description: string;
          configSchema: Record<string, unknown>;
        }>
      >("/api/nodes"),
  },
  flux: {
    suggestions: () =>
      fetchApi<{ suggestions: string[] }>("/api/flux"),
    send: (data: {
      message: string;
      workflow?: { nodes?: NodeData[]; edges?: EdgeData[] };
      executionLogs?: ExecutionLog[];
      lastExecution?: { status: string; error?: string | null; output?: unknown } | null;
      conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
    }) =>
      fetchApi<{
        message: string;
        suggestions: string[];
        workflowGeneration?: {
          description: string;
          nodes: NodeData[];
          edges: EdgeData[];
        };
        errorAnalysis?: {
          hasError: boolean;
          errorNode?: string;
          errorMessage?: string;
          errorReason?: string;
        };
        suggestedFix?: {
          explanation: string;
          manualSteps: string[];
          autoFix?: { type: string; description: string };
        };
      }>("/api/flux", {
        method: "POST",
        body: JSON.stringify(data),
      }),
  },
  health: {
    check: () =>
      fetchApi<{ status: string; timestamp: string; version: string }>("/api/health"),
  },
  webhooks: {
    list: (params?: { type?: string; workflowId?: string; enabled?: boolean }) => {
      const searchParams = new URLSearchParams();
      if (params?.type) searchParams.set("type", params.type);
      if (params?.workflowId) searchParams.set("workflowId", params.workflowId);
      if (params?.enabled !== undefined) searchParams.set("enabled", String(params.enabled));
      const query = searchParams.toString();
      return fetchApi<Webhook[]>(`/api/webhooks${query ? `?${query}` : ""}`);
    },
    get: (id: string) => fetchApi<Webhook>(`/api/webhooks/${id}`),
    create: (data: {
      name: string;
      description?: string;
      type: "incoming" | "outgoing";
      workflowId?: string;
      url?: string;
      method?: string;
      headers?: Record<string, string>;
      events?: WebhookEvent[];
      enabled?: boolean;
      retryCount?: number;
      retryDelay?: number;
      timeout?: number;
    }) =>
      fetchApi<Webhook>("/api/webhooks", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (
      id: string,
      data: Partial<{
        name: string;
        description: string;
        workflowId: string;
        url: string;
        method: string;
        headers: Record<string, string>;
        events: WebhookEvent[];
        enabled: boolean;
        retryCount: number;
        retryDelay: number;
        timeout: number;
      }>
    ) =>
      fetchApi<Webhook>(`/api/webhooks/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      fetchApi<{ success: boolean }>(`/api/webhooks/${id}`, { method: "DELETE" }),
    test: (id: string) =>
      fetchApi<{
        success: boolean;
        webhookId: string;
        logId: string;
        statusCode?: number;
        duration?: number;
        error?: string;
      }>(`/api/webhooks/${id}/test`, { method: "POST" }),
    logs: (id: string, params?: { limit?: number; offset?: number }) => {
      const searchParams = new URLSearchParams();
      if (params?.limit) searchParams.set("limit", String(params.limit));
      if (params?.offset) searchParams.set("offset", String(params.offset));
      const query = searchParams.toString();
      return fetchApi<{
        logs: WebhookLog[];
        total: number;
        limit: number;
        offset: number;
      }>(`/api/webhooks/${id}/logs${query ? `?${query}` : ""}`);
    },
  },
  apiKeys: {
    list: () => fetchApi<ApiKey[]>("/api/api-keys"),
    get: (id: string) => fetchApi<ApiKey>(`/api/api-keys/${id}`),
    create: (data: {
      name: string;
      description?: string;
      scopes?: ApiKeyScope[];
      rateLimit?: number;
      rateLimitWindow?: number;
      allowedIps?: string[];
      allowedOrigins?: string[];
      expiresAt?: string;
    }) =>
      fetchApi<ApiKey & { key: string; message: string }>("/api/api-keys", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (
      id: string,
      data: Partial<{
        name: string;
        description: string;
        scopes: ApiKeyScope[];
        rateLimit: number;
        rateLimitWindow: number;
        allowedIps: string[];
        allowedOrigins: string[];
        enabled: boolean;
        expiresAt: string | null;
      }>
    ) =>
      fetchApi<ApiKey>(`/api/api-keys/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      fetchApi<{ success: boolean }>(`/api/api-keys/${id}`, { method: "DELETE" }),
  },
  schedules: {
    list: (params?: { workflowId?: string; enabled?: boolean }) => {
      const searchParams = new URLSearchParams();
      if (params?.workflowId) searchParams.set("workflowId", params.workflowId);
      if (params?.enabled !== undefined) searchParams.set("enabled", String(params.enabled));
      const query = searchParams.toString();
      return fetchApi<Schedule[]>(`/api/schedules${query ? `?${query}` : ""}`);
    },
    get: (id: string) => fetchApi<Schedule>(`/api/schedules/${id}`),
    create: (data: {
      workflowId: string;
      name: string;
      description?: string;
      frequency: ScheduleFrequency;
      cronExpression?: string;
      timezone?: string;
      input?: Record<string, unknown>;
      enabled?: boolean;
      hour?: number;
      minute?: number;
      dayOfWeek?: number;
      dayOfMonth?: number;
    }) =>
      fetchApi<Schedule>("/api/schedules", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (
      id: string,
      data: Partial<{
        name: string;
        description: string;
        frequency: ScheduleFrequency;
        cronExpression: string;
        timezone: string;
        input: Record<string, unknown>;
        enabled: boolean;
        hour: number;
        minute: number;
        dayOfWeek: number;
        dayOfMonth: number;
      }>
    ) =>
      fetchApi<Schedule>(`/api/schedules/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      fetchApi<{ success: boolean }>(`/api/schedules/${id}`, { method: "DELETE" }),
    trigger: (id: string) =>
      fetchApi<{ success: boolean; executionId?: string; error?: string }>(`/api/schedules/${id}`, {
        method: "POST",
      }),
  },
};
