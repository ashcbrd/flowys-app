"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { AlertCircle } from "lucide-react";
import { AuthShell, AuthField, AuthSubmit } from "@/components/auth/AuthShell";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
    <AuthShell
      eyebrow="Welcome back"
      title={
        <>
          <span className="block [text-wrap:balance]">Pick up</span>
          <span className="block [text-wrap:balance] text-[var(--fy-slate)]">
            where you left off.
          </span>
        </>
      }
      subtitle="Your workflows, runs and documents are exactly as you left them."
      footer={
        <>
          New here?{" "}
          <Link
            href="/signup"
            className="font-semibold text-[var(--fy-ink)] underline-offset-4 hover:underline"
          >
            Create an account
          </Link>
        </>
      }
    >
      <form className="space-y-5" onSubmit={handleLogin}>
        <AuthField
          id="email"
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />

        <AuthField
          id="password"
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />

        {error && (
          <p
            className="flex items-start gap-2 rounded-xl bg-red-500/8 px-3.5 py-3 text-[13px] text-red-600 dark:text-red-400"
            role="alert"
          >
            <AlertCircle className="mt-px h-4 w-4 shrink-0" />
            {error}
          </p>
        )}

        <AuthSubmit loading={isLoading} loadingLabel="Signing in...">
          Sign in
        </AuthSubmit>
      </form>
    </AuthShell>
  );
}
