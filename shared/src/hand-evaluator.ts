import { Card, HandRank, HandEvaluation } from './types';
import { RANK_VALUES, HAND_RANK_NAMES } from './constants';

function getRankValue(rank: string): number {
  return RANK_VALUES[rank as keyof typeof RANK_VALUES] || 0;
}

function sortByRankDesc(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => getRankValue(b.rank) - getRankValue(a.rank));
}

function getCombinations(cards: Card[], size: number): Card[][] {
  if (size === 0) return [[]];
  if (cards.length < size) return [];
  const result: Card[][] = [];
  for (let i = 0; i <= cards.length - size; i++) {
    const rest = getCombinations(cards.slice(i + 1), size - 1);
    for (const combo of rest) {
      result.push([cards[i], ...combo]);
    }
  }
  return result;
}

function evaluateFiveCards(cards: Card[]): { rank: HandRank; value: number } {
  const sorted = sortByRankDesc(cards);
  const ranks = sorted.map(c => getRankValue(c.rank));
  const suits = sorted.map(c => c.suit);

  const isFlush = suits.every(s => s === suits[0]);

  let isStraight = false;
  let straightHigh = 0;

  const uniqueRanks = [...new Set(ranks)];
  if (uniqueRanks.length === 5) {
    if (ranks[0] - ranks[4] === 4) {
      isStraight = true;
      straightHigh = ranks[0];
    }
    if (ranks[0] === 14 && ranks[1] === 5 && ranks[2] === 4 && ranks[3] === 3 && ranks[4] === 2) {
      isStraight = true;
      straightHigh = 5;
    }
  }

  if (isFlush && isStraight) {
    if (straightHigh === 14) {
      return { rank: HandRank.ROYAL_FLUSH, value: makeValue(HandRank.ROYAL_FLUSH, [14]) };
    }
    return { rank: HandRank.STRAIGHT_FLUSH, value: makeValue(HandRank.STRAIGHT_FLUSH, [straightHigh]) };
  }

  const rankCounts = new Map<number, number>();
  for (const r of ranks) {
    rankCounts.set(r, (rankCounts.get(r) || 0) + 1);
  }

  const counts = Array.from(rankCounts.entries())
    .sort((a, b) => b[1] - a[1] || b[0] - a[0]);

  if (counts[0][1] === 4) {
    const quad = counts[0][0];
    const kicker = counts[1][0];
    return { rank: HandRank.FOUR_OF_A_KIND, value: makeValue(HandRank.FOUR_OF_A_KIND, [quad, kicker]) };
  }

  if (counts[0][1] === 3 && counts[1][1] === 2) {
    return { rank: HandRank.FULL_HOUSE, value: makeValue(HandRank.FULL_HOUSE, [counts[0][0], counts[1][0]]) };
  }

  if (isFlush) {
    return { rank: HandRank.FLUSH, value: makeValue(HandRank.FLUSH, ranks) };
  }

  if (isStraight) {
    return { rank: HandRank.STRAIGHT, value: makeValue(HandRank.STRAIGHT, [straightHigh]) };
  }

  if (counts[0][1] === 3) {
    const triple = counts[0][0];
    const kickers = counts.slice(1).map(c => c[0]).sort((a, b) => b - a);
    return { rank: HandRank.THREE_OF_A_KIND, value: makeValue(HandRank.THREE_OF_A_KIND, [triple, ...kickers]) };
  }

  if (counts[0][1] === 2 && counts[1][1] === 2) {
    const pairs = [counts[0][0], counts[1][0]].sort((a, b) => b - a);
    const kicker = counts[2][0];
    return { rank: HandRank.TWO_PAIR, value: makeValue(HandRank.TWO_PAIR, [...pairs, kicker]) };
  }

  if (counts[0][1] === 2) {
    const pair = counts[0][0];
    const kickers = counts.slice(1).map(c => c[0]).sort((a, b) => b - a);
    return { rank: HandRank.ONE_PAIR, value: makeValue(HandRank.ONE_PAIR, [pair, ...kickers]) };
  }

  return { rank: HandRank.HIGH_CARD, value: makeValue(HandRank.HIGH_CARD, ranks) };
}

function makeValue(rank: HandRank, kickers: number[]): number {
  let value = rank * 100000000;
  for (let i = 0; i < kickers.length && i < 5; i++) {
    value += kickers[i] * Math.pow(15, 4 - i);
  }
  return value;
}

export function evaluateHand(holeCards: Card[], communityCards: Card[]): HandEvaluation {
  const allCards = [...holeCards, ...communityCards];

  if (allCards.length < 5) {
    const sorted = sortByRankDesc(allCards);
    return {
      rank: HandRank.HIGH_CARD,
      rankName: HAND_RANK_NAMES[HandRank.HIGH_CARD],
      value: 0,
      bestCards: sorted,
    };
  }

  const combos = getCombinations(allCards, 5);
  let bestEval = { rank: HandRank.HIGH_CARD as HandRank, value: -1 };
  let bestCombo: Card[] = combos[0];

  for (const combo of combos) {
    const evalResult = evaluateFiveCards(combo);
    if (evalResult.value > bestEval.value) {
      bestEval = evalResult;
      bestCombo = combo;
    }
  }

  return {
    rank: bestEval.rank,
    rankName: HAND_RANK_NAMES[bestEval.rank],
    value: bestEval.value,
    bestCards: sortByRankDesc(bestCombo),
  };
}

export function compareHands(hand1: HandEvaluation, hand2: HandEvaluation): number {
  return hand1.value - hand2.value;
}
