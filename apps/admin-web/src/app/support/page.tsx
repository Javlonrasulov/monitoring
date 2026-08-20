"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AdminShell } from "@/components/AdminShell";
import { AuthAvatar } from "@/components/AuthAvatar";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { getChatSocket } from "@/lib/chat-socket";

type Thread = {
  id: string;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  counterpartName?: string;
  counterpartUserId?: string;
  counterpartPhone?: string | null;
  counterpartHasAvatar?: boolean;
  counterpartAvatarUpdatedAt?: string | null;
  unreadCount?: number;
  online?: boolean;
  peer: { name: string; phone?: string | null };
  device: { name: string } | null;
};

type AppUser = {
  id: string;
  name: string;
  phone?: string | null;
  device: { id: string; name: string } | null;
};

export default function SupportPage() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [rows, setRows] = useState<Thread[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  useEffect(() => {
    api.get<Thread[]>("/chats/support").then(setRows).catch((e: Error) => setError(e.message));
    api.get<AppUser[]>("/users").then(setUsers).catch(() => undefined);
    const socket = getChatSocket();
    const refresh = () => {
      api.get<Thread[]>("/chats/support").then(setRows).catch(() => undefined);
    };
    socket.on("chat.message", refresh);
    socket.on("chat.read", refresh);
    socket.on("chat.presence", refresh);
    socket.on("chat.profile", refresh);
    return () => {
      socket.off("chat.message", refresh);
      socket.off("chat.read", refresh);
      socket.off("chat.presence", refresh);
      socket.off("chat.profile", refresh);
    };
  }, []);

  async function openForUser(userId: string) {
    setBusyUserId(userId);
    setError(null);
    try {
      const thread = await api.post<Thread>("/chats/support/open", { peerUserId: userId });
      router.push(`/support/${thread.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("supportOpenError"));
    } finally {
      setBusyUserId(null);
    }
  }

  const appUsers = users.filter((row) => row.device);

  return (
    <AdminShell>
      <div className="msg-list-page">
        <h1>{t("supportTitle")}</h1>
        <p className="muted">{t("supportSubtitle")}</p>
        {error && <p className="form-error">{error}</p>}
        {rows.length === 0 ? (
          <p className="muted">{t("supportEmpty")}</p>
        ) : (
          <ul className="msg-thread-list">
            {rows.map((row) => {
              const name = row.counterpartName || row.peer.name;
              return (
                <li key={row.id}>
                  <Link href={`/support/${row.id}`} className="msg-thread-row">
                    <AuthAvatar
                      userId={row.counterpartUserId}
                      name={name}
                      hasAvatar={row.counterpartHasAvatar}
                      updatedAt={row.counterpartAvatarUpdatedAt}
                      online={row.online}
                    />
                    <span className="msg-thread-main">
                      <strong>{name}</strong>
                      {row.counterpartPhone || row.peer.phone ? (
                        <span className="muted small">{row.counterpartPhone || row.peer.phone}</span>
                      ) : null}
                      <span className="muted small">{row.lastMessagePreview ?? "—"}</span>
                      {row.device ? (
                        <span className="muted small">{row.device.name}</span>
                      ) : null}
                    </span>
                    <span className="msg-thread-meta">
                      <span className="muted small">
                        {row.lastMessageAt
                          ? new Date(row.lastMessageAt).toLocaleTimeString(
                              locale === "ru" ? "ru-RU" : locale === "en" ? "en-US" : "uz-UZ",
                              { hour: "2-digit", minute: "2-digit" },
                            )
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

        {appUsers.length > 0 && (
          <section className="support-start">
            <h2>{t("supportStartTitle")}</h2>
            <p className="muted">{t("supportStartSubtitle")}</p>
            <ul className="support-user-list">
              {appUsers.map((user) => (
                <li key={user.id}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={busyUserId === user.id}
                    onClick={() => void openForUser(user.id)}
                  >
                    {busyUserId === user.id ? t("supportOpening") : t("supportStartChat")} — {user.name}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </AdminShell>
  );
}
