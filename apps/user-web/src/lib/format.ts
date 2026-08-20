export function formatTime(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function formatDay(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString();
}

export function formatShortDate(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function isUserThread(kind?: string | null): boolean {
  const k = (kind || "").toUpperCase();
  return k !== "SUPPORT" && k !== "ADMIN";
}

export function counterpartName(
  thread: {
    counterpartName?: string | null;
    peer?: { id?: string | null; name?: string | null } | null;
    owner?: { id?: string | null; name?: string | null } | null;
  },
  myUserId?: string | null,
): string {
  if (thread.counterpartName) return thread.counterpartName;
  if (thread.peer?.name && thread.peer.id !== myUserId) return thread.peer.name;
  if (thread.owner?.name && thread.owner.id !== myUserId) return thread.owner.name;
  return thread.peer?.name || thread.owner?.name || "Chat";
}

export function clientId(): string {
  return `web_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
