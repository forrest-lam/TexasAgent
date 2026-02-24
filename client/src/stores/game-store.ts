import { create } from 'zustand';
import { GameState, PlayerAction } from '@texas-agent/shared';
import { getSocket } from '../services/socket-service';

/** Structured log entry: i18n key + parameters, translated at render time */
export interface LogEntry {
  key: string;
  params?: Record<string, string | number>;
}

interface GameStore {
  gameState: GameState | null;
  isMyTurn: boolean;
  timeLimit: number;
  myPlayerId: string;
  gameLog: LogEntry[];
  setGameState: (state: GameState) => void;
  setMyPlayerId: (id: string) => void;
  sendAction: (action: PlayerAction) => void;
  addLog: (entry: LogEntry) => void;
  clearGame: () => void;
  initGameListeners: () => void;
}

export const useGameStore = create<GameStore>((set, get) => ({
  gameState: null,
  isMyTurn: false,
  timeLimit: 30000,
  myPlayerId: '',
  gameLog: [],

  setGameState: (state: GameState) => {
    const myId = get().myPlayerId;
    const isMyTurn = state.players[state.currentPlayerIndex]?.id === myId;
    set({ gameState: state, isMyTurn });
  },

  setMyPlayerId: (id: string) => set({ myPlayerId: id }),

  sendAction: (action: PlayerAction) => {
    const socket = getSocket();
    socket.emit('game:action', action);
    set({ isMyTurn: false });
  },

  addLog: (entry: LogEntry) => {
    set(s => ({ gameLog: [...s.gameLog.slice(-49), entry] }));
  },

  clearGame: () => set({
    gameState: null,
    isMyTurn: false,
    gameLog: [],
  }),

  initGameListeners: () => {
    const socket = getSocket();

    socket.on('game:started', (state) => {
      get().setGameState(state);
      get().addLog({ key: 'log.newHand' });
    });

    socket.on('game:state', (state) => {
      get().setGameState(state);
    });

    socket.on('game:action', ({ playerId, action }) => {
      const state = get().gameState;
      const player = state?.players.find(p => p.id === playerId);
      const name = player?.name || 'Unknown';
      get().addLog({
        key: 'log.action',
        params: { name, action: action.type, ...(action.amount ? { amount: action.amount } : {}) },
      });
    });

    socket.on('game:ended', (state) => {
      get().setGameState(state);
      if (state.winners) {
        for (const w of state.winners) {
          const player = state.players.find((p: any) => p.id === w.playerId);
          get().addLog({
            key: 'log.wins',
            params: { name: player?.name || '?', amount: w.amount, hand: w.handName },
          });
        }
      }
    });

    socket.on('game:your-turn', ({ timeLimit }) => {
      set({ isMyTurn: true, timeLimit });
    });
  },
}));
