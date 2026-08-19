import { io, type Socket } from "socket.io-client";
import { getToken } from "./auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";

function chatOrigin() {
  return API_URL.replace(/\/api\/v1\/?$/, "");
}

let socket: Socket | null = null;

/** Isolated from /realtime live-stream socket. */
export function getChatSocket(): Socket {
  const token = getToken();
  if (socket?.connected) return socket;
  if (socket) {
    socket.auth = { token };
    socket.connect();
    return socket;
  }
  socket = io(`${chatOrigin()}/chat`, {
    autoConnect: true,
    transports: ["websocket", "polling"],
    auth: { token },
  });
  return socket;
}

export function disconnectChatSocket(): void {
  socket?.disconnect();
  socket = null;
}
