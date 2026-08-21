"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  CheckCheck,
  Copy,
  Forward,
  Paperclip,
  Search,
  SendHorizontal,
  Smile,
  UserRound,
  Video,
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
import { AuthedMedia } from "@/components/AuthedMedia";
import { VideoNoteCapture } from "@/components/VideoNoteCapture";
import { VoiceRecorder } from "@/components/VoiceRecorder";
import { avatarUrl } from "@/lib/api";
import { clearSession, getSession, getToken, isGuestSession } from "@/lib/auth";
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
  const guest = isGuestSession();

  const [thread, setThread] = useState<ChatThreadDto | null>(null);
  const [messages, setMessages] = useState<ChatMessageDto[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<ChatMessageDto | null>(null);
  const [editing, setEditing] = useState<ChatMessageDto | null>(null);
  const [forwarding, setForwarding] = useState<ChatMessageDto | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [peerTyping, setPeerTyping] = useState(false);
  const [busy, setBusy] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [searchHits, setSearchHits] = useState<ChatMessageDto[]>([]);
  const [peerOpen, setPeerOpen] = useState(false);
  const [mediaTab, setMediaTab] = useState("media");
  const [mediaItems, setMediaItems] = useState<ChatMessageDto[]>([]);
  const [attachOpen, setAttachOpen] = useState(false);
  const [videoNoteOpen, setVideoNoteOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [lightbox, setLightbox] = useState<ChatMessageDto | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const typingTimer = useRef<number | null>(null);

  const title = useMemo(
    () => (thread ? counterpartName(thread, session?.userId) : t("chats")),
    [thread, session?.userId, t],
  );

  const lastSeenLabel = useMemo(() => {
    if (!thread) return "";
    if (peerTyping) return t("typing");
    if (thread.online) return t("online");
    if (thread.lastSeenAt) return `${t("lastSeen")} ${formatTime(thread.lastSeenAt)}`;
    return t("offline");
  }, [thread, peerTyping, t]);

  const mergeMessage = useCallback((msg: ChatMessageDto) => {
    setMessages((prev) => {
      const byClient =
        msg.clientId != null
          ? prev.findIndex((m) => m.clientId === msg.clientId)
          : -1;
      if (byClient >= 0) {
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
        toast.push(t("chatLoadFailed"), "err");
        if (isGuestSession()) {
          clearSession();
          router.replace("/login");
        } else {
          router.replace("/chats");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [threadId, router, toast, t]);

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

    const onDeleted = (payload: {
      threadId?: string;
      messageId?: string;
      message?: ChatMessageDto;
    }) => {
      if (payload.threadId && payload.threadId !== threadId) return;
      if (payload.message) {
        mergeMessage(payload.message);
        return;
      }
      if (payload.messageId) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === payload.messageId
              ? { ...m, deletedForEveryone: true, text: null }
              : m,
          ),
        );
      }
    };

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

    const onRead = (p: { threadId?: string; userId?: string }) => {
      if (p.threadId !== threadId) return;
      if (p.userId === session?.userId) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.mine && !m.readAt
            ? { ...m, readAt: new Date().toISOString() }
            : m,
        ),
      );
    };

    socket.on("chat.message", onMessage);
    socket.on("chat.message.updated", onMessage);
    socket.on("chat.message.deleted", onDeleted);
    socket.on("chat.typing", onTyping);
    socket.on("chat.presence", onPresence);
    socket.on("chat.read", onRead);

    return () => {
      socket.off("chat.message", onMessage);
      socket.off("chat.message.updated", onMessage);
      socket.off("chat.message.deleted", onDeleted);
      socket.off("chat.typing", onTyping);
      socket.off("chat.presence", onPresence);
      socket.off("chat.read", onRead);
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
    if ((!value && !forwarding) || busy) return;
    setBusy(true);
    try {
      if (editing) {
        mergeMessage(await deviceApi.editMessage(threadId, editing.id, value));
        setEditing(null);
      } else if (forwarding) {
        const cid = clientId();
        mergeMessage(
          await deviceApi.sendMessage(threadId, {
            text: value || forwarding.text || "",
            clientId: cid,
            forwardedFromId: forwarding.id,
          }),
        );
        setForwarding(null);
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
        mergeMessage(
          await deviceApi.sendMessage(threadId, {
            text: value,
            clientId: cid,
            replyToId: replyTo?.id,
          }),
        );
        setReplyTo(null);
      }
      setText("");
      emitTyping(threadId, false);
    } catch {
      toast.push(t("sendFailed"), "err");
    } finally {
      setBusy(false);
      setMenuFor(null);
    }
  }

  async function uploadFile(
    file: File,
    messageType?: string,
    extra?: { durationMs?: number; width?: number; height?: number; waveformJson?: string },
  ) {
    setBusy(true);
    const cid = clientId();
    try {
      const type =
        messageType ||
        (file.type.startsWith("image/")
          ? "IMAGE"
          : file.type.startsWith("video/")
            ? "VIDEO"
            : file.type.startsWith("audio/")
              ? "VOICE"
              : "FILE");
      const msg = await uploadChatFile(threadId, file, {
        messageType: type,
        clientId: cid,
        replyToId: replyTo?.id,
        durationMs: extra?.durationMs,
        width: extra?.width,
        height: extra?.height,
        waveformJson: extra?.waveformJson,
      });
      mergeMessage(msg);
      setReplyTo(null);
    } catch {
      toast.push(t("uploadFailed"), "err");
    } finally {
      setBusy(false);
      setAttachOpen(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function runSearch() {
    if (!searchQ.trim()) {
      setSearchHits([]);
      return;
    }
    try {
      const page = await deviceApi.searchMessages(threadId, searchQ.trim());
      setSearchHits(page.items || []);
    } catch {
      toast.push(t("searchFailed"), "err");
    }
  }

  async function openPeer() {
    setPeerOpen(true);
    try {
      const page = await deviceApi.media(threadId, mediaTab);
      setMediaItems(page.items || []);
    } catch {
      setMediaItems([]);
    }
  }

  useEffect(() => {
    if (!peerOpen) return;
    void deviceApi
      .media(threadId, mediaTab)
      .then((p) => setMediaItems(p.items || []))
      .catch(() => setMediaItems([]));
  }, [peerOpen, mediaTab, threadId]);

  let lastDay = "";
  const peerId =
    thread?.counterpartUserId || thread?.peer?.id || thread?.owner?.id;
  const hasAvatar =
    thread?.counterpartHasAvatar ||
    thread?.peer?.hasAvatar ||
    thread?.owner?.hasAvatar;

  return (
    <AppShell hideChrome>
      <div
        className={`thread-layout ${dragOver ? "drag-over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file) void uploadFile(file);
        }}
      >
        <header className="topbar">
          <div className="row" style={{ minWidth: 0, flex: 1 }}>
            {guest ? (
              <button
                type="button"
                className="icon-btn"
                aria-label={t("back")}
                onClick={() => {
                  clearSession();
                  router.replace("/login");
                }}
              >
                <ArrowLeft size={18} />
              </button>
            ) : (
              <Link href="/chats" className="icon-btn" aria-label={t("back")}>
                <ArrowLeft size={18} />
              </Link>
            )}
            <button
              type="button"
              className="row"
              style={{
                border: 0,
                background: "transparent",
                padding: 0,
                minWidth: 0,
                textAlign: "left",
              }}
              onClick={() => void openPeer()}
            >
              <div className="avatar" style={{ width: 36, height: 36, fontSize: 14 }}>
                {hasAvatar && peerId ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatarUrl(
                      peerId,
                      thread?.counterpartAvatarUpdatedAt ||
                        thread?.peer?.avatarUpdatedAt,
                    )}
                    alt=""
                  />
                ) : (
                  title.slice(0, 1).toUpperCase()
                )}
                {thread?.online ? <span className="online-dot" /> : null}
              </div>
              <div style={{ minWidth: 0 }}>
                <h1
                  style={{
                    fontSize: "1rem",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {title}
                </h1>
                <div className="muted" style={{ fontSize: "0.75rem" }}>
                  {lastSeenLabel}
                </div>
              </div>
            </button>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setSearchOpen((v) => !v)}
            aria-label={t("search")}
          >
            <Search size={18} />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => void openPeer()}
            aria-label={t("profile")}
          >
            <UserRound size={18} />
          </button>
        </header>

        {searchOpen ? (
          <div className="row" style={{ padding: "8px 12px", gap: 8, background: "var(--surface)" }}>
            <input
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder={t("search")}
              style={{ flex: 1, minHeight: 40, borderRadius: 10, border: "1px solid var(--border-strong)", padding: "0 12px" }}
              onKeyDown={(e) => e.key === "Enter" && void runSearch()}
            />
            <button type="button" className="btn btn-secondary" style={{ minHeight: 40 }} onClick={() => void runSearch()}>
              {t("search")}
            </button>
          </div>
        ) : null}

        {searchHits.length > 0 ? (
          <div className="card" style={{ margin: 8, maxHeight: 160, overflow: "auto", padding: 8 }}>
            {searchHits.map((h) => (
              <button
                key={h.id}
                type="button"
                className="chat-row"
                style={{ width: "100%", border: 0, background: "transparent", textAlign: "left" }}
                onClick={() => {
                  setSearchOpen(false);
                  document.getElementById(`msg-${h.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
                }}
              >
                <span className="muted" style={{ fontSize: "0.8rem" }}>{formatTime(h.createdAt)}</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {h.text || h.fileName || h.messageType}
                </span>
              </button>
            ))}
          </div>
        ) : null}

        <div
          className="messages"
          ref={listRef}
          onScroll={(e) => {
            if (e.currentTarget.scrollTop < 40) void loadOlder();
          }}
        >
          {loadingMore ? (
            <div className="muted" style={{ textAlign: "center" }}>{t("loading")}</div>
          ) : null}

          {messages.map((m) => {
            const day = formatDay(m.createdAt);
            const showDay = day && day !== lastDay;
            if (day) lastDay = day;
            const mine = Boolean(m.mine);
            const deleted = Boolean(m.deletedForEveryone || m.deletedAt);
            const type = (m.messageType || "TEXT").toUpperCase();

            return (
              <div key={m.id} id={`msg-${m.id}`} style={{ display: "contents" }}>
                {showDay ? <div className="bubble system">{day}</div> : null}
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
                  {m.forwarded ? (
                    <div className="muted" style={{ fontSize: "0.75rem", marginBottom: 4 }}>
                      {t("forwarded")}
                    </div>
                  ) : null}
                  {m.replyTo ? (
                    <div className="reply-quote">
                      {m.replyTo.text || m.replyTo.fileName || "Reply"}
                    </div>
                  ) : null}

                  {deleted ? (
                    <em style={{ opacity: 0.8 }}>{t("deleted")}</em>
                  ) : type === "IMAGE" ? (
                    <button type="button" style={{ border: 0, padding: 0, background: "transparent" }} onClick={(e) => { e.stopPropagation(); setLightbox(m); }}>
                      <AuthedMedia threadId={threadId} messageId={m.id} kind="image" style={{ borderRadius: 10, maxHeight: 280, display: "block" }} />
                    </button>
                  ) : type === "VIDEO_NOTE" ? (
                    <AuthedMedia threadId={threadId} messageId={m.id} kind="video_note" round />
                  ) : type === "VIDEO" ? (
                    <AuthedMedia threadId={threadId} messageId={m.id} kind="video" />
                  ) : type === "VOICE" ? (
                    <AuthedMedia threadId={threadId} messageId={m.id} kind="audio" />
                  ) : type === "FILE" ? (
                    <a
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void openAuthedFile(threadId, m.id, token, m.fileName || "file");
                      }}
                    >
                      {m.fileName || "File"}
                    </a>
                  ) : (
                    <div>{m.text}</div>
                  )}

                  {(m.reactions || []).length > 0 ? (
                    <div className="row" style={{ marginTop: 6, flexWrap: "wrap", gap: 4 }}>
                      {m.reactions!.map((r) => (
                        <span key={r.emoji} className="reaction-chip">
                          {r.emoji} {r.count || 1}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <div className="bubble-meta">
                    {m.editedAt ? <span>{t("edited")}</span> : null}
                    <span>{formatTime(m.createdAt)}</span>
                    {mine ? (
                      m.readAt ? <CheckCheck size={14} /> : <Check size={14} />
                    ) : null}
                  </div>

                  {menuFor === m.id ? (
                    <div className="msg-menu card" onClick={(e) => e.stopPropagation()}>
                      <div className="row" style={{ marginBottom: 8, flexWrap: "wrap" }}>
                        {REACTIONS.map((emoji) => (
                          <button key={emoji} type="button" className="icon-btn" onClick={() => void deviceApi.react(threadId, m.id, emoji).then(mergeMessage).finally(() => setMenuFor(null))}>
                            {emoji}
                          </button>
                        ))}
                      </div>
                      <button type="button" className="btn btn-ghost menu-btn" onClick={() => { setReplyTo(m); setMenuFor(null); }}>{t("reply")}</button>
                      <button type="button" className="btn btn-ghost menu-btn" onClick={() => { void navigator.clipboard.writeText(m.text || m.fileName || ""); toast.push(t("copied"), "ok"); setMenuFor(null); }}>
                        <Copy size={14} /> {t("copy")}
                      </button>
                      <button type="button" className="btn btn-ghost menu-btn" onClick={() => { setForwarding(m); setMenuFor(null); }}>
                        <Forward size={14} /> {t("forward")}
                      </button>
                      {mine && type === "TEXT" ? (
                        <button type="button" className="btn btn-ghost menu-btn" onClick={() => { setEditing(m); setText(m.text || ""); setMenuFor(null); }}>{t("edit")}</button>
                      ) : null}
                      <button type="button" className="btn btn-danger menu-btn" onClick={() => void deviceApi.deleteMessage(threadId, m.id, false).then(mergeMessage).finally(() => setMenuFor(null))}>{t("delete")}</button>
                      {mine ? (
                        <button type="button" className="btn btn-danger menu-btn" onClick={() => void deviceApi.deleteMessage(threadId, m.id, true).then(mergeMessage).finally(() => setMenuFor(null))}>{t("deleteEveryone")}</button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {(replyTo || editing || forwarding) && (
          <div className="composer-banner">
            <span className="muted" style={{ fontSize: "0.85rem" }}>
              {editing ? t("edit") : forwarding ? t("forward") : t("reply")}:{" "}
              {(editing || replyTo || forwarding)?.text || "…"}
            </span>
            <button type="button" className="icon-btn" onClick={() => { setReplyTo(null); setEditing(null); setForwarding(null); setText(""); }}>×</button>
          </div>
        )}

        <form className="composer" onSubmit={sendText}>
          <input
            ref={fileRef}
            type="file"
            className="sr-only"
            accept="image/*,video/*,audio/*,*/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadFile(f);
            }}
          />
          <button type="button" className="icon-btn" aria-label={t("attach")} onClick={() => setAttachOpen((v) => !v)} disabled={busy}>
            <Paperclip size={18} />
          </button>
          <VoiceRecorder
            disabled={busy}
            onRecorded={(file, meta) => void uploadFile(file, "VOICE", meta)}
            onError={(msg) => toast.push(msg, "err")}
          />
          <button type="button" className="icon-btn" onClick={() => setVideoNoteOpen(true)} disabled={busy} aria-label="Video note">
            <Video size={18} />
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
          <button className="send-btn" type="submit" disabled={busy || (!text.trim() && !forwarding)}>
            {editing ? <Smile size={18} /> : <SendHorizontal size={18} />}
          </button>
        </form>

        {attachOpen ? (
          <div className="attach-sheet">
            <button type="button" className="btn btn-secondary" onClick={() => { fileRef.current?.click(); }}>{t("attach")}</button>
            <button type="button" className="btn btn-secondary" onClick={() => { setAttachOpen(false); setVideoNoteOpen(true); }}>{t("videoNote")}</button>
          </div>
        ) : null}
      </div>

      <VideoNoteCapture
        open={videoNoteOpen}
        onClose={() => setVideoNoteOpen(false)}
        onCaptured={(file, meta) => void uploadFile(file, "VIDEO_NOTE", meta)}
        onError={(msg) => toast.push(msg, "err")}
      />

      {peerOpen ? (
        <div className="modal-scrim" onClick={() => setPeerOpen(false)}>
          <div className="modal stack" style={{ maxHeight: "85dvh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div className="row" style={{ gap: 12 }}>
              <div className="avatar" style={{ width: 64, height: 64, fontSize: 22 }}>
                {hasAvatar && peerId ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl(peerId, thread?.counterpartAvatarUpdatedAt)} alt="" />
                ) : (
                  title.slice(0, 1).toUpperCase()
                )}
              </div>
              <div>
                <strong style={{ fontSize: "1.1rem" }}>{title}</strong>
                <div className="muted">{thread?.counterpartPhone || thread?.peer?.phone || "—"}</div>
                <div className="muted" style={{ fontSize: "0.8rem" }}>{lastSeenLabel}</div>
              </div>
            </div>
            <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
              {["media", "files", "voice", "links"].map((k) => (
                <button key={k} type="button" className={`btn ${mediaTab === k ? "btn-primary" : "btn-secondary"}`} style={{ minHeight: 36 }} onClick={() => setMediaTab(k)}>
                  {k}
                </button>
              ))}
            </div>
            <div className="media-grid">
              {mediaItems.map((item) => (
                <button key={item.id} type="button" className="media-cell" onClick={() => setLightbox(item)}>
                  {(item.messageType || "").toUpperCase() === "IMAGE" ? (
                    <AuthedMedia threadId={threadId} messageId={item.id} kind="image" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <span className="muted" style={{ fontSize: "0.75rem" }}>{item.messageType || item.fileName}</span>
                  )}
                </button>
              ))}
              {mediaItems.length === 0 ? <p className="muted">{t("emptyMedia")}</p> : null}
            </div>
          </div>
        </div>
      ) : null}

      {lightbox ? (
        <div className="modal-scrim lightbox" onClick={() => setLightbox(null)}>
          <div onClick={(e) => e.stopPropagation()}>
            {(lightbox.messageType || "").toUpperCase() === "IMAGE" ? (
              <AuthedMedia threadId={threadId} messageId={lightbox.id} kind="image" style={{ maxWidth: "92vw", maxHeight: "85dvh", borderRadius: 12 }} />
            ) : (
              <AuthedMedia threadId={threadId} messageId={lightbox.id} kind="video" style={{ maxWidth: "92vw", maxHeight: "85dvh" }} />
            )}
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}

async function openAuthedFile(
  threadId: string,
  messageId: string,
  token: string | null,
  fileName: string,
) {
  const res = await fetch(authFileUrl(threadId, messageId, false), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error("download failed");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
