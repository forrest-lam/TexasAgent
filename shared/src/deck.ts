import { Card } from './types';
import { SUITS, RANKS } from './constants';

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  return deck;
}

export function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function dealCards(deck: Card[], count: number): { dealt: Card[]; remaining: Card[] } {
  const dealt = deck.slice(0, count);
  const remaining = deck.slice(count);
  return { dealt, remaining };
}

export class Deck {
  private cards: Card[];

  constructor() {
    this.cards = shuffleDeck(createDeck());
  }

  deal(count: number = 1): Card[] {
    if (this.cards.length < count) {
      console.error('Not enough cards in deck');
      return [];
    }
    return this.cards.splice(0, count);
  }

  burn(): Card | undefined {
    return this.cards.shift();
  }

  remaining(): number {
    return this.cards.length;
  }

  reset(): void {
    this.cards = shuffleDeck(createDeck());
  }
}
