"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AdminShell } from "@/components/AdminShell";
import { AuthAvatar } from "@/components/AuthAvatar";
import { api, API_URL, authorizedMediaUrl } from "@/lib/api";
import { getUser } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { getChatSocket } from "@/lib/chat-socket";

type Reaction = { emoji: string; count: number; mine: boolean };
type Reply = { id: string; text: string | null; messageType: string; fileName: string | null };
type Message = {
  id: string;
  text: string | null;
  messageType: string;
  createdAt: string;
  senderUserId: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  editedAt: string | null;
  deletedForEveryone: boolean;
  fileName: string | null;
  fileSize: number | null;
  durationMs: number | null;
  hasFile: boolean;
  hasThumbnail: boolean;
  forwarded: boolean;
  mine: boolean;
  replyTo: Reply | null;
  reactions: Reaction[];
};

type Thread = {
  id: string;
  counterpartName?: string;
  counterpartUserId?: string;
  counterpartPhone?: string | null;
  counterpartHasAvatar?: boolean;
  counterpartAvatarUpdatedAt?: string | null;
  online?: boolean;
  lastSeenAt?: string | null;
  viewerUserId?: string;
  peer: { name: string };
  owner: { name: string };
};

type MediaPage = {
  counts: { photos: number; videos: number; notes: number; files: number; voice: number; links: number };
  items: Message[];
};

function ticks(message: Message) {
  if (message.readAt) return "✓✓";
  if (message.deliveredAt) return "✓✓";
  return "✓";
}

export default function ChatDetailPage() {
  const { t, locale } = useI18n();
  const params = useParams<{ id: string }>();
  const user = getUser();
  const canSend = user?.role === "ADMIN";
  const [thread, setThread] = useState<Thread | null>(null);
  const [items, setItems] = useState<Message[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [typing, setTyping] = useState(false);
  const [search, setSearch] = useState("");
  const [hits, setHits] = useState<Message[]>([]);
  const [tab, setTab] = useState<"chat" | "media" | "files" | "links" | "voice">("chat");
  const [media, setMedia] = useState<MediaPage | null>(null);
  const [menu, setMenu] = useState<Message | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.get<Thread>(`/chats/${params.id}`).then(setThread).catch((e: Error) => setError(e.message));
    api.get<{ items: Message[] }>(`/chats/${params.id}/messages?take=80`)
      .then((data) => setItems(data.items))
      .catch((e: Error) => setError(e.message));
    api.post(`/chats/${params.id}/read`).catch(() => undefined);

    const socket = getChatSocket();
    const onMessage = (payload: { threadId?: string; message?: Message }) => {
      if (payload.threadId !== params.id || !payload.message) return;
      setItems((current) => {
        const without = current.filter((row) => row.id !== payload.message!.id);
        return [...without, payload.message!];
      });
    };
    const onTyping = (payload: { threadId?: string; typing?: boolean; userId?: string }) => {
      if (payload.threadId === params.id && payload.userId !== user?.id) {
        setTyping(payload.typing !== false);
      }
    };
    socket.on("chat.message", onMessage);
    socket.on("chat.message.updated", onMessage);
    socket.on("chat.typing", onTyping);
    const onProfile = () => {
      api.get<Thread>(`/chats/${params.id}`).then(setThread).catch(() => undefined);
    };
    socket.on("chat.profile", onProfile);
    return () => {
      socket.off("chat.message", onMessage);
      socket.off("chat.message.updated", onMessage);
      socket.off("chat.typing", onTyping);
      socket.off("chat.profile", onProfile);
    };
  }, [params.id, user?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [items.length]);

  const grouped = useMemo(() => {
    const days: { label: string; items: Message[] }[] = [];
    for (const item of items) {
      const date = new Date(item.createdAt);
      const today = new Date();
      const yday = new Date();
      yday.setDate(today.getDate() - 1);
      const label =
        date.toDateString() === today.toDateString()
          ? t("chatToday")
          : date.toDateString() === yday.toDateString()
            ? t("chatYesterday")
            : date.toLocaleDateString(locale === "ru" ? "ru-RU" : locale === "en" ? "en-US" : "uz-UZ");
      const last = days[days.length - 1];
      if (!last || last.label !== label) days.push({ label, items: [item] });
      else last.items.push(item);
    }
    return days;
  }, [items, locale, t]);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!canSend || !draft.trim()) return;
    const text = draft.trim();
    setDraft("");
    const sent = await api.post<Message>(`/chats/${params.id}/messages`, {
      text,
      replyToId: replyTo?.id,
    });
    setReplyTo(null);
    setItems((current) => [...current.filter((row) => row.id !== sent.id), sent]);
  }

  async function loadTab(next: typeof tab) {
    setTab(next);
    if (next === "chat") return;
    const kind = next === "media" ? "media" : next === "files" ? "files" : next === "voice" ? "voice" : "links";
    const data = await api.get<MediaPage>(`/chats/${params.id}/media?kind=${kind}`);
    setMedia(data);
  }

  async function searchMessages(value: string) {
    setSearch(value);
    if (!value.trim()) {
      setHits([]);
      return;
    }
    const data = await api.get<{ items: Message[] }>(`/chats/${params.id}/search?q=${encodeURIComponent(value)}`);
    setHits(data.items);
  }

  return (
    <AdminShell>
      <div className="msg-shell">
        <header className="msg-top">
          <Link href="/chats">{t("chatsTitle")}</Link>
          <div className="msg-peer">
            <AuthAvatar
              userId={thread?.counterpartUserId}
              name={thread?.counterpartName || thread?.peer.name || "?"}
              hasAvatar={thread?.counterpartHasAvatar}
              updatedAt={thread?.counterpartAvatarUpdatedAt}
              online={thread?.online}
            />
            <div>
              <strong>{thread?.counterpartName || thread?.peer.name || t("chatMessages")}</strong>
              {thread?.counterpartPhone ? (
                <div className="muted small">{thread.counterpartPhone}</div>
              ) : null}
              <div className="muted small">
                {typing ? t("chatTyping") : thread?.online ? t("chatOnline") : t("chatOffline")}
              </div>
            </div>
          </div>
          <input
            className="msg-search"
            value={search}
            onChange={(e) => void searchMessages(e.target.value)}
            placeholder={t("chatSearch")}
          />
        </header>
        <nav className="msg-tabs">
          {(["chat", "media", "files", "links", "voice"] as const).map((id) => (
            <button key={id} type="button" className={tab === id ? "is-active" : undefined} onClick={() => void loadTab(id)}>
              {id === "chat" ? t("chatMessages") : id === "media" ? t("chatMedia") : id === "files" ? t("chatFiles") : id === "links" ? t("chatLinks") : t("chatVoice")}
            </button>
          ))}
        </nav>
        {error && <p className="form-error">{error}</p>}
        {hits.length > 0 && (
          <ul className="msg-search-hits">
            {hits.map((hit) => (
              <li key={hit.id}>
                <button type="button" onClick={() => document.getElementById(`m-${hit.id}`)?.scrollIntoView({ behavior: "smooth" })}>
                  {hit.text || hit.fileName || hit.messageType}
                </button>
              </li>
            ))}
          </ul>
        )}
        {tab === "chat" ? (
          <div className="msg-stream">
            {grouped.length === 0 ? (
              <p className="muted">{t("chatEmpty")}</p>
            ) : (
              grouped.map((group) => (
                <section key={group.label}>
                  <div className="msg-day">{group.label}</div>
                  {group.items.map((item) => (
                    <article
                      id={`m-${item.id}`}
                      key={item.id}
                      className={`msg-bubble${item.mine ? " is-mine" : ""}`}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        setMenu(item);
                      }}
                    >
                      {item.forwarded && <div className="msg-label">Forwarded</div>}
                      {item.replyTo && (
                        <div className="msg-reply">{item.replyTo.text || item.replyTo.fileName || item.replyTo.messageType}</div>
                      )}
                      <MessageBody threadId={params.id} message={item} />
                      <div className="msg-meta">
                        {item.editedAt ? "edited · " : ""}
                        {new Date(item.createdAt).toLocaleTimeString(locale === "ru" ? "ru-RU" : "en-GB", { hour: "2-digit", minute: "2-digit" })}
                        {item.mine ? ` ${ticks(item)}` : ""}
                      </div>
                      {item.reactions.length > 0 && (
                        <div className="msg-reactions">
                          {item.reactions.map((reaction) => (
                            <span key={reaction.emoji}>{reaction.emoji} {reaction.count}</span>
                          ))}
                        </div>
                      )}
                    </article>
                  ))}
                </section>
              ))
            )}
            <div ref={bottomRef} />
          </div>
        ) : (
          <ul className="msg-media-grid">
            {(media?.items ?? []).map((item) => (
              <li key={item.id}>
                <button type="button" onClick={() => document.getElementById(`m-${item.id}`)?.scrollIntoView({ behavior: "smooth" })}>
                  {item.fileName || item.text || item.messageType}
                </button>
              </li>
            ))}
          </ul>
        )}
        {menu && (
          <div className="msg-menu" role="menu">
            {["👍", "❤️", "😂", "🔥", "😮"].map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  void api.post(`/chats/${params.id}/messages/${menu.id}/react`, { emoji });
                  setMenu(null);
                }}
              >
                {emoji}
              </button>
            ))}
            <button type="button" onClick={() => { setReplyTo(menu); setMenu(null); }}>{t("chatReply")}</button>
            <button type="button" onClick={() => { void navigator.clipboard.writeText(menu.text || menu.fileName || ""); setMenu(null); }}>{t("chatCopy")}</button>
            {menu.mine && (
              <button
                type="button"
                onClick={() => {
                  void api.delete(`/chats/${params.id}/messages/${menu.id}?forEveryone=true`);
                  setMenu(null);
                }}
              >
                {t("chatDeleteEveryone")}
              </button>
            )}
            <button type="button" onClick={() => setMenu(null)}>✕</button>
          </div>
        )}
        {canSend ? (
          <form className="msg-composer" onSubmit={(event) => void send(event)}>
            {replyTo && (
              <div className="msg-reply-draft">
                {t("chatReply")}: {replyTo.text || replyTo.fileName}
                <button type="button" onClick={() => setReplyTo(null)}>✕</button>
              </div>
            )}
            <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t("chatPlaceholder")} />
            <button type="submit">{t("chatSend")}</button>
          </form>
        ) : (
          <p className="muted msg-viewer-note">{t("chatViewerOnly")}</p>
        )}
      </div>
    </AdminShell>
  );
}

function MessageBody({ threadId, message }: { threadId: string; message: Message }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!message.hasFile && !message.hasThumbnail) return;
    const path = message.hasThumbnail
      ? `/chats/${threadId}/files/${message.id}/thumb`
      : `/chats/${threadId}/files/${message.id}`;
    let revoked: string | null = null;
    authorizedMediaUrl(path).then((next) => {
      revoked = next;
      setUrl(next);
    }).catch(() => undefined);
    return () => {
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [message.hasFile, message.hasThumbnail, message.id, threadId]);

  if (message.deletedForEveryone) return <div className="msg-deleted">This message was deleted</div>;
  if (message.messageType === "IMAGE" && url) return <img src={url} alt={message.fileName ?? "photo"} className="msg-photo" />;
  if (message.messageType === "VIDEO" && url) return <video src={url} controls className="msg-video" />;
  if (message.messageType === "VIDEO_NOTE" && url) return <video src={url} controls className="msg-note" />;
  if (message.messageType === "VOICE" && url) return <audio src={url} controls />;
  if (message.messageType === "FILE") {
    return (
      <a href={`${API_URL}/chats/${threadId}/files/${message.id}?download=1`} onClick={(event) => {
        event.preventDefault();
        void authorizedMediaUrl(`/chats/${threadId}/files/${message.id}?download=1`).then((href) => {
          const a = document.createElement("a");
          a.href = href;
          a.download = message.fileName || "file";
          a.click();
        });
      }}>
        📄 {message.fileName} ({Math.round((message.fileSize ?? 0) / 1024)} KB)
      </a>
    );
  }
  return <div>{message.text}</div>;
}
