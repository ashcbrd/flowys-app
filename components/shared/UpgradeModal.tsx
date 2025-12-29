"use client";

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";
import { Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PricingSection } from "@/components/shared/PricingSection";
import { useToast } from "@/hooks/use-toast";

type PlanType = "free" | "builder" | "team";

interface UpgradeModalContextType {
  openUpgradeModal: () => void;
  closeUpgradeModal: () => void;
  isOpen: boolean;
}

const UpgradeModalContext = createContext<UpgradeModalContextType | null>(null);

export function useUpgradeModal() {
  const context = useContext(UpgradeModalContext);
  if (!context) {
    throw new Error("useUpgradeModal must be used within an UpgradeModalProvider");
  }
  return context;
}

interface UpgradeModalProviderProps {
  children: ReactNode;
}

export function UpgradeModalProvider({ children }: UpgradeModalProviderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentPlan, setCurrentPlan] = useState<PlanType>("free");
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const { toast } = useToast();

  // Fetch user's subscription plan
  useEffect(() => {
    const fetchPlan = async () => {
      try {
        const res = await fetch("/api/subscription");
        if (res.ok) {
          const data = await res.json();
          setCurrentPlan(data.subscription?.plan || "free");
        }
      } catch {
        setCurrentPlan("free");
      }
    };
    fetchPlan();
  }, []);

  const openUpgradeModal = useCallback(() => {
    setIsOpen(true);
  }, []);

  const closeUpgradeModal = useCallback(() => {
    setIsOpen(false);
  }, []);

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
    } catch {
      toast({
        title: "Error",
        description: "Failed to create checkout session",
        variant: "destructive",
      });
    } finally {
      setIsCheckingOut(false);
    }
  };

  return (
    <UpgradeModalContext.Provider value={{ openUpgradeModal, closeUpgradeModal, isOpen }}>
      {children}

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-blue-500" />
              Upgrade Your Plan
            </DialogTitle>
          </DialogHeader>

          <PricingSection
            currentPlan={currentPlan}
            onCheckout={handleCheckout}
            isCheckingOut={isCheckingOut}
            variant="compact"
          />

          <Button
            variant="outline"
            className="w-full"
            onClick={closeUpgradeModal}
          >
            Cancel
          </Button>
        </DialogContent>
      </Dialog>
    </UpgradeModalContext.Provider>
  );
}
