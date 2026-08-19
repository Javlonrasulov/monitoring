"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AdminShell } from "@/components/AdminShell";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { getChatSocket } from "@/lib/chat-socket";

type Thread = {
  id: string;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  counterpartName?: string;
  unreadCount?: number;
  online?: boolean;
  owner: { name: string };
  peer: { name: string };
  device: { name: string } | null;
};

export default function ChatsPage() {
  const { t, locale } = useI18n();
  const [rows, setRows] = useState<Thread[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<Thread[]>("/chats").then(setRows).catch((e: Error) => setError(e.message));
    const socket = getChatSocket();
    const refresh = () => {
      api.get<Thread[]>("/chats").then(setRows).catch(() => undefined);
    };
    socket.on("chat.message", refresh);
    socket.on("chat.read", refresh);
    socket.on("chat.presence", refresh);
    return () => {
      socket.off("chat.message", refresh);
      socket.off("chat.read", refresh);
      socket.off("chat.presence", refresh);
    };
  }, []);

  return (
    <AdminShell>
      <div className="msg-list-page">
        <h1>{t("chatsTitle")}</h1>
        <p className="muted">{t("chatsSubtitle")}</p>
        {error && <p className="form-error">{error}</p>}
        {rows.length === 0 ? (
          <p className="muted">{t("chatsEmpty")}</p>
        ) : (
          <ul className="msg-thread-list">
            {rows.map((row) => {
              const name = row.counterpartName || row.peer.name;
              return (
                <li key={row.id}>
                  <Link href={`/chats/${row.id}`} className="msg-thread-row">
                    <span className={`msg-avatar${row.online ? " is-online" : ""}`}>
                      {name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="msg-thread-main">
                      <strong>{name}</strong>
                      <span className="muted small">{row.lastMessagePreview ?? "—"}</span>
                    </span>
                    <span className="msg-thread-meta">
                      <span className="muted small">
                        {row.lastMessageAt
                          ? new Date(row.lastMessageAt).toLocaleTimeString(locale === "ru" ? "ru-RU" : locale === "en" ? "en-US" : "uz-UZ", { hour: "2-digit", minute: "2-digit" })
                          : ""}
                      </span>
                      {(row.unreadCount ?? 0) > 0 && (
                        <span className="msg-unread">{row.unreadCount}</span>
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AdminShell>
  );
}
