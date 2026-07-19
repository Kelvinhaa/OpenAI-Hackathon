"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { MindMapprMark } from "@/app/components/MindMapprMark";
import { Wordmark } from "@/app/components/Wordmark";

const TABS = [
  { href: "/", label: "Planner" },
  { href: "/library", label: "Library" },
  { href: "/review", label: "Review" },
] as const;

// useLayoutEffect warns during SSR; the nav only measures in the browser.
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function TopNav() {
  const router = useRouter();
  const pathname = usePathname();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const tabsRef = useRef<HTMLElement>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserEmail(session?.user?.email ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user?.email ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const tabs = pathname.startsWith("/map/")
    ? [...TABS, { href: pathname, label: "Plan map" }]
    : [...TABS];
  const activeIndex = tabs.findIndex((t) => isActive(t.href));

  // A single underline slides between tabs, so it tracks whichever tab is hovered
  // (or focused) and falls back to the active one.
  const targetIndex = hoveredIndex ?? activeIndex;

  useIsomorphicLayoutEffect(() => {
    const tabsEl = tabsRef.current;
    const tab = tabsEl?.querySelectorAll<HTMLElement>(".topnav-tab")[targetIndex];
    if (!tabsEl || !tab) {
      setIndicator(null);
      return;
    }

    let cancelled = false;
    const measure = () => {
      if (cancelled) return;
      const navRect = tabsEl.getBoundingClientRect();
      const tabRect = tab.getBoundingClientRect();
      setIndicator({ left: tabRect.left - navRect.left, width: tabRect.width });
    };
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(tabsEl);
    // The mono webfont swaps in after hydration and changes every tab's width.
    document.fonts?.ready.then(measure).catch(() => {});

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [targetIndex, tabs.length, userEmail]);

  return (
    <header className="topnav">
      <Link href="/" className="topnav-logo">
        <MindMapprMark className="topnav-mark" />
        <Wordmark className="topnav-name" />
      </Link>

      {userEmail && (
        <nav
          className="topnav-tabs"
          ref={tabsRef}
          onMouseLeave={() => setHoveredIndex(null)}
        >
          {tabs.map((t, i) => (
            <Link
              key={t.href}
              href={t.href}
              className={`topnav-tab${i === activeIndex ? " topnav-tab--active" : ""}`}
              aria-current={i === activeIndex ? "page" : undefined}
              onMouseEnter={() => setHoveredIndex(i)}
              onFocus={() => setHoveredIndex(i)}
              onBlur={() => setHoveredIndex(null)}
            >
              {t.label}
            </Link>
          ))}
          {indicator && (
            <span
              className="topnav-indicator"
              style={{ transform: `translateX(${indicator.left}px)`, width: indicator.width }}
              aria-hidden="true"
            />
          )}
        </nav>
      )}

      <div className="topnav-right">
        {userEmail ? (
          <>
            <div className="topnav-user">
              <span className="topnav-avatar">{userEmail[0]?.toUpperCase()}</span>
              <span className="topnav-email">{userEmail}</span>
            </div>
            <button className="btn-signout" onClick={handleSignOut}>Sign out</button>
          </>
        ) : (
          <div className="topnav-auth">
            <Link href="/login" className="btn btn-ghost">Sign in</Link>
            <Link href="/register" className="btn btn-primary">Sign up</Link>
          </div>
        )}
      </div>
    </header>
  );
}
