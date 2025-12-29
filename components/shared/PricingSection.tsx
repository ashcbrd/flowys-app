"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Check, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

// Pricing tiers configuration
const PRICING_TIERS = [
  { credits: 500, builderPrice: 9, teamPrice: 19 },
  { credits: 1000, builderPrice: 15, teamPrice: 29 },
  { credits: 2500, builderPrice: 29, teamPrice: 49 },
  { credits: 5000, builderPrice: 49, teamPrice: 79 },
  { credits: 10000, builderPrice: 79, teamPrice: 129 },
  { credits: 25000, builderPrice: 149, teamPrice: 229 },
  { credits: 50000, builderPrice: 249, teamPrice: 399 },
];

interface PricingSectionProps {
  currentPlan?: "free" | "builder" | "team";
  onCheckout?: (plan: "builder" | "team", tierIndex: number) => Promise<void>;
  isCheckingOut?: boolean;
  variant?: "landing" | "page" | "compact";
  showHeader?: boolean;
  showCreditsExplainer?: boolean;
  showEnterpriseCTA?: boolean;
}

export function PricingSection({
  currentPlan,
  onCheckout,
  isCheckingOut = false,
  variant = "landing",
  showHeader = true,
  showCreditsExplainer = true,
  showEnterpriseCTA = true,
}: PricingSectionProps) {
  const router = useRouter();
  const { data: session, status } = useSession();
  const { toast } = useToast();
  const [selectedTierIndex, setSelectedTierIndex] = useState(2); // Default to 2,500 credits
  const [checkingOutPlan, setCheckingOutPlan] = useState<"builder" | "team" | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<"builder" | "team">("builder");
  const [isRedirecting, setIsRedirecting] = useState(false);
  const selectedTier = PRICING_TIERS[selectedTierIndex];

  const formatCredits = (credits: number) => {
    return credits >= 1000 ? `${(credits / 1000).toFixed(credits % 1000 === 0 ? 0 : 1)}k` : credits.toString();
  };

  const handleCheckout = async (plan: "builder" | "team") => {
    if (!onCheckout) return;
    setCheckingOutPlan(plan);
    try {
      await onCheckout(plan, selectedTierIndex);
    } finally {
      setCheckingOutPlan(null);
    }
  };

  // Handle plan selection on landing page (no onCheckout provided)
  const handleLandingCheckout = async (plan: "builder" | "team") => {
    // If not logged in, open login in new tab with return URL
    if (status === "unauthenticated" || !session) {
      const returnUrl = encodeURIComponent(`/pricing?plan=${plan}&tier=${selectedTierIndex}`);
      window.open(`/login?callbackUrl=${returnUrl}`, "_blank");
      return;
    }

    // If logged in, initiate checkout
    setIsRedirecting(true);
    setCheckingOutPlan(plan);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan,
          tierIndex: selectedTierIndex,
          returnUrl: window.location.origin + "/workflow",
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
    } catch {
      toast({
        title: "Error",
        description: "Failed to create checkout session",
        variant: "destructive",
      });
    } finally {
      setIsRedirecting(false);
      setCheckingOutPlan(null);
    }
  };

  // Compact variant for modals
  if (variant === "compact") {
    const currentPrice = selectedPlan === "builder" ? selectedTier.builderPrice : selectedTier.teamPrice;

    const builderFeatures = [
      "10 workflows",
      "25 nodes per workflow",
      "AI nodes (GPT-4, Claude)",
      "Webhook triggers",
      "App integrations",
      "Import/Export workflows",
      "AI chatbot assistant",
      "Email support",
    ];

    const teamFeatures = [
      "Unlimited workflows",
      "Unlimited nodes",
      "Everything in Builder",
      "Team collaboration",
      "Advanced analytics",
      "Custom integrations",
      "Priority execution",
      "Priority support",
    ];

    const features = selectedPlan === "builder" ? builderFeatures : teamFeatures;

    return (
      <div className="space-y-5">
        {/* Plan Tabs */}
        <div className="flex rounded-lg border border-border p-1 bg-muted/50">
          <button
            onClick={() => setSelectedPlan("builder")}
            className={cn(
              "flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all",
              selectedPlan === "builder"
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Builder
          </button>
          <button
            onClick={() => setSelectedPlan("team")}
            className={cn(
              "flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all",
              selectedPlan === "team"
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Team
          </button>
        </div>

        {/* Price Display */}
        <div className="text-center py-4">
          <div className="flex items-baseline justify-center gap-1">
            <span className="text-5xl font-bold">${currentPrice}</span>
            <span className="text-muted-foreground">/month</span>
          </div>
          <p className="text-sm text-blue-600 dark:text-blue-400 font-medium mt-2">
            {selectedTier.credits.toLocaleString()} credits/month
          </p>
        </div>

        {/* Credit Tier Selection */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-2 block">Monthly Credits</label>
          <div className="px-1">
            <input
              type="range"
              min="0"
              max={PRICING_TIERS.length - 1}
              value={selectedTierIndex}
              onChange={(e) => setSelectedTierIndex(parseInt(e.target.value))}
              className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
            <div className="flex justify-between mt-2">
              {PRICING_TIERS.map((tier, index) => (
                <button
                  key={tier.credits}
                  onClick={() => setSelectedTierIndex(index)}
                  className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded transition-colors",
                    index === selectedTierIndex
                      ? "bg-blue-600 text-white"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {formatCredits(tier.credits)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Features */}
        <div className="border-t pt-4">
          <p className="text-xs font-medium text-muted-foreground mb-3">
            {selectedPlan === "builder" ? "Everything in Free, plus:" : "Everything in Builder, plus:"}
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            {features.map((feature) => (
              <div key={feature} className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                <span className="text-xs text-foreground">{feature}</span>
              </div>
            ))}
          </div>
        </div>

        {/* CTA Button */}
        {currentPlan === selectedPlan ? (
          <div className="w-full py-2.5 text-center bg-muted text-muted-foreground font-medium rounded-xl text-sm">
            Current Plan
          </div>
        ) : (
          <button
            onClick={() => handleCheckout(selectedPlan)}
            disabled={isCheckingOut}
            className={cn(
              "w-full py-3 text-center font-medium rounded-xl transition-all text-sm",
              selectedPlan === "builder"
                ? "bg-blue-600 hover:bg-blue-700 text-white shadow-md"
                : "bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white shadow-md"
            )}
          >
            {checkingOutPlan === selectedPlan ? (
              <Loader2 className="h-4 w-4 animate-spin mx-auto" />
            ) : (
              `Get ${selectedPlan === "builder" ? "Builder" : "Team"} - $${currentPrice}/mo`
            )}
          </button>
        )}
      </div>
    );
  }

  // Full variant for landing page and pricing page
  const isInteractive = !!onCheckout;
  const Wrapper = variant === "landing" ? "section" : "div";

  return (
    <Wrapper id={variant === "landing" ? "pricing" : undefined} className={variant === "landing" ? "py-24 px-6" : ""}>
      <div className={variant === "landing" ? "max-w-6xl mx-auto" : ""}>
        {showHeader && (
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-6">
              Simple pricing. Unlimited potential.
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Choose the plan that matches your ambition. Every tier unlocks more power.
            </p>
          </div>
        )}

        {/* Credits explainer */}
        {showCreditsExplainer && (
          <div className="bg-blue-50 dark:bg-blue-950/50 border border-blue-100 dark:border-blue-900 rounded-xl p-6 mb-8 max-w-3xl mx-auto">
            <h4 className="font-semibold text-foreground mb-3">Quick credit math:</h4>
            <div className="grid sm:grid-cols-3 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-muted-foreground">Logic & transforms: <strong className="text-foreground">1 credit</strong></span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                <span className="text-muted-foreground">AI processing: <strong className="text-foreground">10 credits</strong></span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-amber-500" />
                <span className="text-muted-foreground">Webhook triggers: <strong className="text-foreground">1 credit</strong></span>
              </div>
            </div>
          </div>
        )}

        {/* Credits Slider - Above Cards */}
        <div className="max-w-2xl mx-auto mb-12">
          <p className="text-sm font-medium text-muted-foreground text-center mb-4">Select your monthly credits</p>
          <div className="px-2">
            <input
              type="range"
              min="0"
              max={PRICING_TIERS.length - 1}
              value={selectedTierIndex}
              onChange={(e) => setSelectedTierIndex(parseInt(e.target.value))}
              className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
            <div className="flex justify-between mt-4">
              {PRICING_TIERS.map((tier, index) => (
                <button
                  key={tier.credits}
                  onClick={() => setSelectedTierIndex(index)}
                  className={cn(
                    "text-xs px-2 py-1 rounded transition-colors",
                    index === selectedTierIndex
                      ? "bg-blue-600 text-white"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {formatCredits(tier.credits)}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {/* Free Tier */}
          <div className={cn(
            "rounded-2xl border bg-card p-6 shadow-lg",
            currentPlan === "free" ? "border-emerald-500 border-2" : "border-border"
          )}>
            <h3 className="text-lg font-medium text-muted-foreground mb-2">Free</h3>
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-4xl font-bold text-foreground">$0</span>
              <span className="text-muted-foreground">/month</span>
            </div>
            <p className="text-emerald-600 dark:text-emerald-400 font-medium text-sm mb-4">100 credits/month</p>
            <p className="text-muted-foreground text-sm mb-6">Perfect for getting started. No strings attached.</p>

            <div className="space-y-3 mb-6">
              <ul className="space-y-2">
                {[
                  "3 workflows",
                  "4 nodes per workflow",
                  "Input, Logic, API & Output nodes",
                  "Community support",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2 text-foreground text-sm">
                    <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>

              <div className="pt-3 border-t border-border">
                <p className="text-xs font-medium text-muted-foreground mb-2">Not included:</p>
                <ul className="space-y-2">
                  {[
                    "AI nodes",
                    "Webhook triggers",
                    "App integrations",
                    "Import/Export",
                    "AI chatbot",
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-2 text-muted-foreground text-sm">
                      <X className="w-4 h-4 text-muted-foreground/50 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {currentPlan === "free" ? (
              <div className="w-full py-2.5 text-center bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 font-medium rounded-xl text-sm">
                Current Plan
              </div>
            ) : isInteractive ? (
              <div className="w-full py-2.5 text-center bg-muted text-muted-foreground font-medium rounded-xl text-sm">
                Free Tier
              </div>
            ) : (
              <Link
                href="/workflow"
                className="block w-full py-2.5 text-center bg-muted hover:bg-muted/80 text-foreground font-medium rounded-xl transition-colors text-sm"
              >
                Try It Out
              </Link>
            )}
          </div>

          {/* Builder Tier */}
          <div className={cn(
            "rounded-2xl border-2 bg-card p-6 relative shadow-xl",
            currentPlan === "builder" ? "border-blue-500 shadow-blue-500/20" : "border-blue-500 shadow-blue-500/10"
          )}>
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-blue-600 text-white text-xs font-medium rounded-full">
              Most Popular
            </div>
            <h3 className="text-lg font-medium text-muted-foreground mb-2">Builder</h3>
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-4xl font-bold text-foreground">${selectedTier.builderPrice}</span>
              <span className="text-muted-foreground">/month</span>
            </div>
            <p className="text-blue-600 dark:text-blue-400 font-medium text-sm mb-4">
              {selectedTier.credits.toLocaleString()} credits/month
            </p>
            <p className="text-muted-foreground text-sm mb-6">For serious builders who want the full toolkit.</p>

            <div className="space-y-3 mb-6">
              <p className="text-xs font-medium text-foreground">Everything in Free, plus:</p>
              <ul className="space-y-2">
                {[
                  "10 workflows",
                  "25 nodes per workflow",
                  "AI nodes (GPT-4, Claude)",
                  "Webhook triggers",
                  "App integrations",
                  "Import/Export workflows",
                  "AI chatbot assistant",
                  "Email support",
                  "Credit rollover",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2 text-foreground text-sm">
                    <Check className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {currentPlan === "builder" ? (
              <div className="w-full py-2.5 text-center bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 font-medium rounded-xl text-sm">
                Current Plan
              </div>
            ) : isInteractive ? (
              <button
                onClick={() => handleCheckout("builder")}
                disabled={isCheckingOut}
                className="block w-full py-2.5 text-center bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-all shadow-md text-sm disabled:opacity-50"
              >
                {checkingOutPlan === "builder" ? (
                  <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                ) : (
                  "Get Builder"
                )}
              </button>
            ) : (
              <button
                onClick={() => handleLandingCheckout("builder")}
                disabled={isRedirecting || status === "loading"}
                className="block w-full py-2.5 text-center bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-all shadow-md text-sm disabled:opacity-50"
              >
                {checkingOutPlan === "builder" ? (
                  <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                ) : (
                  "Get Builder"
                )}
              </button>
            )}
          </div>

          {/* Team Tier */}
          <div className={cn(
            "rounded-2xl border bg-card p-6 shadow-lg",
            currentPlan === "team" ? "border-emerald-500 border-2" : "border-border"
          )}>
            <h3 className="text-lg font-medium text-muted-foreground mb-2">Team</h3>
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-4xl font-bold text-foreground">${selectedTier.teamPrice}</span>
              <span className="text-muted-foreground">/month</span>
            </div>
            <p className="text-blue-600 dark:text-blue-400 font-medium text-sm mb-4">
              {selectedTier.credits.toLocaleString()} credits/month
            </p>
            <p className="text-muted-foreground text-sm mb-6">For teams that need no limits and priority support.</p>

            <div className="space-y-3 mb-6">
              <p className="text-xs font-medium text-foreground">Everything in Builder, plus:</p>
              <ul className="space-y-2">
                {[
                  "Unlimited workflows",
                  "Unlimited nodes per workflow",
                  "Team collaboration",
                  "Advanced analytics",
                  "Custom integrations",
                  "Priority execution",
                  "Priority support",
                  "Dedicated account manager",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2 text-foreground text-sm">
                    <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {currentPlan === "team" ? (
              <div className="w-full py-2.5 text-center bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 font-medium rounded-xl text-sm">
                Current Plan
              </div>
            ) : isInteractive ? (
              <button
                onClick={() => handleCheckout("team")}
                disabled={isCheckingOut}
                className="block w-full py-2.5 text-center bg-muted hover:bg-muted/80 text-foreground font-medium rounded-xl transition-colors text-sm disabled:opacity-50"
              >
                {checkingOutPlan === "team" ? (
                  <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                ) : (
                  "Get Team"
                )}
              </button>
            ) : (
              <button
                onClick={() => handleLandingCheckout("team")}
                disabled={isRedirecting || status === "loading"}
                className="block w-full py-2.5 text-center bg-muted hover:bg-muted/80 text-foreground font-medium rounded-xl transition-colors text-sm disabled:opacity-50"
              >
                {checkingOutPlan === "team" ? (
                  <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                ) : (
                  "Get Team"
                )}
              </button>
            )}
          </div>
        </div>

        {/* Enterprise callout */}
        {showEnterpriseCTA && (
          <div className="mt-12 text-center">
            <p className="text-muted-foreground">
              Need 100,000+ credits, custom SLAs, or on-premise deployment?{" "}
              <Link href="/contact" className="text-blue-600 dark:text-blue-400 font-medium hover:underline">
                Let&apos;s talk Enterprise
              </Link>
            </p>
          </div>
        )}
      </div>
    </Wrapper>
  );
}

export { PRICING_TIERS };
