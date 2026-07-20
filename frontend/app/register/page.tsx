"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import { createClient } from "@/lib/supabase/client";
import { MindMapprMark } from "@/app/components/MindMapprMark";
import { Wordmark } from "@/app/components/Wordmark";

const emailSchema = z.email("Please enter a valid email address");

export default function RegisterPage() {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function validateUsername(value: string): boolean {
    if (!value.trim()) {
      setUsernameError("Please enter a username");
      return false;
    }
    setUsernameError("");
    return true;
  }

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

    if (!validateUsername(username)) return;
    if (!validateEmail(email)) return;

    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username: username.trim() } },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <div className="container">
      <header className="header">
        <div className="logo">
          <MindMapprMark className="logo-mark" />
          <Wordmark className="logo-text" />
        </div>
        <p className="tagline">Discover study techniques tailored to your learning style</p>
      </header>

      <main className="main-card">
        <h2 className="card-title">Create Account</h2>
        <p className="card-description">Sign up to save and track your study sessions.</p>

        <form className="form" onSubmit={handleSubmit} noValidate>
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => { setUsername(e.target.value); if (usernameError) setUsernameError(""); }}
              onBlur={(e) => { validateUsername(e.target.value); }}
              placeholder="How should we call you?"
              required
            />
            {usernameError && <span className="field-error">{usernameError}</span>}
          </div>

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
              placeholder="Min. 6 characters"
              minLength={6}
              required
            />
            <ul className="password-hints">
              <li className={password.length >= 6 ? "hint-met" : ""}>At least 6 characters</li>
              <li className={/[A-Z]/.test(password) ? "hint-met" : ""}>One uppercase letter</li>
              <li className={/[0-9]/.test(password) ? "hint-met" : ""}>One number</li>
            </ul>
          </div>

          {error && <div className="form-error">{error}</div>}

          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? (
              <span className="btn-loading">
                <span className="spinner" />
                Creating account...
              </span>
            ) : (
              "Create Account"
            )}
          </button>
        </form>

        <p className="auth-link">
          Already have an account?{" "}
          <Link href="/login">Sign in</Link>
        </p>
      </main>
    </div>
  );
}
