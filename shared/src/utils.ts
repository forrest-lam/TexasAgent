import { Card, Suit, Rank } from './types';
import { SUIT_SYMBOLS, RANK_VALUES } from './constants';

export function formatCard(card: Card): string {
  return `${card.rank}${SUIT_SYMBOLS[card.suit]}`;
}

export function formatCards(cards: Card[]): string {
  return cards.map(formatCard).join(' ');
}

export function formatChips(amount: number): string {
  if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 1000) return `${(amount / 1000).toFixed(1)}K`;
  return amount.toString();
}

export function cardToString(card: Card): string {
  const suitChar: Record<Suit, string> = {
    hearts: 'h', diamonds: 'd', clubs: 'c', spades: 's'
  };
  return `${card.rank}${suitChar[card.suit]}`;
}

export function stringToCard(str: string): Card | null {
  const suitMap: Record<string, Suit> = {
    h: 'hearts', d: 'diamonds', c: 'clubs', s: 'spades'
  };
  const suit = suitMap[str[str.length - 1]];
  const rank = str.slice(0, -1) as Rank;
  if (!suit || !RANK_VALUES[rank]) return null;
  return { suit, rank };
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function calculatePotOdds(callAmount: number, potSize: number): number {
  if (callAmount === 0) return 0;
  return callAmount / (potSize + callAmount);
}
