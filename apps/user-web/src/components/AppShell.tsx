"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  MessageCircle,
  Settings,
  UserRound,
  Moon,
  Sun,
  SlidersHorizontal,
  Send,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AppearanceSheet } from "@/components/AppearanceSheet";
import { isPaired } from "@/lib/auth";
import { deviceApi } from "@/lib/device-api";
import { useI18n } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";

type NavKey = "chats" | "settings" | "profile";

const NAV: { key: NavKey; href: string; icon: LucideIcon }[] = [
  { key: "chats", href: "/chats", icon: MessageCircle },
  { key: "settings", href: "/settings", icon: Settings },
  { key: "profile", href: "/profile", icon: UserRound },
];

export function AppShell({
  title,
  children,
  hideChrome = false,
  brandHeader = true,
}: {
  title?: string;
  children: ReactNode;
  hideChrome?: boolean;
  /** Android-style brand top bar (logo + name + tagline). */
  brandHeader?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useI18n();
  const { resolved, toggleLightDark } = useTheme();
  const [chatUnread, setChatUnread] = useState(0);
  const [supportUnread, setSupportUnread] = useState(0);
  const [ready, setReady] = useState(false);
  const [showAppearance, setShowAppearance] = useState(false);

  useEffect(() => {
    if (!isPaired()) {
      router.replace("/login");
      return;
    }
    setReady(true);
  }, [router]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;

    const load = async () => {
      try {
        const [threads, support] = await Promise.all([
          deviceApi.chats(),
          deviceApi.supportSummary(),
        ]);
        if (cancelled) return;
        const unread = threads
          .filter((th) => (th.kind || "").toUpperCase() !== "SUPPORT")
          .reduce((sum, th) => sum + (th.unreadCount || 0), 0);
        setChatUnread(unread);
        setSupportUnread(support.unreadCount || 0);
      } catch {
        /* ignore */
      }
    };

    load();
    const id = window.setInterval(load, 8000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [ready, pathname]);

  const active = useMemo(() => {
    if (pathname.startsWith("/settings") || pathname.startsWith("/live")) {
      return "settings";
    }
    if (pathname.startsWith("/profile")) return "profile";
    return "chats";
  }, [pathname]);

  if (!ready) {
    return (
      <div className="auth-page">
        <div className="skeleton" style={{ width: 220, height: 28 }} />
      </div>
    );
  }

  if (hideChrome) {
    return <>{children}</>;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="brand-mark brand-mark-plane" aria-hidden>
            <Send size={16} />
          </span>
          {t("appName")}
        </div>
        {NAV.map((item) => {
          const Icon = item.icon;
          const label = t(item.key);
          return (
            <Link
              key={item.key}
              href={item.href}
              className={`nav-item ${active === item.key ? "active" : ""}`}
            >
              <Icon size={18} />
              <span>{label}</span>
              {item.key === "chats" && chatUnread > 0 ? (
                <span style={{ marginLeft: "auto", fontSize: 12 }}>{chatUnread}</span>
              ) : null}
              {item.key === "profile" && supportUnread > 0 ? (
                <span style={{ marginLeft: "auto", fontSize: 12 }}>{supportUnread}</span>
              ) : null}
            </Link>
          );
        })}
      </aside>

      <div className="main-col">
        <header className={`topbar ${brandHeader ? "topbar-brand" : ""}`}>
          {brandHeader ? (
            <div className="topbar-brand-block">
              <span className="brand-mark brand-mark-plane" aria-hidden>
                <Send size={18} />
              </span>
              <div className="topbar-titles">
                <h1>{t("appName")}</h1>
                <p>{t("brandTagline")}</p>
              </div>
            </div>
          ) : (
            <h1>{title || t(active)}</h1>
          )}
          <div className="topbar-actions">
            <button
              type="button"
              className="icon-pill"
              onClick={toggleLightDark}
              aria-label={t("changeTheme")}
            >
              {resolved === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button
              type="button"
              className="icon-pill"
              onClick={() => setShowAppearance(true)}
              aria-label={t("changeLanguage")}
            >
              <SlidersHorizontal size={18} />
            </button>
          </div>
        </header>
        <div className="page">{children}</div>
      </div>

      <nav className="dock" aria-label="Primary">
        {NAV.map((item) => {
          const Icon = item.icon;
          const count =
            item.key === "chats"
              ? chatUnread
              : item.key === "profile"
                ? supportUnread
                : 0;
          return (
            <Link
              key={item.key}
              href={item.href}
              className={active === item.key ? "active" : ""}
            >
              <Icon size={20} />
              <span>{t(item.key)}</span>
              {count > 0 ? (
                <span className="badge">{count > 99 ? "99+" : count}</span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      {showAppearance ? (
        <AppearanceSheet onClose={() => setShowAppearance(false)} />
      ) : null}
    </div>
  );
}
