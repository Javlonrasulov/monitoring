"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { avatarUrl } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { deviceApi } from "@/lib/device-api";
import { counterpartName, formatShortDate, formatTime, isUserThread } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { ChatThreadDto } from "@/lib/types";

export default function ChatsPage() {
  const { t } = useI18n();
  const session = getSession();
  const [threads, setThreads] = useState<ChatThreadDto[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const list = await deviceApi.chats();
        if (!cancelled) setThreads(list);
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    const id = window.setInterval(load, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const visible = useMemo(() => {
    const base = threads.filter((th) => isUserThread(th.kind));
    const query = q.trim().toLowerCase();
    if (!query) return base;
    return base.filter((th) => {
      const name = counterpartName(th, session?.userId).toLowerCase();
      const preview = (th.lastMessagePreview || "").toLowerCase();
      return name.includes(query) || preview.includes(query);
    });
  }, [threads, q, session?.userId]);

  return (
    <AppShell title={t("chats")}>
      <div className="stack" style={{ gap: 14 }}>
        <div className="field">
          <label className="sr-only" htmlFor="search">
            {t("search")}
          </label>
          <input
            id="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("search")}
          />
        </div>

        {loading ? (
          <div className="stack">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="skeleton" style={{ height: 64 }} />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="empty">
            <h3>{t("emptyChats")}</h3>
            <p>{t("emptyChatsHint")}</p>
          </div>
        ) : (
          <div className="chat-list card" style={{ padding: 8 }}>
            {visible.map((th) => {
              const name = counterpartName(th, session?.userId);
              const initials = name.slice(0, 1).toUpperCase();
              const peerId = th.counterpartUserId || th.peer?.id || th.owner?.id;
              const hasAvatar =
                th.counterpartHasAvatar ||
                th.peer?.hasAvatar ||
                th.owner?.hasAvatar;
              const avatarVer =
                th.counterpartAvatarUpdatedAt ||
                th.peer?.avatarUpdatedAt ||
                th.owner?.avatarUpdatedAt;
              const time =
                formatTime(th.lastMessageAt) ||
                formatShortDate(th.lastMessageAt);

              return (
                <Link key={th.id} href={`/chats/${th.id}`} className="chat-row">
                  <div className="avatar">
                    {hasAvatar && peerId ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={avatarUrl(peerId, avatarVer)} alt="" />
                    ) : (
                      initials
                    )}
                    {th.online ? <span className="online-dot" /> : null}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <strong
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {name}
                      </strong>
                      <span className="muted" style={{ fontSize: "0.75rem" }}>
                        {time}
                      </span>
                    </div>
                    <div className="row" style={{ justifyContent: "space-between", gap: 8 }}>
                      <span
                        className="muted"
                        style={{
                          fontSize: "0.86rem",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {th.lastMessagePreview || "—"}
                      </span>
                      {(th.unreadCount || 0) > 0 ? (
                        <span className="badge" style={{ position: "static" }}>
                          {th.unreadCount}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
