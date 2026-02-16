"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { ArrowRight, Loader2, Shield, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("user@flowys.io");
  const [password, setPassword] = useState("@FLOWYS2025");
  const [callbackUrl, setCallbackUrl] = useState("/workflow");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setCallbackUrl(params.get("callbackUrl") || "/workflow");
  }, []);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
      callbackUrl,
    });

    setIsLoading(false);

    if (!result || result.error) {
      setError("Invalid email or password.");
      return;
    }

    router.push(result.url || callbackUrl);
  };

  return (
    <div className="min-h-screen bg-background">
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-foreground">Flowys</span>
          </Link>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <Link
              href="/"
              className="text-muted-foreground hover:text-foreground transition-colors text-sm"
            >
              Back to home
            </Link>
          </div>
        </div>
      </nav>

      <section className="pt-32 pb-20 px-6 min-h-screen flex items-center justify-center">
        <div className="max-w-md w-full mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-foreground mb-4">Welcome to Flowys</h1>
            <p className="text-lg text-muted-foreground">Sign in with your account credentials</p>
          </div>

          <div className="rounded-2xl border border-border bg-card p-8 shadow-xl">
            <form className="space-y-5" onSubmit={handleLogin}>
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium text-foreground">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-11 rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                  autoComplete="email"
                  required
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium text-foreground">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-11 rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                  autoComplete="current-password"
                  required
                />
              </div>

              {error && (
                <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                  {error}
                </p>
              )}

              <Button
                type="submit"
                disabled={isLoading}
                className="w-full h-11 text-base font-semibold bg-blue-600 hover:bg-blue-700"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  "Sign In"
                )}
              </Button>

              <div className="flex items-center gap-3 p-4 rounded-xl bg-blue-50 dark:bg-blue-950/50 border border-blue-100 dark:border-blue-900">
                <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/50 border border-blue-200 dark:border-blue-800 flex items-center justify-center flex-shrink-0">
                  <Shield className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Access is restricted to the configured Flowys account.
                </p>
              </div>
            </form>
          </div>

          <div className="text-center mt-8">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors text-sm"
            >
              <ArrowRight className="w-4 h-4 rotate-180" />
              Back to home
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
