"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AdminShell } from "@/components/AdminShell";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

type Message = {
  id: string;
  text: string | null;
  messageType: string;
  createdAt: string;
  senderUserId: string | null;
  attachmentUrl: string | null;
  deliveredAt: string | null;
  readAt: string | null;
};

export default function ChatDetailPage() {
  const { t } = useI18n();
  const params = useParams<{ id: string }>();
  const [items, setItems] = useState<Message[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ items: Message[] }>(`/chats/${params.id}/messages`)
      .then((data) => setItems(data.items))
      .catch((e: Error) => setError(e.message));
  }, [params.id]);

  return (
    <AdminShell>
      <Link href="/chats">{t("chatsTitle")}</Link>
      <h1>{t("chatMessages")}</h1>
      {error && <p className="form-error">{error}</p>}
      {items.length === 0 ? (
        <p className="muted">{t("chatEmpty")}</p>
      ) : (
        <ul className="list">
          {items.map((item) => (
            <li key={item.id}>
              <div className="muted small">
                {new Date(item.createdAt).toLocaleString()} · {item.messageType}
                {item.readAt ? " · read" : ""}
              </div>
              <div>{item.text ?? item.attachmentUrl ?? "—"}</div>
            </li>
          ))}
        </ul>
      )}
    </AdminShell>
  );
}
