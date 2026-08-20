"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Paperclip,
  SendHorizontal,
  Smile,
} from "lucide-react";
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppShell } from "@/components/AppShell";
import { AuthedImage } from "@/components/AuthedImage";
import { getSession, getToken } from "@/lib/auth";
import { authFileUrl, deviceApi, uploadChatFile } from "@/lib/device-api";
import {
  clientId,
  counterpartName,
  formatDay,
  formatTime,
} from "@/lib/format";
import { emitTyping, getChatSocket } from "@/lib/chat-socket";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/lib/toast";
import type { ChatMessageDto, ChatThreadDto } from "@/lib/types";

const REACTIONS = ["👍", "❤️", "😂", "🔥", "😮"];

export default function ChatThreadPage() {
  const params = useParams<{ id: string }>();
  const threadId = params.id;
  const router = useRouter();
  const { t } = useI18n();
  const toast = useToast();
  const session = getSession();
  const token = getToken();

  const [thread, setThread] = useState<ChatThreadDto | null>(null);
  const [messages, setMessages] = useState<ChatMessageDto[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<ChatMessageDto | null>(null);
  const [editing, setEditing] = useState<ChatMessageDto | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [peerTyping, setPeerTyping] = useState(false);
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const typingTimer = useRef<number | null>(null);

  const title = useMemo(
    () => (thread ? counterpartName(thread, session?.userId) : t("chats")),
    [thread, session?.userId, t],
  );

  const mergeMessage = useCallback((msg: ChatMessageDto) => {
    setMessages((prev) => {
      const byClient =
        msg.clientId && prev.findIndex((m) => m.clientId === msg.clientId);
      if (typeof byClient === "number" && byClient >= 0) {
        const next = [...prev];
        next[byClient] = msg;
        return next;
      }
      if (prev.some((m) => m.id === msg.id)) {
        return prev.map((m) => (m.id === msg.id ? msg : m));
      }
      return [...prev, msg];
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [th, page] = await Promise.all([
          deviceApi.thread(threadId),
          deviceApi.messages(threadId),
        ]);
        if (cancelled) return;
        setThread(th);
        setMessages([...page.items].reverse());
        setCursor(page.nextCursor || null);
        await deviceApi.markRead(threadId);
      } catch {
        toast.push("Failed to load chat", "err");
        router.replace("/chats");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [threadId, router, toast]);

  useEffect(() => {
    let socket;
    try {
      socket = getChatSocket();
    } catch {
      return;
    }

    const onMessage = (payload: { message?: ChatMessageDto } | ChatMessageDto) => {
      const msg =
        payload && typeof payload === "object" && "message" in payload
          ? payload.message
          : (payload as ChatMessageDto);
      if (!msg || msg.threadId !== threadId) return;
      mergeMessage(msg);
      void deviceApi.markRead(threadId);
    };

    const onUpdated = onMessage;
    const onTyping = (p: {
      threadId?: string;
      userId?: string;
      typing?: boolean;
    }) => {
      if (p.threadId !== threadId) return;
      if (p.userId && p.userId === session?.userId) return;
      setPeerTyping(Boolean(p.typing));
    };

    const onPresence = (p: {
      userId?: string;
      online?: boolean;
      lastSeenAt?: string;
    }) => {
      setThread((prev) => {
        if (!prev) return prev;
        const peerId =
          prev.counterpartUserId || prev.peer?.id || prev.owner?.id;
        if (!peerId || peerId !== p.userId) return prev;
        return {
          ...prev,
          online: Boolean(p.online),
          lastSeenAt: p.lastSeenAt ?? prev.lastSeenAt,
        };
      });
    };

    socket.on("chat.message", onMessage);
    socket.on("chat.message.updated", onUpdated);
    socket.on("chat.typing", onTyping);
    socket.on("chat.presence", onPresence);

    return () => {
      socket.off("chat.message", onMessage);
      socket.off("chat.message.updated", onUpdated);
      socket.off("chat.typing", onTyping);
      socket.off("chat.presence", onPresence);
    };
  }, [threadId, mergeMessage, session?.userId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, peerTyping]);

  async function loadOlder() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    const el = listRef.current;
    const prevHeight = el?.scrollHeight || 0;
    try {
      const page = await deviceApi.messages(threadId, cursor);
      setMessages((prev) => [...[...page.items].reverse(), ...prev]);
      setCursor(page.nextCursor || null);
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - prevHeight;
      });
    } finally {
      setLoadingMore(false);
    }
  }

  function onTextChange(value: string) {
    setText(value);
    emitTyping(threadId, true);
    if (typingTimer.current) window.clearTimeout(typingTimer.current);
    typingTimer.current = window.setTimeout(() => {
      emitTyping(threadId, false);
    }, 1200);
  }

  async function sendText(e?: FormEvent) {
    e?.preventDefault();
    const value = text.trim();
    if (!value || busy) return;

    setBusy(true);
    try {
      if (editing) {
        const updated = await deviceApi.editMessage(threadId, editing.id, value);
        mergeMessage(updated);
        setEditing(null);
      } else {
        const cid = clientId();
        const optimistic: ChatMessageDto = {
          id: `tmp_${cid}`,
          threadId,
          text: value,
          messageType: "TEXT",
          mine: true,
          clientId: cid,
          createdAt: new Date().toISOString(),
          replyTo: replyTo
            ? {
                id: replyTo.id,
                text: replyTo.text,
                messageType: replyTo.messageType,
              }
            : undefined,
        };
        setMessages((prev) => [...prev, optimistic]);
        const saved = await deviceApi.sendMessage(threadId, {
          text: value,
          clientId: cid,
          replyToId: replyTo?.id,
        });
        mergeMessage(saved);
        setReplyTo(null);
      }
      setText("");
      emitTyping(threadId, false);
    } catch {
      toast.push("Send failed", "err");
    } finally {
      setBusy(false);
      setMenuFor(null);
    }
  }

  async function onPickFile(file: File | null) {
    if (!file) return;
    setBusy(true);
    const cid = clientId();
    try {
      const type = file.type.startsWith("image/")
        ? "IMAGE"
        : file.type.startsWith("video/")
          ? "VIDEO"
          : file.type.startsWith("audio/")
            ? "VOICE"
            : "FILE";
      const msg = await uploadChatFile(threadId, file, {
        messageType: type,
        clientId: cid,
        replyToId: replyTo?.id,
      });
      mergeMessage(msg);
      setReplyTo(null);
    } catch {
      toast.push("Upload failed", "err");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function react(messageId: string, emoji: string) {
    try {
      const updated = await deviceApi.react(threadId, messageId, emoji);
      mergeMessage(updated);
    } catch {
      toast.push("Reaction failed", "err");
    } finally {
      setMenuFor(null);
    }
  }

  async function remove(messageId: string, forEveryone: boolean) {
    try {
      const updated = await deviceApi.deleteMessage(
        threadId,
        messageId,
        forEveryone,
      );
      mergeMessage(updated);
    } catch {
      toast.push("Delete failed", "err");
    } finally {
      setMenuFor(null);
    }
  }

  let lastDay = "";

  return (
    <AppShell hideChrome>
      <div className="thread-layout">
        <header className="topbar">
          <div className="row">
            <Link href="/chats" className="icon-btn" aria-label={t("back")}>
              <ArrowLeft size={18} />
            </Link>
            <div>
              <h1 style={{ fontSize: "1rem" }}>{title}</h1>
              <div className="muted" style={{ fontSize: "0.75rem" }}>
                {peerTyping
                  ? "typing…"
                  : thread?.online
                    ? t("online")
                    : t("offline")}
              </div>
            </div>
          </div>
        </header>

        <div
          className="messages"
          ref={listRef}
          onScroll={(e) => {
            if (e.currentTarget.scrollTop < 40) void loadOlder();
          }}
        >
          {loadingMore ? (
            <div className="muted" style={{ textAlign: "center" }}>
              {t("loading")}
            </div>
          ) : null}

          {messages.map((m) => {
            const day = formatDay(m.createdAt);
            const showDay = day && day !== lastDay;
            if (day) lastDay = day;
            const mine = Boolean(m.mine);
            const deleted = Boolean(m.deletedForEveryone || m.deletedAt);
            const media =
              m.hasFile &&
              ["IMAGE", "VIDEO", "VIDEO_NOTE", "VOICE", "FILE"].includes(
                (m.messageType || "").toUpperCase(),
              );

            return (
              <div key={m.id} style={{ display: "contents" }}>
                {showDay ? (
                  <div className="bubble system">{day}</div>
                ) : null}
                <div
                  className={`bubble ${m.system ? "system" : mine ? "mine" : "theirs"}`}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    if (!m.system) setMenuFor(m.id);
                  }}
                  onClick={() => {
                    if (!m.system) setMenuFor(menuFor === m.id ? null : m.id);
                  }}
                >
                  {m.replyTo ? (
                    <div
                      style={{
                        fontSize: "0.78rem",
                        opacity: 0.85,
                        borderLeft: "2px solid currentColor",
                        paddingLeft: 8,
                        marginBottom: 6,
                      }}
                    >
                      {m.replyTo.text || m.replyTo.fileName || "Reply"}
                    </div>
                  ) : null}

                  {deleted ? (
                    <em style={{ opacity: 0.8 }}>Deleted</em>
                  ) : media ? (
                    <div className="stack" style={{ gap: 6 }}>
                      {(m.messageType || "").toUpperCase() === "IMAGE" ? (
                        <AuthedImage
                          threadId={threadId}
                          messageId={m.id}
                          style={{ borderRadius: 10, maxHeight: 280 }}
                        />
                      ) : (
                        <a
                          href={authFileUrl(threadId, m.id)}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => {
                            e.preventDefault();
                            void openAuthedFile(threadId, m.id, token);
                          }}
                        >
                          {m.fileName || m.messageType || "Attachment"}
                        </a>
                      )}
                      {m.text ? <div>{m.text}</div> : null}
                    </div>
                  ) : (
                    <div>{m.text}</div>
                  )}

                  {(m.reactions || []).length > 0 ? (
                    <div className="row" style={{ marginTop: 6, flexWrap: "wrap" }}>
                      {m.reactions!.map((r) => (
                        <span
                          key={r.emoji}
                          style={{
                            fontSize: "0.8rem",
                            background: "rgba(0,0,0,0.12)",
                            borderRadius: 999,
                            padding: "2px 6px",
                          }}
                        >
                          {r.emoji} {r.count || 1}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <div className="bubble-meta">
                    {m.editedAt ? <span>edited</span> : null}
                    <span>{formatTime(m.createdAt)}</span>
                  </div>

                  {menuFor === m.id ? (
                    <div
                      className="card"
                      style={{
                        position: "absolute",
                        top: "100%",
                        [mine ? "right" : "left"]: 0,
                        zIndex: 5,
                        marginTop: 6,
                        padding: 8,
                        minWidth: 160,
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="row" style={{ marginBottom: 8 }}>
                        {REACTIONS.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            className="icon-btn"
                            onClick={() => void react(m.id, emoji)}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ width: "100%", minHeight: 36 }}
                        onClick={() => {
                          setReplyTo(m);
                          setMenuFor(null);
                        }}
                      >
                        {t("reply")}
                      </button>
                      {mine && (m.messageType || "TEXT").toUpperCase() === "TEXT" ? (
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ width: "100%", minHeight: 36 }}
                          onClick={() => {
                            setEditing(m);
                            setText(m.text || "");
                            setMenuFor(null);
                          }}
                        >
                          {t("edit")}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="btn btn-danger"
                        style={{ width: "100%", minHeight: 36 }}
                        onClick={() => void remove(m.id, false)}
                      >
                        {t("delete")}
                      </button>
                      {mine ? (
                        <button
                          type="button"
                          className="btn btn-danger"
                          style={{ width: "100%", minHeight: 36 }}
                          onClick={() => void remove(m.id, true)}
                        >
                          {t("delete")} ∞
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {(replyTo || editing) && (
          <div
            className="row"
            style={{
              padding: "8px 12px",
              background: "var(--surface-muted)",
              justifyContent: "space-between",
            }}
          >
            <span className="muted" style={{ fontSize: "0.85rem" }}>
              {editing ? t("edit") : t("reply")}:{" "}
              {(editing || replyTo)?.text || "…"}
            </span>
            <button
              type="button"
              className="icon-btn"
              onClick={() => {
                setReplyTo(null);
                setEditing(null);
                setText("");
              }}
            >
              ×
            </button>
          </div>
        )}

        <form className="composer" onSubmit={sendText}>
          <input
            ref={fileRef}
            type="file"
            className="sr-only"
            accept="image/*,video/*,audio/*,*/*"
            onChange={(e) => void onPickFile(e.target.files?.[0] || null)}
          />
          <button
            type="button"
            className="icon-btn"
            aria-label={t("attach")}
            onClick={() => fileRef.current?.click()}
            disabled={busy}
          >
            <Paperclip size={18} />
          </button>
          <textarea
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            placeholder={t("typeMessage")}
            rows={1}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void sendText();
              }
            }}
          />
          <button className="send-btn" type="submit" disabled={busy || !text.trim()}>
            {editing ? <Smile size={18} /> : <SendHorizontal size={18} />}
          </button>
        </form>
      </div>
    </AppShell>
  );
}

async function openAuthedFile(
  threadId: string,
  messageId: string,
  token: string | null,
) {
  const url = authFileUrl(threadId, messageId, false);
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error("media failed");
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  window.open(objectUrl, "_blank", "noopener,noreferrer");
}
