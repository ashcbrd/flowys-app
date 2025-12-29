"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import {
  ArrowLeft,
  LogOut,
  User,
  CreditCard,
  Crown,
  Sparkles,
  Zap,
  Webhook,
  Key,
  Plug,
  Settings,
  BookOpen,
  Play,
  Store,
  ShoppingBag,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { navigateToDomain, getDomainUrl } from "@/lib/navigation";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { PlanType } from "@/lib/db/models/Subscription";
import type { LucideIcon } from "lucide-react";

interface NavbarProps {
  title: string;
  icon?: LucideIcon;
  children?: React.ReactNode;
}

export function Navbar({
  title,
  icon: Icon,
  children
}: NavbarProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const [userPlan, setUserPlan] = useState<PlanType>("free");
  const [creditsRemaining, setCreditsRemaining] = useState<number | null>(null);
  const [monthlyCredits, setMonthlyCredits] = useState<number | null>(null);

  const fetchSubscription = useCallback(async () => {
    try {
      const res = await fetch("/api/subscription");
      if (res.ok) {
        const data = await res.json();
        setUserPlan(data.subscription?.plan || "free");
        setCreditsRemaining(data.usage?.creditsRemaining ?? null);
        setMonthlyCredits(data.usage?.monthlyCredits ?? null);
      }
    } catch (error) {
      console.error("Failed to fetch subscription:", error);
    }
  }, []);

  useEffect(() => {
    if (session?.user) {
      fetchSubscription();
    }
  }, [session?.user, fetchSubscription]);

  // Listen for credits update events (triggered after workflow execution)
  useEffect(() => {
    const handleCreditsUpdate = () => {
      fetchSubscription();
    };

    window.addEventListener("credits-updated", handleCreditsUpdate);
    return () => {
      window.removeEventListener("credits-updated", handleCreditsUpdate);
    };
  }, [fetchSubscription]);

  return (
    <header className="h-14 border-b bg-card flex items-center justify-between px-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div className="h-6 w-px bg-border" />
        <div className="flex items-center gap-2">
          {Icon && <Icon className="h-5 w-5 text-primary" />}
          <h1 className="text-lg font-semibold">{title}</h1>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {children}

        {/* Credits Display */}
        {session?.user && creditsRemaining !== null && (
          <Link
            href="/settings/subscription"
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium transition-colors",
              "hover:bg-muted border",
              creditsRemaining === 0
                ? "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400"
                : monthlyCredits && creditsRemaining / monthlyCredits < 0.2
                ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400"
                : "border-border bg-background text-foreground"
            )}
            title="Credits remaining"
          >
            <Zap className="h-3.5 w-3.5" />
            <span>{creditsRemaining.toLocaleString()}</span>
          </Link>
        )}

        <ThemeToggle />

        {/* User Menu */}
        {session?.user && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={session.user.image || undefined} alt={session.user.name || "User"} />
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {session.user.name?.charAt(0).toUpperCase() || <User className="h-4 w-4" />}
                  </AvatarFallback>
                </Avatar>
                {/* Plan Badge */}
                {userPlan === "team" && (
                  <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-gradient-to-r from-purple-500 to-indigo-600 shadow-sm ring-2 ring-background">
                    <Crown className="h-2.5 w-2.5 text-white" />
                  </span>
                )}
                {userPlan === "builder" && (
                  <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 shadow-sm ring-2 ring-background">
                    <Sparkles className="h-2.5 w-2.5 text-white" />
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="flex items-center justify-start gap-2 p-2">
                <div className="flex flex-col space-y-1 leading-none">
                  {session.user.name && (
                    <p className="font-medium">{session.user.name}</p>
                  )}
                  {session.user.email && (
                    <p className="w-[200px] truncate text-sm text-muted-foreground">
                      {session.user.email}
                    </p>
                  )}
                </div>
              </div>

              <DropdownMenuSeparator />

              {/* Settings section */}
              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                Settings
              </div>
              <DropdownMenuItem asChild>
                <Link href="/integrations">
                  <Plug className="h-4 w-4" />
                  App Integrations
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/settings/webhooks">
                  <Webhook className="h-4 w-4" />
                  Webhooks
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/settings/api-keys">
                  <Key className="h-4 w-4" />
                  API Keys
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/settings/subscription">
                  <CreditCard className="h-4 w-4" />
                  Subscription
                </Link>
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              {/* Marketplace section (external) */}
              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                Marketplace
              </div>
              <DropdownMenuItem asChild>
                <a
                  href={getDomainUrl("marketplace")}
                  onClick={(e) => {
                    e.preventDefault();
                    navigateToDomain("marketplace", "/");
                  }}
                >
                  <Store className="h-4 w-4" />
                  Browse Workflows
                  <ExternalLink className="h-3 w-3 ml-auto opacity-50" />
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a
                  href={`${getDomainUrl("marketplace")}/seller/listings/new`}
                  onClick={(e) => {
                    e.preventDefault();
                    navigateToDomain("marketplace", "/seller/listings/new");
                  }}
                >
                  <ShoppingBag className="h-4 w-4" />
                  Sell Workflow
                  <ExternalLink className="h-3 w-3 ml-auto opacity-50" />
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a
                  href={`${getDomainUrl("marketplace")}/seller`}
                  onClick={(e) => {
                    e.preventDefault();
                    navigateToDomain("marketplace", "/seller");
                  }}
                >
                  <Settings className="h-4 w-4" />
                  My Listings
                  <ExternalLink className="h-3 w-3 ml-auto opacity-50" />
                </a>
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              {/* Help section */}
              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                Help
              </div>
              <DropdownMenuItem asChild>
                <Link href="/docs" target="_blank">
                  <BookOpen className="h-4 w-4" />
                  Documentation
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/tutorial">
                  <Play className="h-4 w-4" />
                  Tutorial
                </Link>
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                className="text-red-600 focus:text-red-600 cursor-pointer"
                onClick={() => signOut({ callbackUrl: "/login" })}
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  );
}
