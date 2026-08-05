"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { ArrowRight, Loader2, Sparkles, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";

export default function SignupPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSignup = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error || "Could not create your account. Please try again.");
        setIsLoading(false);
        return;
      }

      // Account created — sign the person straight in.
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
        callbackUrl: "/workflow",
      });

      setIsLoading(false);

      if (!result || result.error) {
        // Account exists but auto sign-in failed; send them to log in manually.
        router.push("/login");
        return;
      }

      router.push(result.url || "/workflow");
    } catch {
      setError("Could not create your account. Please try again.");
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background relative">
      <div className="fy-light pointer-events-none absolute inset-0" />
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
            <h1 className="text-4xl font-bold text-foreground mb-4">Create your account</h1>
            <p className="text-lg text-muted-foreground">
              Start building workflows in minutes.
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-card p-8 shadow-xl">
            <form className="space-y-5" onSubmit={handleSignup}>
              <div className="space-y-2">
                <label htmlFor="name" className="text-sm font-medium text-foreground">
                  Name <span className="text-muted-foreground font-normal">(optional)</span>
                </label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full h-11 rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                  autoComplete="name"
                />
              </div>

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
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
                <p className="text-xs text-muted-foreground">At least 8 characters.</p>
              </div>

              {error && (
                <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                  {error}
                </p>
              )}

              <Button
                type="submit"
                disabled={isLoading}
                className="fy-pill w-full h-11 text-base font-semibold"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating account...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Create account
                  </>
                )}
              </Button>
            </form>
          </div>

          <div className="text-center mt-8">
            <p className="text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link
                href="/login"
                className="inline-flex items-center gap-1 text-foreground font-medium hover:underline"
              >
                Sign in
                <ArrowRight className="w-4 h-4" />
              </Link>
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
