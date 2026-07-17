"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { TopNav } from "@/app/components/TopNav";
import { MindMapprMark } from "@/app/components/MindMapprMark";
import type { StudyResponse, StudyFormData } from "@/types/study";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type UIState =
  | { status: "idle" }
  | { status: "loading"; meta: StudyFormData }
  | { status: "success"; data: StudyResponse }
  | { status: "error"; message: string };

export default function Home() {
  const [uiState, setUiState] = useState<UIState>({ status: "idle" });
  const [formError, setFormError] = useState<string>("");
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isGuestResult, setIsGuestResult] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAccessToken(session?.access_token ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAccessToken(session?.access_token ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError("");

    const form = e.currentTarget;
    const subject = (form.elements.namedItem("subject") as HTMLInputElement).value.trim();
    const time = parseInt((form.elements.namedItem("time") as HTMLInputElement).value, 10);
    const level = (form.elements.namedItem("level") as HTMLSelectElement).value;
    const goal = (form.elements.namedItem("goal") as HTMLInputElement).value.trim() || "";

    if (!subject || !time || !level) {
      setFormError("Please fill in all required fields.");
      return;
    }

    const meta: StudyFormData = { subject, time, level, goal };
    setUiState({ status: "loading", meta });

    try {
      const endpoint = accessToken
        ? `${API_BASE}/study`
        : `${API_BASE}/study/preview`;

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ time, subject, level, goal: goal || null }),
      });

      if (!res.ok) {
        const contentType = res.headers.get("content-type") ?? "";
        let message = `Server error (${res.status})`;
        if (contentType.includes("application/json")) {
          const err = await res.json().catch(() => ({}));
          message = err.detail ?? err.message ?? message;
        } else {
          const text = await res.text().catch(() => "");
          if (text) message = text.slice(0, 200);
        }
        throw new Error(message);
      }

      const data: StudyResponse = await res.json();
      setUiState({ status: "success", data });
      setIsGuestResult(!accessToken);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
      setUiState({ status: "error", message });
      setFormError(
        message === "Failed to fetch"
          ? "Cannot reach the server. Make sure the backend is running."
          : message
      );
    }
  }

  function handleClear() {
    setUiState({ status: "idle" });
    setFormError("");
    setIsGuestResult(false);
  }

  const isLoading = uiState.status === "loading";

  return (
    <>
      <TopNav />
      <div className="container container--home">
      <header className="header">
        <p className="tagline">Discover study techniques tailored to your learning style</p>
      </header>

      <div className="compose-layout">
      <main className="main-card paper-texture">
        <h2 className="card-title">Get Personalized Study Recommendations</h2>
        <p className="card-description">
          Tell us about your study session and we&apos;ll suggest the best techniques for you.
        </p>

        <form className="form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="subject">What are you studying?</label>
            <input
              id="subject"
              name="subject"
              type="text"
              placeholder="e.g., Organic Chemistry Chapter 5, Linear Algebra Eigenvalues"
              required
            />
            <span className="form-hint">Be specific for better results</span>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="time">Study Duration</label>
              <div className="input-with-suffix">
                <input id="time" name="time" type="number" min="5" max="480" placeholder="60" required />
                <span className="suffix">minutes</span>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="level">Your Level</label>
              <select id="level" name="level" required defaultValue="">
                <option value="" disabled>Select level</option>
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="goal">
              Learning Goal{" "}
              <span className="optional-badge">Optional</span>
            </label>
            <input
              id="goal"
              name="goal"
              type="text"
              placeholder="e.g., Prepare for midterm, Understand recursion deeply"
            />
          </div>

          {formError && <div className="form-error">{formError}</div>}

          <button type="submit" className="btn btn-primary" disabled={isLoading}>
            {isLoading ? (
              <span className="btn-loading">
                <span className="spinner" />
                Generating...
              </span>
            ) : (
              <span>Get Recommendations</span>
            )}
          </button>
        </form>
      </main>

      <div className="plan-panel">
      {(uiState.status === "idle" || uiState.status === "error") && (
        <div className="plan-panel-empty paper-texture">
          <span className="plan-panel-empty-icon">✨</span>
          <p>Fill in the form and generate a plan, your personalized study plan will appear here.</p>
        </div>
      )}

      {uiState.status === "loading" && (
        <section className="results-card paper-texture">
          <div className="results-header">
            <h3 className="results-title">Your Study Plan</h3>
          </div>
          <div className="results-meta">
            <span>📚 {uiState.meta.subject}</span>
            <span>⏱️ {uiState.meta.time} min</span>
            <span>📊 {uiState.meta.level}</span>
            {uiState.meta.goal && <span>🎯 {uiState.meta.goal}</span>}
          </div>
          <div className="skeleton-container">
            <div className="skeleton-block skeleton-summary" />
            <div className="skeleton-block skeleton-technique" />
            <div className="skeleton-block skeleton-technique" />
            <div className="skeleton-block skeleton-tips" />
          </div>
        </section>
      )}

      {uiState.status === "success" && (
        <section className="results-card paper-texture">
          <div className="results-header">
            <h3 className="results-title">Your Study Plan</h3>
            <button className="btn btn-ghost" onClick={handleClear}>Clear</button>
          </div>
          <div className="results-loaded">
            <div className="results-meta">
              <span>📚 {uiState.data.subject}</span>
              <span>⏱️ {uiState.data.time} min</span>
              <span>📊 {uiState.data.level}</span>
              {uiState.data.goal && <span>🎯 {uiState.data.goal}</span>}
            </div>

            <div className="result-summary">
              {uiState.data.recommendation.summary}
              <div className="result-techniques-used">
                Techniques used: {uiState.data.recommendation.techniques.map(t => t.title).join(", ")}
              </div>
            </div>

            <div className="techniques-grid">
              {uiState.data.recommendation.techniques.map((t, i) => (
                <div key={i} className="technique-card">
                  <div className="technique-header">
                    <span className="technique-title">{t.title}</span>
                    <span className="technique-duration">{t.duration_minutes} min</span>
                  </div>
                  <p className="technique-description">{t.description}</p>
                </div>
              ))}
            </div>

            {uiState.data.recommendation.tips.length > 0 && (
              <div className="tips-callout">
                <div className="tips-label">Quick Tips</div>
                <ul className="tips-list">
                  {uiState.data.recommendation.tips.map((tip, i) => (
                    <li key={i}>{tip}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}
      </div>
      </div>

      {isGuestResult && (
        <div className="signup-cta">
          <div className="signup-cta-text">
            <strong>Save this plan &amp; track your reviews</strong>
            <span>Create a free account to store sessions and get spaced repetition reminders.</span>
          </div>
          <div className="signup-cta-actions">
            <a href="/register" className="btn btn-primary">Sign up free</a>
            <a href="/login" className="btn btn-ghost">Log in</a>
          </div>
        </div>
      )}

      {/* FSRS demo — only shown to visitors (no session) */}
      {!accessToken && (
        <div className="demo-section">
          <div className="demo-divider"><span>How spaced repetition works</span></div>

          <div className="demo-card paper-texture">
            {/* Topbar */}
            <div className="demo-topbar">
              <div className="demo-topbar-left">
                <MindMapprMark className="demo-topbar-mark" />
                <span className="demo-topbar-title">Your Study Dashboard</span>
              </div>
              <span className="demo-badge">FSRS-5</span>
            </div>

            {/* Stats */}
            <div className="demo-stats">
              <div className="demo-stat">
                <div className="demo-stat-value">12</div>
                <div className="demo-stat-label">Sessions</div>
              </div>
              <div className="demo-stat">
                <div className="demo-stat-value demo-stat-value--brand">3</div>
                <div className="demo-stat-label">Due Today</div>
              </div>
              <div className="demo-stat">
                <div className="demo-stat-value">5</div>
                <div className="demo-stat-label">Reviewed</div>
              </div>
            </div>

            {/* Session list */}
            <div className="demo-sessions">
              <div className="demo-session-label">Due for review</div>

              {[
                { subject: "Linear Algebra — Eigenvalues", meta: "Advanced · 45 min · 3× reviewed", stability: 78, tag: "Due today", tagCls: "demo-tag--due", due: true },
                { subject: "Organic Chemistry Chapter 5",  meta: "Intermediate · 60 min · 1× reviewed", stability: 22, tag: "2d overdue", tagCls: "demo-tag--over", due: true },
                { subject: "Data Structures — Trees", meta: "Beginner · 30 min · 5× reviewed", stability: 94, tag: "In 8 days", tagCls: "demo-tag--soon", due: false },
              ].map((s, i) => (
                <div key={i} className={s.due ? "demo-session demo-session--due" : "demo-session"}>
                  <div className="demo-session-info">
                    <div className="demo-session-subject">{s.subject}</div>
                    <div className="demo-session-meta">{s.meta}</div>
                    <div className="demo-stability">
                      <div className="demo-stability-track">
                        <div className="demo-stability-fill" style={{ width: `${s.stability}%` }} />
                      </div>
                      <span className="demo-stability-label">S: {(s.stability / 10).toFixed(1)}d</span>
                    </div>
                  </div>
                  <span className={`demo-tag ${s.tagCls}`}>{s.tag}</span>
                </div>
              ))}
            </div>

            {/* CTA */}
            <div className="demo-cta">
              <p className="demo-cta-text">
                <strong>MindMappr remembers for you.</strong> The algorithm schedules each review at the optimal moment — so you never over-study or forget.
              </p>
              <a href="/register" className="btn btn-primary">Start tracking free</a>
            </div>
          </div>
        </div>
      )}
      </div>
    </>
  );
}
