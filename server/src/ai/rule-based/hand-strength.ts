import { Card, GamePhase } from '@texas-agent/shared';
import { evaluateHand } from '@texas-agent/shared';
import { Deck } from '@texas-agent/shared';

export function estimateHandStrength(
  holeCards: Card[],
  communityCards: Card[],
  numOpponents: number,
  simulations: number = 500
): number {
  if (communityCards.length === 0) {
    return estimatePreflopStrength(holeCards);
  }

  let wins = 0;
  let ties = 0;
  const usedCards = new Set([...holeCards, ...communityCards].map(c => `${c.rank}-${c.suit}`));

  for (let i = 0; i < simulations; i++) {
    const deck = new Deck();
    const availableCards: Card[] = [];
    while (deck.remaining() > 0) {
      const card = deck.deal(1)[0];
      if (!usedCards.has(`${card.rank}-${card.suit}`)) {
        availableCards.push(card);
      }
    }

    shuffleArray(availableCards);

    const remainingCommunity = availableCards.splice(0, 5 - communityCards.length);
    const fullCommunity = [...communityCards, ...remainingCommunity];

    const myEval = evaluateHand(holeCards, fullCommunity);

    let isBest = true;
    let isTied = false;

    for (let o = 0; o < numOpponents; o++) {
      if (availableCards.length < 2) break;
      const oppCards = availableCards.splice(0, 2);
      const oppEval = evaluateHand(oppCards, fullCommunity);

      if (oppEval.value > myEval.value) {
        isBest = false;
        break;
      } else if (oppEval.value === myEval.value) {
        isTied = true;
      }
    }

    if (isBest && !isTied) wins++;
    else if (isBest && isTied) ties++;
  }

  return (wins + ties * 0.5) / simulations;
}

function shuffleArray<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function estimatePreflopStrength(holeCards: Card[]): number {
  const rankValues: Record<string, number> = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
    '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
  };

  const [c1, c2] = holeCards;
  const r1 = rankValues[c1.rank];
  const r2 = rankValues[c2.rank];
  const high = Math.max(r1, r2);
  const low = Math.min(r1, r2);
  const suited = c1.suit === c2.suit;
  const pair = r1 === r2;

  let strength = 0;

  if (pair) {
    strength = 0.5 + (high / 14) * 0.5;
    if (high >= 10) strength = Math.min(strength + 0.15, 1);
  } else {
    strength = (high + low) / 28;
    if (suited) strength += 0.05;
    if (high - low <= 4) strength += 0.03;
    if (high - low === 1) strength += 0.02;
    if (high >= 13 && low >= 10) strength += 0.1;
  }

  return Math.min(Math.max(strength, 0), 1);
}

export function countOuts(holeCards: Card[], communityCards: Card[]): number {
  if (communityCards.length < 3) return 0;

  const currentEval = evaluateHand(holeCards, communityCards);
  const usedCards = new Set([...holeCards, ...communityCards].map(c => `${c.rank}-${c.suit}`));

  let outs = 0;
  const deck = new Deck();

  while (deck.remaining() > 0) {
    const card = deck.deal(1)[0];
    if (usedCards.has(`${card.rank}-${card.suit}`)) continue;

    const newCommunity = [...communityCards, card];
    const newEval = evaluateHand(holeCards, newCommunity);
    if (newEval.rank > currentEval.rank) {
      outs++;
    }
  }

  return outs;
}
