import { create } from 'zustand';
import { Room, RoomConfig } from '@texas-agent/shared';

export interface LLMBotInfo {
  id: string;
  name: string;
  model: string;
  emoji: string;
  personality: string;
  busy: boolean;
}

export interface RuleBotInfo {
  id: string;
  name: string;
  emoji: string;
  personality: string;
  busy: boolean;
}

export interface OnlinePlayer {
  username: string;
  chips: number;
  status: 'lobby' | 'waiting' | 'playing';
}
import { getSocket, connectSocket } from '../services/socket-service';
import { useAuthStore } from './auth-store';

let listenersAttached = false;

// Reset listeners flag when socket is recreated (e.g. after guest login)
if (typeof window !== 'undefined') {
  window.addEventListener('socket-reconnect', () => {
    listenersAttached = false;
  });
}

export interface BotTopupItem {
  botId: string;
  botName: string;
  needed: number;
}

interface LobbyState {
  rooms: Room[];
  currentRoom: Room | null;
  isConnected: boolean;
  isSpectating: boolean;
  isSeated: boolean;
  isStandingUp: boolean;
  connect: () => void;
  refreshRooms: () => void;
  createRoom: (name: string, config: RoomConfig) => void;
  joinRoom: (roomId: string) => void;
  spectateRoom: (roomId: string) => void;
  sitDown: () => void;
  standUp: () => void;
  leaveRoom: () => void;
  addAI: (personality: string, engineType: string) => void;
  inviteLLMBot: (botId: string) => void;
  removeLLMBot: (botId: string) => void;
  inviteRuleBot: (botId: string) => void;
  removeRuleBot: (botId: string) => void;
  onGameTopupRequired: ((data: { items: BotTopupItem[]; total: number }) => void) | null;
  setGameTopupRequired: (cb: ((data: { items: BotTopupItem[]; total: number }) => void) | null) => void;
  startGame: () => void;
  startGameConfirmed: () => void;
  llmBots: LLMBotInfo[];
  ruleBots: RuleBotInfo[];
  onlinePlayers: OnlinePlayer[];
}

export const useLobbyStore = create<LobbyState>((set, get) => ({
  rooms: [],
  currentRoom: null,
  isConnected: false,
  isSpectating: false,
  isSeated: false,
  isStandingUp: false,
  llmBots: [],
  ruleBots: [],
  onlinePlayers: [],
  onGameTopupRequired: null,

  connect: () => {
    const token = useAuthStore.getState().token;
    const socket = connectSocket(token || undefined);

    // Prevent double-attaching listeners
    if (listenersAttached) return;
    listenersAttached = true;

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
      set({ currentRoom: null, isSpectating: false, isSeated: false, isStandingUp: false });
    });

    socket.on('room:updated', (room) => {
      const state = get();

      // Ignore updates if we've already left (race condition: server may broadcast
      // room:updated before processing our socket.leave)
      if (!state.currentRoom) return;

      const myId = socket.id;
      const inPlayers = room.players.some(p => p.id === myId);

      // If player was standing up and is no longer in the players list, transition to spectator
      if (state.isStandingUp && !inPlayers) {
        set({ currentRoom: room, isSpectating: true, isSeated: false, isStandingUp: false });
        return;
      }

      // If player was spectating/seated and now appears in the players list, game has resumed
      if (state.isSpectating && inPlayers) {
        set({ currentRoom: room, isSpectating: false, isSeated: false, isStandingUp: false });
        return;
      }

      set({ currentRoom: room });
    });

    socket.on('room:spectating', (room) => {
      set({ currentRoom: room, isSpectating: true, isSeated: false });
    });

    socket.on('room:seated', () => {
      set({ isSeated: true });
    });

    socket.on('room:stood-up', () => {
      set({ isStandingUp: true });
    });

    socket.on('user:updated', (user) => {
      useAuthStore.getState().updateUser(user);
    });

    socket.on('error', (msg) => {
      console.error('Server error:', msg);
    });

    socket.on('room:llm-bots', (bots: LLMBotInfo[]) => {
      set({ llmBots: bots });
    });

    socket.on('room:rule-bots', (bots: RuleBotInfo[]) => {
      set({ ruleBots: bots });
    });

    socket.on('lobby:online-players', (players) => {
      set({ onlinePlayers: players as OnlinePlayer[] });
    });

    socket.on('game:topup-required', (data: { items: BotTopupItem[]; total: number }) => {
      const cb = get().onGameTopupRequired;
      if (cb) cb(data);
    });

    // Request initial LLM bot list
    socket.emit('room:list');
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

  spectateRoom: (roomId: string) => {
    const socket = getSocket();
    socket.emit('room:spectate', roomId);
  },

  sitDown: () => {
    const socket = getSocket();
    socket.emit('room:sit');
  },

  standUp: () => {
    const socket = getSocket();
    socket.emit('room:stand');
  },

  leaveRoom: () => {
    const socket = getSocket();
    socket.emit('room:leave');
    set({ currentRoom: null, isSpectating: false, isSeated: false, isStandingUp: false });
  },

  addAI: (personality: string, engineType: string) => {
    const socket = getSocket();
    socket.emit('room:add-ai', personality as any, engineType as any);
  },

  inviteLLMBot: (botId: string) => {
    const socket = getSocket();
    socket.emit('room:invite-llm-bot', botId);
  },

  removeLLMBot: (botId: string) => {
    const socket = getSocket();
    socket.emit('room:remove-llm-bot', botId);
  },

  inviteRuleBot: (botId: string) => {
    const socket = getSocket();
    socket.emit('room:invite-rule-bot', botId);
  },

  removeRuleBot: (botId: string) => {
    const socket = getSocket();
    socket.emit('room:remove-rule-bot', botId);
  },

  setGameTopupRequired: (cb) => {
    set({ onGameTopupRequired: cb });
  },

  startGame: () => {
    const socket = getSocket();
    socket.emit('game:start');
  },

  startGameConfirmed: () => {
    const socket = getSocket();
    socket.emit('game:start-confirmed');
  },
}));
