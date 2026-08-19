"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AdminShell } from "@/components/AdminShell";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

type Thread = {
  id: string;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  owner: { name: string };
  peer: { name: string };
  device: { name: string } | null;
};

export default function ChatsPage() {
  const { t } = useI18n();
  const [rows, setRows] = useState<Thread[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Thread[]>("/chats")
      .then(setRows)
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <AdminShell>
      <h1>{t("chatsTitle")}</h1>
      <p className="muted">{t("chatsSubtitle")}</p>
      {error && <p className="form-error">{error}</p>}
      {rows.length === 0 ? (
        <p className="muted">{t("chatsEmpty")}</p>
      ) : (
        <ul className="list">
          {rows.map((row) => (
            <li key={row.id}>
              <Link href={`/chats/${row.id}`}>
                <strong>{row.peer.name}</strong>
                <span className="muted"> ← {row.owner.name}</span>
                <div className="muted small">{row.lastMessagePreview ?? "—"}</div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AdminShell>
  );
}
