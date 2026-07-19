"use client";

import { useEffect, useState } from "react";
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

export function TopNav() {
  const router = useRouter();
  const pathname = usePathname();
  const [userEmail, setUserEmail] = useState<string | null>(null);

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

  return (
    <header className="topnav">
      <Link href="/" className="topnav-logo">
        <MindMapprMark className="topnav-mark" />
        <Wordmark className="topnav-name" />
      </Link>

      {userEmail && (
        <nav className="topnav-tabs">
          {TABS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className={`topnav-tab${isActive(t.href) ? " topnav-tab--active" : ""}`}
            >
              {t.label}
            </Link>
          ))}
          {pathname.startsWith("/map/") && (
            <Link href={pathname} className="topnav-tab topnav-tab--active" aria-current="page">
              Learning map
            </Link>
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
