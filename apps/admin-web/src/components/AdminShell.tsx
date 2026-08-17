"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { logout, getUser } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { disconnectSocket } from "@/lib/socket";

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = getUser();
  const { t } = useI18n();

  function handleLogout() {
    disconnectSocket();
    logout();
    router.replace("/login");
  }

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <div className="admin-header-inner">
          <Link href="/devices" className="brand">
            Monitor
          </Link>
          <nav className="admin-nav">
            <Link
              href="/devices"
              className={pathname.startsWith("/devices") ? "nav-active" : undefined}
            >
              {t("navDevices")}
            </Link>
            <Link
              href="/archive"
              className={pathname.startsWith("/archive") ? "nav-active" : undefined}
            >
              {t("navArchive")}
            </Link>
          </nav>
          <div className="admin-header-right">
            <LanguageSwitcher />
            {user && <span className="user-chip">{user.name || user.email}</span>}
            <button type="button" className="btn btn-ghost btn-sm" onClick={handleLogout}>
              {t("navLogout")}
            </button>
          </div>
        </div>
      </header>
      <main className="admin-main">{children}</main>
    </div>
  );
}
