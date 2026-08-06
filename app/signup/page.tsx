"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { AlertCircle } from "lucide-react";
import { AuthShell, AuthField, AuthSubmit } from "@/components/auth/AuthShell";

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
    <AuthShell
      eyebrow="Free to start"
      title={
        <>
          <span className="block [text-wrap:balance]">Run your first</span>
          <span className="block [text-wrap:balance] text-[var(--fy-slate)]">
            workflow in minutes.
          </span>
        </>
      }
      subtitle="Six ready made workflows are waiting. Nothing to install, and no card."
      footer={
        <>
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-semibold text-[var(--fy-ink)] underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </>
      }
    >
      <form className="space-y-5" onSubmit={handleSignup}>
        <AuthField
          id="name"
          label="Name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
        />

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
          autoComplete="new-password"
          minLength={8}
          required
          hint="At least 8 characters."
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

        <AuthSubmit loading={isLoading} loadingLabel="Creating your account...">
          Create account
        </AuthSubmit>
      </form>
    </AuthShell>
  );
}
