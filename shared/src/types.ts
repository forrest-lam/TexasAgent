export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  suit: Suit;
  rank: Rank;
}

export type GamePhase = 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
export type ActionType = 'fold' | 'check' | 'call' | 'raise' | 'all-in';
export type AIPersonality = 'conservative' | 'aggressive' | 'balanced';
export type AIEngineType = 'rule-based' | 'llm';

export interface PlayerAction {
  type: ActionType;
  amount?: number;
}

export interface Player {
  id: string;
  name: string;
  chips: number;
  cards: Card[];
  currentBet: number;
  totalBet: number;
  isActive: boolean;
  isFolded: boolean;
  isAllIn: boolean;
  isAI: boolean;
  aiPersonality?: AIPersonality;
  aiEngineType?: AIEngineType;
  seatIndex: number;
  isDealer?: boolean;
  isSmallBlind?: boolean;
  isBigBlind?: boolean;
}

export interface SidePot {
  amount: number;
  eligiblePlayerIds: string[];
}

export interface GameState {
  id: string;
  phase: GamePhase;
  players: Player[];
  communityCards: Card[];
  pot: number;
  sidePots: SidePot[];
  currentPlayerIndex: number;
  dealerIndex: number;
  smallBlind: number;
  bigBlind: number;
  minRaise: number;
  currentBet: number;
  lastAction?: { playerId: string; action: PlayerAction };
  winners?: { playerId: string; amount: number; handName: string }[];
  round: number;
  actedThisRound: string[];  // track who has acted in current betting round
}

export interface RoomConfig {
  maxPlayers: number;
  smallBlind: number;
  bigBlind: number;
  startingChips: number;
  aiCount: number;
  aiDifficulty: AIPersonality;
  aiEngine: AIEngineType;
}

export interface Spectator {
  id: string;
  name: string;
}

export interface Room {
  id: string;
  name: string;
  config: RoomConfig;
  players: Player[];
  /** Players waiting to join at the start of the next hand */
  pendingPlayers?: Player[];
  /** Current spectators watching the game */
  spectators?: Spectator[];
  gameState?: GameState;
  status: 'waiting' | 'playing';
  /** Socket ID of the room creator (room owner) */
  ownerId: string;
  createdAt: number;
}

export enum HandRank {
  HIGH_CARD = 0,
  ONE_PAIR = 1,
  TWO_PAIR = 2,
  THREE_OF_A_KIND = 3,
  STRAIGHT = 4,
  FLUSH = 5,
  FULL_HOUSE = 6,
  FOUR_OF_A_KIND = 7,
  STRAIGHT_FLUSH = 8,
  ROYAL_FLUSH = 9,
}

export interface HandEvaluation {
  rank: HandRank;
  rankName: string;
  value: number;
  bestCards: Card[];
}

export interface AIDecisionContext {
  playerId: string;
  hand: Card[];
  communityCards: Card[];
  pot: number;
  currentBet: number;
  playerBet: number;
  playerChips: number;
  minRaise: number;
  bigBlind: number;
  phase: GamePhase;
  numActivePlayers: number;
  position: 'early' | 'middle' | 'late' | 'blinds';
  personality: AIPersonality;
  players: {
    id: string;
    chips: number;
    currentBet: number;
    isFolded: boolean;
    isAllIn: boolean;
    isAI: boolean;
  }[];
}

// User system types
export interface UserProfile {
  id: string;
  username: string;
  chips: number;
  llmConfig?: {
    apiKey: string;
    apiBaseUrl: string;
    model: string;
  };
  stats: {
    gamesPlayed: number;
    gamesWon: number;
    totalEarnings: number;
  };
  createdAt: number;
}

export interface AuthResponse {
  token: string;
  user: Omit<UserProfile, 'llmConfig'> & {
    llmConfig?: { apiBaseUrl: string; model: string; hasApiKey: boolean };
  };
}

export const DEFAULT_USER_CHIPS = 2000;
export const AI_STARTING_CHIPS = 1000;

// Socket event types
export interface ServerToClientEvents {
  'room:list': (rooms: Room[]) => void;
  'room:joined': (room: Room) => void;
  'room:left': () => void;
  'room:updated': (room: Room) => void;
  'room:spectating': (room: Room) => void;
  'room:seated': () => void;
  'room:stood-up': () => void;
  'game:state': (state: GameState) => void;
  'game:started': (state: GameState) => void;
  'game:action': (data: { playerId: string; action: PlayerAction }) => void;
  'game:ended': (state: GameState) => void;
  'game:your-turn': (data: { timeLimit: number }) => void;
  'user:updated': (user: AuthResponse['user']) => void;
  'error': (message: string) => void;
  'chat:message': (data: { playerId: string; playerName: string; message: string; timestamp: number }) => void;
  'room:reaction': (data: { fromId: string; fromName: string; toId: string; toName: string; emoji: string }) => void;
}

export interface ClientToServerEvents {
  'room:list': () => void;
  'room:create': (config: RoomConfig & { name: string }) => void;
  'room:join': (roomId: string) => void;
  'room:spectate': (roomId: string) => void;
  'room:sit': () => void;
  'room:stand': () => void;
  'room:leave': () => void;
  'room:add-ai': (personality: AIPersonality, engineType: AIEngineType) => void;
  'game:start': () => void;
  'game:action': (action: PlayerAction) => void;
  'game:resync': () => void;
  'chat:message': (message: string) => void;
  'room:send-reaction': (toId: string, emoji: string) => void;
}
