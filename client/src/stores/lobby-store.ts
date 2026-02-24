import { create } from 'zustand';
import { Room, RoomConfig } from '@texas-agent/shared';
import { getSocket, connectSocket } from '../services/socket-service';
import { useAuthStore } from './auth-store';

interface LobbyState {
  rooms: Room[];
  currentRoom: Room | null;
  isConnected: boolean;
  connect: () => void;
  refreshRooms: () => void;
  createRoom: (name: string, config: RoomConfig) => void;
  joinRoom: (roomId: string) => void;
  leaveRoom: () => void;
  addAI: (personality: string, engineType: string) => void;
  startGame: () => void;
}

export const useLobbyStore = create<LobbyState>((set, get) => ({
  rooms: [],
  currentRoom: null,
  isConnected: false,

  connect: () => {
    const token = useAuthStore.getState().token;
    const socket = connectSocket(token || undefined);

    socket.on('connect', () => {
      set({ isConnected: true });
      socket.emit('room:list');
    });

    socket.on('disconnect', () => {
      set({ isConnected: false });
    });

    socket.on('room:list', (rooms) => {
      set({ rooms });
    });

    socket.on('room:joined', (room) => {
      set({ currentRoom: room });
    });

    socket.on('room:left', () => {
      set({ currentRoom: null });
    });

    socket.on('room:updated', (room) => {
      set({ currentRoom: room });
    });

    socket.on('user:updated', (user) => {
      useAuthStore.getState().updateUser(user);
    });

    socket.on('error', (msg) => {
      console.error('Server error:', msg);
    });
  },

  refreshRooms: () => {
    const socket = getSocket();
    socket.emit('room:list');
  },

  createRoom: (name: string, config: RoomConfig) => {
    const socket = getSocket();
    socket.emit('room:create', { ...config, name });
  },

  joinRoom: (roomId: string) => {
    const socket = getSocket();
    socket.emit('room:join', roomId);
  },

  leaveRoom: () => {
    const socket = getSocket();
    socket.emit('room:leave');
  },

  addAI: (personality: string, engineType: string) => {
    const socket = getSocket();
    socket.emit('room:add-ai', personality as any, engineType as any);
  },

  startGame: () => {
    const socket = getSocket();
    socket.emit('game:start');
  },
}));
