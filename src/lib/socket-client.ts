// ── Socket.IO Client Wrapper ──────────────────────────────────────────────
// Module-level singleton — only one socket connection per browser session.
// Connect via the same origin (Next.js proxies /socket.io/* → API).

import { io, Socket } from "socket.io-client";

let _socket: Socket | null = null;

export interface SocketUser {
  userId: string;
  role:   string;
  name:   string;
}

/** Get (or create) the singleton socket, authenticated as the given user */
export function getSocket(user: SocketUser): Socket {
  if (_socket && _socket.connected) return _socket;
  if (_socket) { _socket.disconnect(); _socket = null; }

  _socket = io({
    path:       "/socket.io",
    query:      { userId: user.userId, role: user.role, name: user.name },
    transports: ["polling", "websocket"],
  });

  _socket.on("connect",        () => console.log("[socket] connected:", _socket!.id));
  _socket.on("connect_error",  (e) => console.warn("[socket] connect error:", e.message));
  _socket.on("disconnect",     (r) => console.log("[socket] disconnected:", r));

  return _socket;
}

/** Disconnect and clear the singleton */
export function closeSocket(): void {
  _socket?.disconnect();
  _socket = null;
}

/** Return null if not yet connected */
export function peekSocket(): Socket | null {
  return _socket;
}
