import { Suit, Rank, HandRank, RoomConfig } from './types';

export const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
export const RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

export const RANK_VALUES: Record<Rank, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
  '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
};

export const HAND_RANK_NAMES: Record<HandRank, string> = {
  [HandRank.HIGH_CARD]: 'High Card',
  [HandRank.ONE_PAIR]: 'One Pair',
  [HandRank.TWO_PAIR]: 'Two Pair',
  [HandRank.THREE_OF_A_KIND]: 'Three of a Kind',
  [HandRank.STRAIGHT]: 'Straight',
  [HandRank.FLUSH]: 'Flush',
  [HandRank.FULL_HOUSE]: 'Full House',
  [HandRank.FOUR_OF_A_KIND]: 'Four of a Kind',
  [HandRank.STRAIGHT_FLUSH]: 'Straight Flush',
  [HandRank.ROYAL_FLUSH]: 'Royal Flush',
};

export const SUIT_SYMBOLS: Record<Suit, string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠',
};

export const SUIT_COLORS: Record<Suit, string> = {
  hearts: '#EF4444',
  diamonds: '#EF4444',
  clubs: '#1A1F2E',
  spades: '#1A1F2E',
};

export const DEFAULT_ROOM_CONFIG: RoomConfig = {
  maxPlayers: 6,
  smallBlind: 5,
  bigBlind: 10,
  startingChips: 1000,
  aiCount: 3,
  aiDifficulty: 'balanced',
  aiEngine: 'rule-based',
};

/** Minimum chip denomination across all modes */
export const MIN_CHIP_UNIT = 5;

export const BLIND_LEVELS = [
  { small: 5, big: 10, label: 'Micro' },
  { small: 10, big: 20, label: 'Low' },
  { small: 25, big: 50, label: 'Medium' },
  { small: 50, big: 100, label: 'High' },
  { small: 100, big: 200, label: 'Very High' },
];

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 9;
export const ACTION_TIMEOUT = 60000;
export const AI_THINK_DELAY_MIN = 1000;
export const AI_THINK_DELAY_MAX = 3000;
