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
  isLLMBot?: boolean;       // true for the named LLM bot accounts (DeepSeek/Kimi/MiniMax/Qwen)
  llmBotId?: string;        // matches the id in LLM_BOT_CONFIGS
  isRuleBot?: boolean;      // true for the named rule-based bot accounts (Blaze/Shield/Sage)
  ruleBotId?: string;       // matches the id in RULE_BOT_CONFIGS
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
    name?: string;
    chips: number;
    currentBet: number;
    isFolded: boolean;
    isAllIn: boolean;
    isAI: boolean;
  }[];
  /** Current hand's action history (all players' actions so far this hand) */
  handHistory?: {
    playerId: string;
    playerName: string;
    action: ActionType;
    amount?: number;
    potSize: number;
    phase: GamePhase;
  }[];
  /** Opponent behavioral profiles based on historical data */
  opponentProfiles?: {
    name: string;
    style: string;
    handsPlayed: number;
    winRate: number;
    vpip: number;
    pfr: number;
    postflopAgg: number;
    foldToBet: number;
    avgBetSize: number;
    recentActions: string;
    exploitTips: string[];
  }[];
}

// User system types
export interface UserProfile {
  id: string;
  username: string;
  chips: number;
  isLLMBot?: boolean;       // system LLM bot account
  isRuleBot?: boolean;      // system rule-based bot account
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
export const LLM_BOT_STARTING_CHIPS = 2000;

/** Built-in LLM bot definitions */
export const LLM_BOT_CONFIGS = [
  {
    id: 'llm-bot-deepseek',
    name: 'DeepSeek',
    model: 'deepseek-v3.2',
    apiBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    personality: 'aggressive' as AIPersonality,
    emoji: '🤖',
  },
  {
    id: 'llm-bot-kimi',
    name: 'Kimi',
    model: 'kimi-k2.5',
    apiBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    personality: 'balanced' as AIPersonality,
    emoji: '🌙',
  },
  {
    id: 'llm-bot-minimax',
    name: 'MiniMax',
    model: 'MiniMax-M2.5',
    apiBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    personality: 'conservative' as AIPersonality,
    emoji: '⚡',
  },
  {
    id: 'llm-bot-qwen',
    name: 'Qwen',
    model: 'qwen3.5-plus',
    apiBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    personality: 'balanced' as AIPersonality,
    emoji: '☁️',
  },
] as const;

export type LLMBotId = (typeof LLM_BOT_CONFIGS)[number]['id'];

/** Built-in rule-based bot definitions (persistent accounts, appear on leaderboard) */
export const RULE_BOT_CONFIGS = [
  {
    id: 'rule-bot-aggressive',
    name: 'Blaze',
    personality: 'aggressive' as AIPersonality,
    emoji: '🔥',
  },
  {
    id: 'rule-bot-conservative',
    name: 'Shield',
    personality: 'conservative' as AIPersonality,
    emoji: '🛡️',
  },
  {
    id: 'rule-bot-balanced',
    name: 'Sage',
    personality: 'balanced' as AIPersonality,
    emoji: '⚖️',
  },
] as const;

export type RuleBotId = (typeof RULE_BOT_CONFIGS)[number]['id'];
export const RULE_BOT_STARTING_CHIPS = 2000;

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
  'room:llm-bots': (bots: Array<{ id: string; name: string; model: string; chips: number; busy: boolean }>) => void;
  'room:rule-bots': (bots: Array<{ id: string; name: string; personality: string; emoji: string; chips: number; busy: boolean }>) => void;
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
  'room:invite-llm-bot': (botId: string) => void;
  'room:remove-llm-bot': (botId: string) => void;
  'room:invite-rule-bot': (botId: string) => void;
  'room:remove-rule-bot': (botId: string) => void;
  'game:start': () => void;
  'game:action': (action: PlayerAction) => void;
  'game:resync': () => void;
  'chat:message': (message: string) => void;
  'room:send-reaction': (toId: string, emoji: string) => void;
}
