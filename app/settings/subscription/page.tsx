"use client";

import { useState, useEffect } from "react";
import {
  CreditCard,
  Crown,
  Sparkles,
  Zap,
  RefreshCw,
  Loader2,
  Check,
  AlertTriangle,
  Calendar,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Navbar } from "@/components/shared/Navbar";
import { PricingSection } from "@/components/shared/PricingSection";
import { cn } from "@/lib/utils";

// Format date to readable format like "December 27, 2025"
function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

interface SubscriptionData {
  subscription: {
    id: string;
    plan: "free" | "builder" | "team";
    status: string;
    creditTierIndex: number;
    cancelAtPeriodEnd: boolean;
  };
  usage: {
    monthlyCredits: number;
    creditsUsed: number;
    creditsRemaining: number;
    usagePercentage: number;
    periodStart: string;
    periodEnd: string;
    daysRemaining: number;
  };
}

export default function SubscriptionPage() {
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchSubscription();
  }, []);

  const fetchSubscription = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/subscription");
      if (res.ok) {
        const data = await res.json();
        setSubscription(data);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load subscription data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCheckout = async (plan: "builder" | "team", tierIndex: number) => {
    setIsCheckingOut(true);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan,
          tierIndex,
          returnUrl: window.location.href,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        window.location.href = data.checkoutUrl;
      } else if (res.status === 503 && data.error === "Payment products not configured") {
        toast({
          title: "Payments Not Configured",
          description: "The payment system is not set up yet. Please contact support.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to create checkout session",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create checkout session",
        variant: "destructive",
      });
    } finally {
      setIsCheckingOut(false);
    }
  };

  const handleCancelSubscription = async (immediately: boolean) => {
    setIsCancelling(true);
    try {
      const res = await fetch("/api/billing/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ immediately }),
      });

      const data = await res.json();

      if (res.ok) {
        toast({
          title: "Subscription Cancelled",
          description: data.message,
        });
        setCancelModalOpen(false);
        // Refresh subscription data
        await fetchSubscription();
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to cancel subscription",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to cancel subscription",
        variant: "destructive",
      });
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar title="Subscription" icon={CreditCard}>
        <Button variant="outline" size="sm" onClick={fetchSubscription} disabled={loading}>
          <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
          Refresh
        </Button>
      </Navbar>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="mb-6">
          <p className="text-muted-foreground">
            Manage your subscription plan and view credit usage
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : subscription ? (
          <div className="space-y-6">
            {/* Current Plan Card */}
            <div className="border rounded-lg p-6 bg-card">
              <div className="flex items-center gap-3">
                {subscription.subscription.plan === "team" ? (
                  <div className="h-12 w-12 rounded-lg bg-gradient-to-r from-purple-500 to-indigo-600 flex items-center justify-center">
                    <Crown className="h-6 w-6 text-white" />
                  </div>
                ) : subscription.subscription.plan === "builder" ? (
                  <div className="h-12 w-12 rounded-lg bg-gradient-to-r from-blue-500 to-cyan-500 flex items-center justify-center">
                    <Sparkles className="h-6 w-6 text-white" />
                  </div>
                ) : (
                  <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center">
                    <Zap className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
                <div>
                  <h3 className="text-2xl font-semibold capitalize">
                    {subscription.subscription.plan} Plan
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {subscription.subscription.status === "active" ? (
                      <span className="flex items-center gap-1 text-green-600">
                        <Check className="h-3.5 w-3.5" />
                        Active
                      </span>
                    ) : (
                      <span className="text-amber-600 capitalize">{subscription.subscription.status}</span>
                    )}
                    {subscription.subscription.cancelAtPeriodEnd && (
                      <span className="text-amber-600 ml-2">• Cancels at period end</span>
                    )}
                  </p>
                </div>
              </div>
            </div>

            {/* Credits Usage */}
            <div className="border rounded-lg p-6 bg-card">
              <h4 className="font-semibold text-lg mb-4">Credits Usage</h4>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-muted-foreground">
                      {subscription.usage.creditsUsed.toLocaleString()} / {subscription.usage.monthlyCredits.toLocaleString()} credits used
                    </span>
                    <span className="font-medium">{subscription.usage.usagePercentage}%</span>
                  </div>
                  <div className="h-3 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        subscription.usage.usagePercentage > 90
                          ? "bg-red-500"
                          : subscription.usage.usagePercentage > 70
                          ? "bg-amber-500"
                          : "bg-primary"
                      )}
                      style={{ width: `${Math.min(subscription.usage.usagePercentage, 100)}%` }}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4 pt-4">
                  <div className="text-center p-4 bg-muted/50 rounded-lg">
                    <p className="text-3xl font-bold">{subscription.usage.creditsRemaining.toLocaleString()}</p>
                    <p className="text-sm text-muted-foreground mt-1">Remaining</p>
                  </div>
                  <div className="text-center p-4 bg-muted/50 rounded-lg">
                    <p className="text-3xl font-bold">{subscription.usage.daysRemaining}</p>
                    <p className="text-sm text-muted-foreground mt-1">Days Left</p>
                  </div>
                  <div className="text-center p-4 bg-muted/50 rounded-lg">
                    <p className="text-3xl font-bold">{subscription.usage.monthlyCredits.toLocaleString()}</p>
                    <p className="text-sm text-muted-foreground mt-1">Monthly Credits</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground text-center pt-2">
                  Billing period: {formatDate(subscription.usage.periodStart)} - {formatDate(subscription.usage.periodEnd)}
                </p>
              </div>
            </div>

            {/* Credit Costs */}
            <div className="border rounded-lg p-6 bg-card">
              <h4 className="font-semibold text-lg mb-4">Credit Costs per Node</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  { id: "input", name: "Input", cost: 0, includedIn: ["free", "builder", "team"] },
                  { id: "output", name: "Output", cost: 0, includedIn: ["free", "builder", "team"] },
                  { id: "logic", name: "Logic", cost: 1, includedIn: ["free", "builder", "team"] },
                  { id: "api", name: "API", cost: 1, includedIn: ["free", "builder", "team"] },
                  { id: "webhook", name: "Webhook", cost: 1, includedIn: ["builder", "team"] },
                  { id: "integration", name: "Integration", cost: 1, includedIn: ["builder", "team"] },
                  { id: "ai", name: "AI", cost: 10, includedIn: ["builder", "team"] },
                ].map((node) => {
                  const isIncluded = node.includedIn.includes(subscription.subscription.plan);
                  return (
                    <div
                      key={node.id}
                      className={cn(
                        "flex items-center justify-between px-3 py-2 rounded-md",
                        isIncluded ? "bg-muted/50" : "bg-muted/20 opacity-60"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className={cn("text-sm font-medium", !isIncluded && "text-muted-foreground")}>
                          {node.name}
                        </span>
                        {!isIncluded && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400">
                            Pro
                          </span>
                        )}
                      </div>
                      <span className={cn(
                        "text-sm font-semibold",
                        node.cost === 0 ? "text-green-600" : node.cost >= 10 ? "text-amber-600" : "text-foreground"
                      )}>
                        {node.cost === 0 ? "Free" : `${node.cost} credits`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Plan Features */}
            <div className="border rounded-lg p-6 bg-card">
              <h4 className="font-semibold text-lg mb-2">Plan Features</h4>
              <p className="text-sm text-muted-foreground mb-4">
                Features available on your current plan
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[
                  { name: "AI Nodes", key: "aiNodes", description: "Use GPT-4, Claude, and other LLMs" },
                  { name: "Webhooks", key: "webhooks", description: "Trigger workflows via HTTP" },
                  { name: "App Integrations", key: "integrations", description: "Connect Slack, Gmail, etc." },
                  { name: "Import/Export", key: "importExport", description: "Share and backup workflows" },
                  { name: "AI Chatbot", key: "aiChatbot", description: "Get help building workflows" },
                  { name: "Team Collaboration", key: "teamCollaboration", description: "Work together on workflows" },
                  { name: "Advanced Analytics", key: "advancedAnalytics", description: "Detailed execution insights" },
                  { name: "Custom Integrations", key: "customIntegrations", description: "Build your own connectors" },
                  { name: "Priority Execution", key: "priorityExecution", description: "Faster workflow processing" },
                  { name: "Priority Support", key: "prioritySupport", description: "Get help when you need it" },
                ].map((feature) => {
                  const planFeatures = {
                    free: { aiNodes: false, webhooks: false, integrations: false, importExport: false, aiChatbot: false, teamCollaboration: false, advancedAnalytics: false, customIntegrations: false, priorityExecution: false, prioritySupport: false },
                    builder: { aiNodes: true, webhooks: true, integrations: true, importExport: true, aiChatbot: true, teamCollaboration: false, advancedAnalytics: false, customIntegrations: false, priorityExecution: false, prioritySupport: false },
                    team: { aiNodes: true, webhooks: true, integrations: true, importExport: true, aiChatbot: true, teamCollaboration: true, advancedAnalytics: true, customIntegrations: true, priorityExecution: true, prioritySupport: true },
                  };
                  const isEnabled = planFeatures[subscription.subscription.plan]?.[feature.key as keyof typeof planFeatures.free] ?? false;
                  return (
                    <div
                      key={feature.key}
                      className={cn(
                        "flex items-start gap-3 p-3 rounded-lg",
                        isEnabled ? "bg-green-50 dark:bg-green-950/30" : "bg-muted/30"
                      )}
                    >
                      <div className={cn(
                        "mt-0.5 h-5 w-5 rounded-full flex items-center justify-center flex-shrink-0",
                        isEnabled
                          ? "bg-green-500 text-white"
                          : "bg-muted-foreground/20 text-muted-foreground"
                      )}>
                        {isEnabled ? (
                          <Check className="h-3 w-3" />
                        ) : (
                          <span className="text-xs">✕</span>
                        )}
                      </div>
                      <div>
                        <p className={cn(
                          "font-medium text-sm",
                          !isEnabled && "text-muted-foreground"
                        )}>
                          {feature.name}
                        </p>
                        <p className={cn(
                          "text-xs",
                          isEnabled ? "text-muted-foreground" : "text-muted-foreground/60"
                        )}>
                          {feature.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Upgrade CTA for free and builder users */}
            {subscription.subscription.plan !== "team" && (
              <div className="border rounded-lg p-6 bg-gradient-to-r from-blue-500/10 to-indigo-500/10 border-blue-200 dark:border-blue-800">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold text-lg">
                      {subscription.subscription.plan === "free" ? "Upgrade to Pro" : "Upgrade to Team"}
                    </h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      {subscription.subscription.plan === "free"
                        ? "Get more credits, advanced features, and priority support."
                        : "Unlock team collaboration, advanced analytics, and priority support."}
                    </p>
                  </div>
                  <Button
                    className="bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700"
                    onClick={() => setUpgradeModalOpen(true)}
                  >
                    <Sparkles className="h-4 w-4 mr-2" />
                    Upgrade Now
                  </Button>
                </div>
              </div>
            )}

            {/* Cancel Subscription Section for paid users */}
            {subscription.subscription.plan !== "free" && !subscription.subscription.cancelAtPeriodEnd && (
              <div className="border rounded-lg p-6 bg-card">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold text-lg text-muted-foreground">Cancel Subscription</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      You can cancel your subscription at any time
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 border-red-200 dark:border-red-800"
                    onClick={() => setCancelModalOpen(true)}
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Cancel Plan
                  </Button>
                </div>
              </div>
            )}

            {/* Cancellation Pending Notice */}
            {subscription.subscription.cancelAtPeriodEnd && (
              <div className="border rounded-lg p-6 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="font-semibold text-lg text-amber-800 dark:text-amber-200">
                      Cancellation Scheduled
                    </h4>
                    <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                      Your subscription will be cancelled on {formatDate(subscription.usage.periodEnd)}.
                      You&apos;ll continue to have access to all features until then.
                    </p>
                  </div>
                </div>
              </div>
            )}

          </div>
        ) : (
          <div className="text-center py-16 text-muted-foreground">
            <CreditCard className="h-16 w-16 mx-auto mb-4 opacity-50" />
            <p className="font-medium text-lg">Unable to load subscription</p>
            <p className="text-sm mb-4">Please try again later</p>
            <Button onClick={fetchSubscription}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        )}
      </main>

      {/* Upgrade Modal */}
      <Dialog open={upgradeModalOpen} onOpenChange={setUpgradeModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-blue-500" />
              Choose Your Plan
            </DialogTitle>
          </DialogHeader>

          <PricingSection
            currentPlan={subscription?.subscription.plan}
            onCheckout={handleCheckout}
            isCheckingOut={isCheckingOut}
            variant="compact"
          />

          <Button
            variant="outline"
            className="w-full"
            onClick={() => setUpgradeModalOpen(false)}
          >
            Cancel
          </Button>
        </DialogContent>
      </Dialog>

      {/* Cancel Subscription Modal */}
      <Dialog open={cancelModalOpen} onOpenChange={(open) => !isCancelling && setCancelModalOpen(open)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Cancel Subscription
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel your {subscription?.subscription.plan} plan?
              Choose how you&apos;d like to proceed:
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-4">
            {/* Cancel at period end option */}
            <button
              onClick={() => handleCancelSubscription(false)}
              disabled={isCancelling}
              className="w-full p-4 text-left border rounded-lg hover:bg-muted/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="flex items-start gap-3">
                <Calendar className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium">Cancel at Period End</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Keep your access until {subscription?.usage.periodEnd ? formatDate(subscription.usage.periodEnd) : "the end of your billing period"}.
                    Your plan will automatically downgrade to Free after that.
                  </p>
                </div>
              </div>
            </button>

            {/* Cancel immediately option */}
            <button
              onClick={() => handleCancelSubscription(true)}
              disabled={isCancelling}
              className="w-full p-4 text-left border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="flex items-start gap-3">
                <XCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-red-600">Cancel Immediately</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Your subscription will be cancelled right now and you&apos;ll be
                    downgraded to the Free plan immediately. No refunds for remaining time.
                  </p>
                </div>
              </div>
            </button>
          </div>

          {isCancelling && (
            <div className="flex items-center justify-center gap-2 py-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Processing cancellation...</span>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCancelModalOpen(false)}
              disabled={isCancelling}
            >
              Keep My Plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
