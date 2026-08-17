import { io, type Socket } from "socket.io-client";
import { getToken } from "./auth";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "http://localhost:3001/realtime";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (socket?.connected) {
    return socket;
  }

  const token = getToken();

  if (socket) {
    socket.auth = { token };
    socket.connect();
    return socket;
  }

  socket = io(WS_URL, {
    autoConnect: true,
    transports: ["websocket", "polling"],
    auth: { token },
  });

  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
