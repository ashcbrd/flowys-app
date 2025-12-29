import mongoose, { Schema, Model } from "mongoose";

// Subscription plan types
export type PlanType = "free" | "builder" | "team";

// Credit tier options for paid plans
export interface CreditTier {
  credits: number;
  builderPrice: number;
  teamPrice: number;
}

export const CREDIT_TIERS: CreditTier[] = [
  { credits: 500, builderPrice: 9, teamPrice: 19 },
  { credits: 1000, builderPrice: 15, teamPrice: 29 },
  { credits: 2500, builderPrice: 29, teamPrice: 49 },
  { credits: 5000, builderPrice: 49, teamPrice: 79 },
  { credits: 10000, builderPrice: 79, teamPrice: 129 },
  { credits: 25000, builderPrice: 149, teamPrice: 229 },
  { credits: 50000, builderPrice: 249, teamPrice: 399 },
];

// Plan limits configuration
export interface PlanLimits {
  maxWorkflows: number;
  maxNodesPerWorkflow: number;
  monthlyCredits: number;
  allowedNodeTypes: string[];
  features: {
    aiNodes: boolean;
    webhooks: boolean;
    integrations: boolean;
    importExport: boolean;
    aiChatbot: boolean;
    teamCollaboration: boolean;
    advancedAnalytics: boolean;
    customIntegrations: boolean;
    priorityExecution: boolean;
    prioritySupport: boolean;
  };
}

export const PLAN_LIMITS: Record<PlanType, PlanLimits> = {
  free: {
    maxWorkflows: 3,
    maxNodesPerWorkflow: 4,
    monthlyCredits: 100,
    allowedNodeTypes: ["input", "logic", "api", "output"],
    features: {
      aiNodes: false,
      webhooks: false,
      integrations: false,
      importExport: false,
      aiChatbot: false,
      teamCollaboration: false,
      advancedAnalytics: false,
      customIntegrations: false,
      priorityExecution: false,
      prioritySupport: false,
    },
  },
  builder: {
    maxWorkflows: 10,
    maxNodesPerWorkflow: 25,
    monthlyCredits: 0, // Set based on selected tier
    allowedNodeTypes: ["input", "logic", "api", "output", "ai", "webhook", "integration"],
    features: {
      aiNodes: true,
      webhooks: true,
      integrations: true,
      importExport: true,
      aiChatbot: true,
      teamCollaboration: false,
      advancedAnalytics: false,
      customIntegrations: false,
      priorityExecution: false,
      prioritySupport: false,
    },
  },
  team: {
    maxWorkflows: -1, // Unlimited
    maxNodesPerWorkflow: -1, // Unlimited
    monthlyCredits: 0, // Set based on selected tier
    allowedNodeTypes: ["input", "logic", "api", "output", "ai", "webhook", "integration"],
    features: {
      aiNodes: true,
      webhooks: true,
      integrations: true,
      importExport: true,
      aiChatbot: true,
      teamCollaboration: true,
      advancedAnalytics: true,
      customIntegrations: true,
      priorityExecution: true,
      prioritySupport: true,
    },
  },
};

// Credit costs per node type
export const CREDIT_COSTS: Record<string, number> = {
  input: 0, // Free - just receiving data
  output: 0, // Free - just formatting output
  logic: 1, // Basic transformation
  api: 1, // External API call
  ai: 10, // AI processing (LLM call)
  webhook: 1, // Webhook trigger/send
  integration: 1, // Integration call
};

export interface ISubscription {
  _id: string;
  userId: string;
  plan: PlanType;
  creditTierIndex: number; // Index into CREDIT_TIERS array (0-6)
  monthlyCredits: number; // Total credits per month
  creditsUsed: number; // Credits used this period
  creditsRemaining: number; // Credits remaining this period
  periodStart: Date; // Start of current billing period
  periodEnd: Date; // End of current billing period
  status: "active" | "canceled" | "past_due" | "on_hold" | "pending";
  // DodoPayments integration fields
  dodoCustomerId?: string;
  dodoSubscriptionId?: string;
  dodoProductId?: string;
  cancelAtPeriodEnd: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const SubscriptionSchema = new Schema<ISubscription>(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true, unique: true, index: true },
    plan: {
      type: String,
      enum: ["free", "builder", "team"],
      required: true,
      default: "free",
    },
    creditTierIndex: { type: Number, default: 0, min: 0, max: 6 },
    monthlyCredits: { type: Number, required: true, default: 100 },
    creditsUsed: { type: Number, default: 0, min: 0 },
    creditsRemaining: { type: Number, required: true, default: 100 },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    status: {
      type: String,
      enum: ["active", "canceled", "past_due", "on_hold", "pending"],
      default: "active",
    },
    // DodoPayments integration fields
    dodoCustomerId: { type: String, sparse: true, index: true },
    dodoSubscriptionId: { type: String, sparse: true, index: true },
    dodoProductId: { type: String, sparse: true },
    cancelAtPeriodEnd: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    _id: false,
  }
);

// Indexes
SubscriptionSchema.index({ periodEnd: 1 }); // For finding subscriptions to renew
SubscriptionSchema.index({ status: 1 });

export const Subscription: Model<ISubscription> =
  mongoose.models.Subscription ||
  mongoose.model<ISubscription>("Subscription", SubscriptionSchema);
