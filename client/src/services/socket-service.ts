import { io, Socket } from 'socket.io-client';
import { ServerToClientEvents, ClientToServerEvents } from '@texas-agent/shared';

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: AppSocket | null = null;

const SERVER_URL = import.meta.env.VITE_SERVER_URL || (import.meta.env.PROD ? window.location.origin : `http://${window.location.hostname}:3001`);

export function getSocket(token?: string): AppSocket {
  if (!socket) {
    socket = io(SERVER_URL, {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      auth: token ? { token } : {},
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

/** Reconnect with a new token (e.g. after guest logs in) */
export function reconnectWithToken(token: string): AppSocket {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  // Notify listeners they need to re-attach (lobby-store etc.)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('socket-reconnect'));
  }
  socket = io(SERVER_URL, {
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    auth: { token },
  });
  return socket;
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
