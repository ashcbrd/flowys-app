import mongoose, { Schema, Model } from "mongoose";

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

export interface IWorkflow {
  _id: string;
  userId: string;
  name: string;
  description?: string;
  nodes: NodeData[];
  edges: EdgeData[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IExecution {
  _id: string;
  workflowId: string;
  status: "pending" | "running" | "completed" | "failed";
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  logs?: ExecutionLog[];
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
  triggeredBy?: "manual" | "api" | "webhook" | "schedule";
  webhookId?: string;
  apiKeyId?: string;
  createdAt: Date;
}

export interface IPromptVersion {
  _id: string;
  nodeId: string;
  workflowId: string;
  version: number;
  systemPrompt?: string;
  userPromptTemplate: string;
  temperature: number;
  maxTokens: number;
  outputSchema?: Record<string, unknown>;
  createdAt: Date;
}

const NodeDataSchema = new Schema<NodeData>(
  {
    id: { type: String, required: true },
    type: {
      type: String,
      enum: ["input", "api", "ai", "logic", "output", "webhook", "integration"],
      required: true,
    },
    position: {
      x: { type: Number, required: true },
      y: { type: Number, required: true },
    },
    data: {
      label: { type: String, required: true },
      config: { type: Schema.Types.Mixed, default: {} },
    },
  },
  { _id: false }
);

const EdgeDataSchema = new Schema<EdgeData>(
  {
    id: { type: String, required: true },
    source: { type: String, required: true },
    target: { type: String, required: true },
    sourceHandle: { type: String },
    targetHandle: { type: String },
  },
  { _id: false }
);

const ExecutionLogSchema = new Schema<ExecutionLog>(
  {
    nodeId: { type: String, required: true },
    nodeName: { type: String, required: true },
    status: {
      type: String,
      enum: ["pending", "running", "completed", "failed"],
      required: true,
    },
    input: { type: Schema.Types.Mixed },
    output: { type: Schema.Types.Mixed },
    error: { type: String },
    startedAt: { type: String, required: true },
    completedAt: { type: String },
    duration: { type: Number },
  },
  { _id: false }
);

const WorkflowSchema = new Schema<IWorkflow>(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true, index: true },
    name: { type: String, required: true, maxlength: 100 },
    description: { type: String, maxlength: 500 },
    nodes: { type: [NodeDataSchema], required: true, default: [] },
    edges: { type: [EdgeDataSchema], required: true, default: [] },
  },
  {
    timestamps: true,
    _id: false,
  }
);

const ExecutionSchema = new Schema<IExecution>(
  {
    _id: { type: String, required: true },
    workflowId: { type: String, required: true, ref: "Workflow" },
    status: {
      type: String,
      enum: ["pending", "running", "completed", "failed"],
      required: true,
      default: "pending",
    },
    input: { type: Schema.Types.Mixed },
    output: { type: Schema.Types.Mixed },
    logs: { type: [ExecutionLogSchema], default: [] },
    error: { type: String },
    startedAt: { type: Date },
    completedAt: { type: Date },
    triggeredBy: {
      type: String,
      enum: ["manual", "api", "webhook", "schedule"],
      default: "manual",
    },
    webhookId: { type: String, ref: "Webhook" },
    apiKeyId: { type: String, ref: "ApiKey" },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    _id: false,
  }
);

const PromptVersionSchema = new Schema<IPromptVersion>(
  {
    _id: { type: String, required: true },
    nodeId: { type: String, required: true },
    workflowId: { type: String, required: true, ref: "Workflow" },
    version: { type: Number, required: true },
    systemPrompt: { type: String },
    userPromptTemplate: { type: String, required: true },
    temperature: { type: Number, default: 0.7 },
    maxTokens: { type: Number, default: 2048 },
    outputSchema: { type: Schema.Types.Mixed },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    _id: false,
  }
);

WorkflowSchema.index({ createdAt: -1 });
WorkflowSchema.index({ userId: 1, createdAt: -1 });
ExecutionSchema.index({ workflowId: 1, createdAt: -1 });
ExecutionSchema.index({ createdAt: -1 });
PromptVersionSchema.index({ workflowId: 1, nodeId: 1, version: -1 });

export const Workflow: Model<IWorkflow> =
  mongoose.models.Workflow || mongoose.model<IWorkflow>("Workflow", WorkflowSchema);

export const Execution: Model<IExecution> =
  mongoose.models.Execution || mongoose.model<IExecution>("Execution", ExecutionSchema);

export const PromptVersion: Model<IPromptVersion> =
  mongoose.models.PromptVersion ||
  mongoose.model<IPromptVersion>("PromptVersion", PromptVersionSchema);
