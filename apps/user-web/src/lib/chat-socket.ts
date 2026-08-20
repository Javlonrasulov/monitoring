"use client";

import { io, type Socket } from "socket.io-client";
import { getToken } from "./auth";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";

function chatOrigin(): string {
  if (process.env.NEXT_PUBLIC_CHAT_WS_URL) {
    return process.env.NEXT_PUBLIC_CHAT_WS_URL.replace(/\/chat\/?$/, "");
  }
  return API_URL.replace(/\/api\/v1\/?$/, "");
}

let socket: Socket | null = null;

export function getChatSocket(): Socket {
  if (socket?.connected) return socket;
  const token = getToken();
  if (!token) throw new Error("Not authenticated");

  if (socket) {
    socket.auth = { token };
    socket.connect();
    return socket;
  }

  socket = io(`${chatOrigin()}/chat`, {
    auth: { token },
    transports: ["websocket", "polling"],
    autoConnect: true,
    reconnection: true,
  });
  return socket;
}

export function disconnectChatSocket(): void {
  socket?.disconnect();
  socket = null;
}

export function emitTyping(threadId: string, typing: boolean): void {
  try {
    getChatSocket().emit("chat.typing", { threadId, typing });
  } catch {
    /* ignore */
  }
}
