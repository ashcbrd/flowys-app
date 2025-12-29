import mongoose, { Schema, Model } from "mongoose";
import { NodeData, EdgeData } from "../schemas";

// Marketplace listing categories
export const MARKETPLACE_CATEGORIES = [
  "automation",
  "ai",
  "data",
  "integration",
  "productivity",
  "marketing",
  "analytics",
  "other",
] as const;

export type MarketplaceCategory = (typeof MARKETPLACE_CATEGORIES)[number];

export type ListingStatus =
  | "draft"
  | "pending_review"
  | "published"
  | "suspended"
  | "archived";

// Fields that should never be exposed in previews
const SENSITIVE_FIELDS = [
  "apiKey",
  "api_key",
  "apikey",
  "token",
  "accessToken",
  "access_token",
  "refreshToken",
  "refresh_token",
  "secret",
  "password",
  "credentials",
  "authToken",
  "auth_token",
  "privateKey",
  "private_key",
  "connectionId",
  "webhookSecret",
  "bearerToken",
];

// Sanitized node for preview (excludes secrets but shows configuration)
export interface SanitizedNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: {
    label?: string;
    config?: Record<string, unknown>;
  };
}

// Workflow snapshot stored at listing time (immutable copy)
export interface WorkflowSnapshot {
  name: string;
  description?: string;
  nodes: NodeData[];
  edges: EdgeData[];
}

export interface IMarketplaceListing {
  _id: string;
  sellerId: string;
  workflowId: string; // Reference to original (for tracking only)

  // Listing details
  title: string;
  description: string;
  shortDescription: string;
  price: number; // In cents
  currency: string;

  // DodoPayments product ID (created per listing for exact pricing)
  dodoProductId?: string;

  // Categorization
  category: MarketplaceCategory;
  tags: string[];

  // Workflow snapshot (immutable copy of workflow at listing time)
  workflowSnapshot: WorkflowSnapshot;

  // Preview data (sanitized - no secrets)
  previewNodes: SanitizedNode[];
  previewEdges: EdgeData[];
  nodeCount: number;

  // Stats
  purchaseCount: number;
  viewCount: number;
  rating: number; // 0-5, calculated average
  reviewCount: number;

  // Status
  status: ListingStatus;
  publishedAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

const SanitizedNodeSchema = new Schema<SanitizedNode>(
  {
    id: { type: String, required: true },
    type: { type: String, required: true },
    position: {
      x: { type: Number, required: true },
      y: { type: Number, required: true },
    },
    data: {
      label: { type: String },
      config: { type: Schema.Types.Mixed },
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

// Full node schema for workflow snapshot (includes all data)
const FullNodeSchema = new Schema<NodeData>(
  {
    id: { type: String, required: true },
    type: { type: String, required: true },
    position: {
      x: { type: Number, required: true },
      y: { type: Number, required: true },
    },
    data: { type: Schema.Types.Mixed },
  },
  { _id: false }
);

const WorkflowSnapshotSchema = new Schema<WorkflowSnapshot>(
  {
    name: { type: String, required: true },
    description: { type: String },
    nodes: { type: [FullNodeSchema], required: true, default: [] },
    edges: { type: [EdgeDataSchema], required: true, default: [] },
  },
  { _id: false }
);

const MarketplaceListingSchema = new Schema<IMarketplaceListing>(
  {
    _id: { type: String, required: true },
    sellerId: { type: String, required: true, index: true },
    workflowId: { type: String, required: true, ref: "Workflow" },

    // Listing details
    title: { type: String, required: true, maxlength: 100 },
    description: { type: String, required: true, maxlength: 5000 },
    shortDescription: { type: String, required: true, maxlength: 160 },
    price: { type: Number, required: true, min: 100, max: 99900 }, // $1.00 - $999.00 in cents
    currency: { type: String, required: true, default: "USD" },

    // DodoPayments product ID
    dodoProductId: { type: String, index: true },

    // Categorization
    category: {
      type: String,
      enum: MARKETPLACE_CATEGORIES,
      required: true,
      default: "other",
    },
    tags: { type: [String], default: [], maxlength: 10 },

    // Workflow snapshot (immutable copy at listing time)
    workflowSnapshot: { type: WorkflowSnapshotSchema, required: true },

    // Preview data (sanitized - no secrets)
    previewNodes: { type: [SanitizedNodeSchema], default: [] },
    previewEdges: { type: [EdgeDataSchema], default: [] },
    nodeCount: { type: Number, required: true, default: 0 },

    // Stats
    purchaseCount: { type: Number, default: 0, min: 0 },
    viewCount: { type: Number, default: 0, min: 0 },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0, min: 0 },

    // Status
    status: {
      type: String,
      enum: ["draft", "pending_review", "published", "suspended", "archived"],
      default: "draft",
    },
    publishedAt: { type: Date },
  },
  {
    timestamps: true,
    _id: false,
  }
);

// Indexes for efficient queries
MarketplaceListingSchema.index({ status: 1, createdAt: -1 });
MarketplaceListingSchema.index({ status: 1, purchaseCount: -1 });
MarketplaceListingSchema.index({ status: 1, rating: -1 });
MarketplaceListingSchema.index({ status: 1, price: 1 });
MarketplaceListingSchema.index({ category: 1, status: 1 });
MarketplaceListingSchema.index({ sellerId: 1, status: 1 });
MarketplaceListingSchema.index({ tags: 1 });

// Text index for search
MarketplaceListingSchema.index(
  { title: "text", description: "text", shortDescription: "text" },
  { weights: { title: 10, shortDescription: 5, description: 1 } }
);

/**
 * Recursively sanitize an object, removing sensitive fields
 */
function sanitizeConfig(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    // Skip sensitive fields
    if (SENSITIVE_FIELDS.some((field) => key.toLowerCase().includes(field.toLowerCase()))) {
      continue;
    }

    // Handle nested objects
    if (value && typeof value === "object" && !Array.isArray(value)) {
      result[key] = sanitizeConfig(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      // Handle arrays - sanitize objects within
      result[key] = value.map((item) =>
        item && typeof item === "object" && !Array.isArray(item)
          ? sanitizeConfig(item as Record<string, unknown>)
          : item
      );
    } else {
      // Keep primitive values
      result[key] = value;
    }
  }

  return result;
}

// Helper function to sanitize nodes for preview
export function sanitizeNodesForPreview(nodes: NodeData[]): SanitizedNode[] {
  return nodes.map((node) => ({
    id: node.id,
    type: node.type,
    position: node.position,
    data: {
      label: node.data?.label,
      config: node.data?.config ? sanitizeConfig(node.data.config) : undefined,
    },
  }));
}

export const MarketplaceListing: Model<IMarketplaceListing> =
  mongoose.models.MarketplaceListing ||
  mongoose.model<IMarketplaceListing>(
    "MarketplaceListing",
    MarketplaceListingSchema
  );
