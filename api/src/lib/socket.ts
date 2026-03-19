// ── Socket.IO Server ──────────────────────────────────────────────────────
// Real-time channel for:
//   • Engineer presence (online / offline)
//   • Support request notifications (new, accepted, resolved)
//   • Support chat messages between customer ↔ engineer

import { Server as SocketIOServer, Socket } from "socket.io";
import { Server as HttpServer } from "http";

interface EngineerInfo {
  userId: string;
  name: string;
  socketId: string;
}

// In-memory engineer presence: socketId → engineer details
const engineerPresence = new Map<string, EngineerInfo>();

export let io: SocketIOServer;

export function getOnlineEngineerCount(): number {
  return engineerPresence.size;
}

export function isAnyEngineerOnline(): boolean {
  return engineerPresence.size > 0;
}

/** Broadcast current engineer online count to all connected clients */
export function broadcastEngineerStatus(): void {
  io?.emit("engineer:status", {
    isOnline: engineerPresence.size > 0,
    onlineCount: engineerPresence.size,
  });
}

export function initSocket(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors:       { origin: true, credentials: true },
    transports: ["polling", "websocket"],
    path:       "/socket.io",
  });

  io.on("connection", (socket: Socket) => {
    const q    = socket.handshake.query as Record<string, string>;
    const userId = q.userId;
    const role   = q.role;
    const name   = q.name || "User";

    if (!userId || !role) {
      socket.disconnect(true);
      return;
    }

    // Every user joins their personal room for direct events
    socket.join(`user:${userId}`);

    // Service engineers join "service_engineers" room (ticket:assigned events)
    if (role === "service_engineer" || role === "service") {
      socket.join("service_engineers");
    }

    // Service managers join "managers" room (ticket:new events)
    if (role === "service_manager") {
      socket.join("managers");
    }

    // Admins join both rooms
    if (role === "admin") {
      socket.join("managers");
      socket.join("service_engineers");
    }

    // Service / admin / customer_service join the shared "engineers" room (legacy support chat)
    if (role === "service" || role === "admin" || role === "customer_service") {
      engineerPresence.set(socket.id, { userId, name, socketId: socket.id });
      socket.join("engineers");
      broadcastEngineerStatus();
      console.log(`[socket] engineer online: ${name} (${userId}), total online: ${engineerPresence.size}`);
    }

    // ── Support request room management ────────────────────────────
    socket.on("support:join", (requestId: string) => {
      socket.join(`sr:${requestId}`);
    });

    socket.on("support:leave", (requestId: string) => {
      socket.leave(`sr:${requestId}`);
    });

    // ── Disconnect ─────────────────────────────────────────────────
    socket.on("disconnect", () => {
      if (engineerPresence.has(socket.id)) {
        const info = engineerPresence.get(socket.id);
        engineerPresence.delete(socket.id);
        broadcastEngineerStatus();
        console.log(`[socket] engineer offline: ${info?.name}, total online: ${engineerPresence.size}`);
      }
    });
  });

  return io;
}
