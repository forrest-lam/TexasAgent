import { create } from 'zustand';
import { Room, RoomConfig } from '@texas-agent/shared';
import { getSocket, connectSocket } from '../services/socket-service';

interface LobbyState {
  rooms: Room[];
  currentRoom: Room | null;
  isConnected: boolean;
  playerName: string;
  setPlayerName: (name: string) => void;
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
  playerName: `Player_${Math.random().toString(36).slice(2, 8)}`,

  setPlayerName: (name: string) => set({ playerName: name }),

  connect: () => {
    const socket = connectSocket();

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
    const { playerName } = get();
    socket.emit('room:join', roomId, playerName);
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
