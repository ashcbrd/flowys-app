import mongoose, { Schema, Model } from "mongoose";
import { NodeData, EdgeData } from "../schemas";

export interface IWorkflowVersion {
  _id: mongoose.Types.ObjectId;
  workflowId: string;
  version: number;
  name: string;
  description?: string;
  nodes: NodeData[];
  edges: EdgeData[];
  createdAt: Date;
  createdBy?: string;
  message?: string; // Version commit message
}

const NodeDataSchema = new Schema(
  {
    id: { type: String, required: true },
    type: {
      type: String,
      enum: ["input", "api", "ai", "logic", "output", "webhook"],
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

const EdgeDataSchema = new Schema(
  {
    id: { type: String, required: true },
    source: { type: String, required: true },
    target: { type: String, required: true },
    sourceHandle: { type: String },
    targetHandle: { type: String },
  },
  { _id: false }
);

const WorkflowVersionSchema = new Schema<IWorkflowVersion>(
  {
    workflowId: { type: String, required: true, ref: "Workflow" },
    version: { type: Number, required: true },
    name: { type: String, required: true },
    description: { type: String },
    nodes: { type: [NodeDataSchema], required: true, default: [] },
    edges: { type: [EdgeDataSchema], required: true, default: [] },
    createdBy: { type: String },
    message: { type: String },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// Compound index for efficient queries
WorkflowVersionSchema.index({ workflowId: 1, version: -1 });
WorkflowVersionSchema.index({ workflowId: 1, createdAt: -1 });

export const WorkflowVersion: Model<IWorkflowVersion> =
  mongoose.models.WorkflowVersion ||
  mongoose.model<IWorkflowVersion>("WorkflowVersion", WorkflowVersionSchema);
