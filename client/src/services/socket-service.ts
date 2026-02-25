import { io, Socket } from 'socket.io-client';
import { ServerToClientEvents, ClientToServerEvents } from '@texas-agent/shared';

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: AppSocket | null = null;

const SERVER_URL = import.meta.env.VITE_SERVER_URL || (import.meta.env.PROD ? window.location.origin : 'http://localhost:3001');

export function getSocket(token?: string): AppSocket {
  if (!socket) {
    socket = io(SERVER_URL, {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      auth: token ? { token } : undefined,
    });
  }
  return socket;
}

export function connectSocket(token?: string): AppSocket {
  // If token changed or no socket yet, recreate
  if (socket && token) {
    (socket as any).auth = { token };
  }
  const s = getSocket(token);
  if (!s.connected) {
    s.connect();
  }
  return s;
}

export function disconnectSocket(): void {
  if (socket?.connected) {
    socket.disconnect();
  }
  socket = null;
}

export function isConnected(): boolean {
  return socket?.connected ?? false;
}
