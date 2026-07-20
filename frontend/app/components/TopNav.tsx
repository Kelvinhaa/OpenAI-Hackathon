"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { MindMapprMark } from "@/app/components/MindMapprMark";
import { Wordmark } from "@/app/components/Wordmark";
import type { StudyResponse } from "@/types/study";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8001";

const TABS = [
  { href: "/", label: "Planner", icon: "planner", image: "/nav/planner.png" },
  { href: "/library", label: "Library", icon: "library", image: "/nav/library.png" },
  { href: "/review", label: "Review", icon: "review", image: "/nav/review.png" },
] as const;

// useLayoutEffect warns during SSR; the nav only measures in the browser.
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function mostRecentMapHref(studies: StudyResponse[]) {
  const mostRecentStudy = studies.reduce<StudyResponse | null>((latest, study) => {
    if (!latest) return study;

    const latestCreatedAt = Date.parse(latest.created_at ?? "");
    const studyCreatedAt = Date.parse(study.created_at ?? "");
    return studyCreatedAt >= latestCreatedAt ? study : latest;
  }, null);

  return mostRecentStudy ? `/map/${mostRecentStudy.id}` : null;
}

function displayNameForUser(user: { email?: string; user_metadata?: Record<string, unknown> } | null) {
  const username = user?.user_metadata?.username;
  if (typeof username === "string" && username.trim()) return username.trim();
  return user?.email ?? null;
}

export function TopNav({ planMapHref }: { planMapHref?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [userDisplayName, setUserDisplayName] = useState<string | null>(null);
  const [latestMapHref, setLatestMapHref] = useState<string | null>(null);
  const tabsRef = useRef<HTMLElement>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    async function loadLatestMap(accessToken: string) {
      try {
        const response = await fetch(`${API_BASE}/study`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const studies: StudyResponse[] = response.ok ? await response.json() : [];
        if (active) setLatestMapHref(mostRecentMapHref(studies));
      } catch {
        if (active) setLatestMapHref(null);
      }
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return;
      setUserDisplayName(displayNameForUser(session?.user ?? null));
      if (session?.access_token) void loadLatestMap(session.access_token);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserDisplayName(displayNameForUser(session?.user ?? null));
      if (session?.access_token) {
        void loadLatestMap(session.access_token);
      } else {
        setLatestMapHref(null);
      }
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const mapHref = pathname.startsWith("/map/")
    ? pathname
    : planMapHref ?? latestMapHref;
  const tabs = [...TABS, { href: mapHref, label: "Plan map", icon: "planning-map", image: "/nav/planning-map.png" }];
  const activeIndex = tabs.findIndex((tab) => tab.href && isActive(tab.href));

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
  }, [targetIndex, tabs.length, userDisplayName]);

  return (
    <header className="topnav">
      <Link href="/" className="topnav-logo">
        <MindMapprMark className="topnav-mark" />
        <Wordmark className="topnav-name" />
      </Link>

      {userDisplayName && (
        <nav
          className="topnav-tabs"
          ref={tabsRef}
          onMouseLeave={() => setHoveredIndex(null)}
        >
          {tabs.map((tab, index) => (
            tab.href ? (
              <Link
                key={tab.href}
                href={tab.href}
                className={`topnav-tab${index === activeIndex ? " topnav-tab--active" : ""}`}
                aria-current={index === activeIndex ? "page" : undefined}
                onMouseEnter={() => setHoveredIndex(index)}
                onFocus={() => setHoveredIndex(index)}
                onBlur={() => setHoveredIndex(null)}
              >
                <Image
                  className="topnav-tab-icon"
                  data-nav-icon={tab.icon}
                  src={tab.image}
                  alt=""
                  width={24}
                  height={24}
                />
                <span>{tab.label}</span>
              </Link>
            ) : (
              <span key={tab.label} className="topnav-tab topnav-tab--disabled" aria-disabled="true" title="Create a plan to open its map">
                <Image
                  className="topnav-tab-icon"
                  data-nav-icon={tab.icon}
                  src={tab.image}
                  alt=""
                  width={24}
                  height={24}
                />
                <span>{tab.label}</span>
              </span>
            )
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
        {userDisplayName ? (
          <>
            <div className="topnav-user">
              <span className="topnav-avatar">{userDisplayName[0]?.toUpperCase()}</span>
              <span className="topnav-email">{userDisplayName}</span>
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
