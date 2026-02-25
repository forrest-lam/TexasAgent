import { create } from 'zustand';
import { GameState, PlayerAction } from '@texas-agent/shared';
import { getSocket } from '../services/socket-service';
import { playSound } from '../services/sound-service';

/** Structured log entry: i18n key + parameters, translated at render time */
export interface LogEntry {
  key: string;
  params?: Record<string, string | number>;
}

/** A single action in the current hand's action history */
export interface HandAction {
  playerName: string;
  action: string;       // fold | check | call | raise | all-in
  amount?: number;
  phase: string;        // preflop | flop | turn | river
}

interface GameStore {
  gameState: GameState | null;
  isMyTurn: boolean;
  timeLimit: number;
  myPlayerId: string;
  gameLog: LogEntry[];
  /** Structured action history for the current hand (reset each new hand) */
  handActions: HandAction[];
  setGameState: (state: GameState) => void;
  setMyPlayerId: (id: string) => void;
  sendAction: (action: PlayerAction) => void;
  addLog: (entry: LogEntry) => void;
  addHandAction: (action: HandAction) => void;
  clearGame: () => void;
  /** Register socket listeners; returns a cleanup function to remove them */
  initGameListeners: () => (() => void);
}

export const useGameStore = create<GameStore>((set, get) => ({
  gameState: null,
  isMyTurn: false,
  timeLimit: 60000,
  myPlayerId: '',
  gameLog: [],
  handActions: [],

  setGameState: (state: GameState) => {
    const myId = get().myPlayerId;
    const shouldBeMyTurn = state.phase !== 'showdown' && state.players[state.currentPlayerIndex]?.id === myId;
    // In multiplayer mode, only allow setGameState to CLEAR isMyTurn (set to false).
    // Setting isMyTurn=true is exclusively done by the 'game:your-turn' event
    // to avoid race conditions between game:state and game:your-turn arrivals.
    if (shouldBeMyTurn) {
      // Don't set isMyTurn=true here; let game:your-turn handle it
      set({ gameState: state });
    } else {
      set({ gameState: state, isMyTurn: false });
    }
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

  addHandAction: (action: HandAction) => {
    set(s => ({ handActions: [...s.handActions, action] }));
  },

  clearGame: () => set({
    gameState: null,
    isMyTurn: false,
    gameLog: [],
    handActions: [],
  }),

  initGameListeners: () => {
    const socket = getSocket();

    const onStarted = (state: GameState) => {
      set({ handActions: [], isMyTurn: false }); // Reset action history and turn for new hand
      get().setGameState(state);
      get().addLog({ key: 'log.newHand' });
    };

    const onState = (state: GameState) => {
      get().setGameState(state);
    };

    const onAction = ({ playerId, action }: { playerId: string; action: PlayerAction }) => {
      const state = get().gameState;
      const player = state?.players.find(p => p.id === playerId);
      const name = player?.name || 'Unknown';
      get().addLog({
        key: 'log.action',
        params: { name, action: action.type, ...(action.amount ? { amount: action.amount } : {}) },
      });
      // Record structured action for LLM advisor context
      get().addHandAction({
        playerName: name,
        action: action.type,
        amount: action.amount,
        phase: state?.phase || 'unknown',
      });
      // Play sound + haptic for other players' actions (own actions are handled in Game.tsx handleAction)
      if (playerId !== get().myPlayerId) {
        const soundMap: Record<string, 'fold' | 'check' | 'call' | 'raise' | 'allIn' | 'chip'> = {
          fold: 'fold', check: 'check', call: 'call', raise: 'raise', 'all-in': 'allIn',
        };
        playSound(soundMap[action.type] || 'chip');
      }
    };

    const onEnded = (state: GameState) => {
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
    };

    const onYourTurn = ({ timeLimit }: { timeLimit: number }) => {
      set({ isMyTurn: true, timeLimit });
    };

    socket.on('game:started', onStarted);
    socket.on('game:state', onState);
    socket.on('game:action', onAction);
    socket.on('game:ended', onEnded);
    socket.on('game:your-turn', onYourTurn);

    // Return cleanup function to remove listeners
    return () => {
      socket.off('game:started', onStarted);
      socket.off('game:state', onState);
      socket.off('game:action', onAction);
      socket.off('game:ended', onEnded);
      socket.off('game:your-turn', onYourTurn);
    };
  },
}));
