"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { getUser, logout, type AuthUser } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { disconnectSocket } from "@/lib/socket";
import { disconnectChatSocket } from "@/lib/chat-socket";
import { useTheme } from "@/lib/theme";

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useI18n();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setUser(getUser());
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  function handleLogout() {
    disconnectSocket();
    disconnectChatSocket();
    logout();
    router.replace("/login");
  }

  const devicesActive = pathname.startsWith("/devices");
  const archiveActive = pathname.startsWith("/archive");
  const usersActive = pathname.startsWith("/users");
  const subsActive = pathname.startsWith("/subscriptions");
  const chatsActive = pathname.startsWith("/chats");
  const supportActive = pathname.startsWith("/support");
  const liveActive = pathname.startsWith("/live");
  const auditActive = pathname.startsWith("/audit");

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <div className="admin-header-inner">
          <Link href="/devices" className="brand">
            {t("brandName")}
          </Link>

          <button
            type="button"
            className={`nav-toggle${menuOpen ? " is-open" : ""}`}
            aria-expanded={menuOpen}
            aria-controls="admin-menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className="nav-toggle-bars" aria-hidden />
            <span className="sr-only">{menuOpen ? t("navClose") : t("navMenu")}</span>
          </button>

          <div
            id="admin-menu"
            className={`admin-header-menus${menuOpen ? " is-open" : ""}`}
          >
            <nav className="admin-nav">
              <Link href="/devices" className={devicesActive ? "nav-active" : undefined}>
                {t("navDevices")}
              </Link>
              <Link href="/users" className={usersActive ? "nav-active" : undefined}>
                {t("navUsers")}
              </Link>
              <Link href="/subscriptions" className={subsActive ? "nav-active" : undefined}>
                {t("navSubscriptions")}
              </Link>
              <Link href="/chats" className={chatsActive ? "nav-active" : undefined}>
                {t("navChats")}
              </Link>
              <Link href="/support" className={supportActive ? "nav-active" : undefined}>
                {t("navSupport")}
              </Link>
              <Link href="/live" className={liveActive ? "nav-active" : undefined}>
                {t("navLive")}
              </Link>
              <Link href="/archive" className={archiveActive ? "nav-active" : undefined}>
                {t("navArchive")}
              </Link>
              <Link href="/audit" className={auditActive ? "nav-active" : undefined}>
                {t("navAudit")}
              </Link>
            </nav>
            <div className="admin-header-right">
              <LanguageSwitcher />
              <ThemeToggle />
              {user && <span className="user-chip">{user.name || user.email}</span>}
              <button
                type="button"
                className="btn btn-ghost btn-sm nav-logout"
                onClick={handleLogout}
              >
                {t("navLogout")}
              </button>
            </div>
          </div>
        </div>
      </header>
      {menuOpen && (
        <button
          type="button"
          className="nav-scrim"
          aria-label={t("navClose")}
          onClick={() => setMenuOpen(false)}
        />
      )}
      <main className="admin-main">{children}</main>
    </div>
  );
}

function ThemeToggle() {
  const { mode, setMode } = useTheme();
  const { t } = useI18n();
  const next: Record<"system" | "light" | "dark", "light" | "dark" | "system"> = {
    system: "light",
    light: "dark",
    dark: "system",
  };
  const label =
    mode === "dark" ? t("themeDark") : mode === "light" ? t("themeLight") : t("themeSystem");
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      onClick={() => setMode(next[mode])}
      aria-label={t("themeSwitch")}
    >
      {label}
    </button>
  );
}
