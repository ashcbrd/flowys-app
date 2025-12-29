"use client";

import Link from "next/link";
import {
  Webhook,
  Key,
  CreditCard,
  ChevronRight,
  Settings,
} from "lucide-react";
import { Navbar } from "@/components/shared/Navbar";

const settingsPages = [
  {
    title: "Subscription",
    description: "Manage your plan, view credit usage, and billing details",
    href: "/settings/subscription",
    icon: CreditCard,
    color: "from-blue-500 to-indigo-600",
  },
  {
    title: "Webhooks",
    description: "Configure incoming and outgoing webhooks for automation",
    href: "/settings/webhooks",
    icon: Webhook,
    color: "from-green-500 to-emerald-600",
  },
  {
    title: "API Keys",
    description: "Create and manage API keys for programmatic access",
    href: "/settings/api-keys",
    icon: Key,
    color: "from-amber-500 to-orange-600",
  },
];

export default function SettingsPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar title="Settings" icon={Settings} />

      {/* Main Content */}
      <main className="max-w-3xl mx-auto px-6 py-12">
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-2">Settings</h2>
          <p className="text-muted-foreground">
            Manage your account, subscription, and integrations
          </p>
        </div>

        <div className="space-y-4">
          {settingsPages.map((page) => (
            <Link
              key={page.href}
              href={page.href}
              className="block border rounded-lg p-5 bg-card hover:bg-muted/50 transition-colors group"
            >
              <div className="flex items-center gap-4">
                <div className={`h-12 w-12 rounded-lg bg-gradient-to-r ${page.color} flex items-center justify-center flex-shrink-0`}>
                  <page.icon className="h-6 w-6 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-lg">{page.title}</h3>
                  <p className="text-sm text-muted-foreground">{page.description}</p>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
              </div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
