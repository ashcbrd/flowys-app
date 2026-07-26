"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import {
  ArrowLeft,
  LogOut,
  User,
  Webhook,
  Key,
  Plug,
  BookOpen,
  Play,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import type { LucideIcon } from "lucide-react";
import { INTEGRATIONS_ENABLED, COMING_SOON_LABEL } from "@/lib/features";

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
              {INTEGRATIONS_ENABLED ? (
                <DropdownMenuItem asChild>
                  <Link href="/integrations">
                    <Plug className="h-4 w-4" />
                    App Integrations
                  </Link>
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem disabled>
                  <Plug className="h-4 w-4" />
                  <span className="flex-1">App Integrations</span>
                  <span className="text-xs text-muted-foreground">
                    {COMING_SOON_LABEL}
                  </span>
                </DropdownMenuItem>
              )}
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
