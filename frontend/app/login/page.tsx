"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import { createClient } from "@/lib/supabase/client";
import { MindMapprMark } from "@/app/components/MindMapprMark";
import { Wordmark } from "@/app/components/Wordmark";

const emailSchema = z.email("Please enter a valid email address");

function LoginForm() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function validateEmail(value: string): boolean {
    const result = emailSchema.safeParse(value);
    if (!result.success) {
      setEmailError(result.error.issues[0].message);
      return false;
    }
    setEmailError("");
    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!validateEmail(email)) return;

    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <main className="main-card">
      <h2 className="card-title">Sign In</h2>
      <p className="card-description">Welcome back — sign in to access your study plans.</p>

      <form className="form" onSubmit={handleSubmit} noValidate>
        <div className="form-group">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); if (emailError) setEmailError(""); }}
            onBlur={(e) => { if (e.target.value) validateEmail(e.target.value); }}
            placeholder="you@example.com"
            required
          />
          {emailError && <span className="field-error">{emailError}</span>}
        </div>

        <div className="form-group">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />
        </div>

        {error && <div className="form-error">{error}</div>}

        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? (
            <span className="btn-loading">
              <span className="spinner" />
              Signing in...
            </span>
          ) : (
            "Sign In"
          )}
        </button>
      </form>

      <p className="auth-link">
        No account?{" "}
        <Link href="/register">Create one</Link>
      </p>
    </main>
  );
}

export default function LoginPage() {
  return (
    <div className="container">
      <header className="header">
        <div className="logo">
          <MindMapprMark className="logo-mark" />
          <Wordmark className="logo-text" />
        </div>
        <p className="tagline">Discover study techniques tailored to your learning style</p>
      </header>
      <LoginForm />
    </div>
  );
}
