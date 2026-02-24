import { GameState, Player, PlayerAction, GamePhase, SidePot } from './types';
import { evaluateHand, compareHands } from './hand-evaluator';

export function getActivePlayers(state: GameState): Player[] {
  return state.players.filter(p => p.isActive && !p.isFolded);
}

export function getPlayersInHand(state: GameState): Player[] {
  return state.players.filter(p => !p.isFolded && p.isActive);
}

export function getNextActivePlayerIndex(state: GameState, fromIndex: number): number {
  const n = state.players.length;
  let idx = (fromIndex + 1) % n;
  let checked = 0;
  while (checked < n) {
    const player = state.players[idx];
    if (player.isActive && !player.isFolded && !player.isAllIn) {
      return idx;
    }
    idx = (idx + 1) % n;
    checked++;
  }
  return -1;
}

export function getSmallBlindIndex(state: GameState): number {
  if (state.players.filter(p => p.isActive).length === 2) {
    return state.dealerIndex;
  }
  return getNextActivePlayerIndex(state, state.dealerIndex);
}

export function getBigBlindIndex(state: GameState): number {
  const sbIndex = getSmallBlindIndex(state);
  return getNextActivePlayerIndex(state, sbIndex);
}

export function calculateMinRaise(state: GameState): number {
  return Math.max(state.bigBlind, state.currentBet * 2);
}

export function isValidAction(state: GameState, playerId: string, action: PlayerAction): boolean {
  const player = state.players.find(p => p.id === playerId);
  if (!player || player.isFolded || !player.isActive) return false;
  if (state.players[state.currentPlayerIndex]?.id !== playerId) return false;

  const callAmount = state.currentBet - player.currentBet;

  switch (action.type) {
    case 'fold':
      return true;
    case 'check':
      return callAmount === 0;
    case 'call':
      return callAmount > 0 && player.chips >= callAmount;
    case 'raise': {
      if (!action.amount) return false;
      const raiseAmount = action.amount;
      return raiseAmount >= state.minRaise && player.chips >= (raiseAmount - player.currentBet);
    }
    case 'all-in':
      return player.chips > 0;
    default:
      return false;
  }
}

export function applyAction(state: GameState, playerId: string, action: PlayerAction): GameState {
  const newState = JSON.parse(JSON.stringify(state)) as GameState;
  const playerIndex = newState.players.findIndex(p => p.id === playerId);
  if (playerIndex === -1) return newState;

  const player = newState.players[playerIndex];

  switch (action.type) {
    case 'fold':
      player.isFolded = true;
      break;
    case 'check':
      break;
    case 'call': {
      const callAmount = Math.min(newState.currentBet - player.currentBet, player.chips);
      player.chips -= callAmount;
      player.currentBet += callAmount;
      player.totalBet += callAmount;
      newState.pot += callAmount;
      if (player.chips === 0) player.isAllIn = true;
      break;
    }
    case 'raise': {
      const raiseTotal = action.amount!;
      const toAdd = raiseTotal - player.currentBet;
      player.chips -= toAdd;
      player.currentBet = raiseTotal;
      player.totalBet += toAdd;
      newState.pot += toAdd;
      newState.currentBet = raiseTotal;
      newState.minRaise = raiseTotal + (raiseTotal - state.currentBet);
      if (player.chips === 0) player.isAllIn = true;
      break;
    }
    case 'all-in': {
      const allInAmount = player.chips;
      player.currentBet += allInAmount;
      player.totalBet += allInAmount;
      newState.pot += allInAmount;
      player.chips = 0;
      player.isAllIn = true;
      if (player.currentBet > newState.currentBet) {
        newState.currentBet = player.currentBet;
        newState.minRaise = player.currentBet + Math.max(state.bigBlind, player.currentBet - state.currentBet);
      }
      break;
    }
  }

  newState.lastAction = { playerId, action };
  return newState;
}

export function isRoundOver(state: GameState): boolean {
  const inHand = getPlayersInHand(state);
  if (inHand.length <= 1) return true;

  const canAct = inHand.filter(p => !p.isAllIn);
  if (canAct.length === 0) return true;
  if (canAct.length === 1 && canAct[0].currentBet >= state.currentBet) return true;

  const allMatched = canAct.every(p => p.currentBet === state.currentBet);
  return allMatched && state.lastAction !== undefined;
}

export function advancePhase(state: GameState): GamePhase {
  const phases: GamePhase[] = ['preflop', 'flop', 'turn', 'river', 'showdown'];
  const currentIndex = phases.indexOf(state.phase);
  if (currentIndex < phases.length - 1) {
    return phases[currentIndex + 1];
  }
  return 'showdown';
}

export function resetBetsForNewRound(state: GameState): GameState {
  const newState = JSON.parse(JSON.stringify(state)) as GameState;
  for (const player of newState.players) {
    player.currentBet = 0;
  }
  newState.currentBet = 0;
  newState.minRaise = newState.bigBlind;
  newState.lastAction = undefined;
  newState.actedThisRound = [];

  const sbIndex = getSmallBlindIndex(newState);
  newState.currentPlayerIndex = getNextActivePlayerIndex(newState, newState.dealerIndex);
  if (newState.currentPlayerIndex === -1) {
    const firstActive = newState.players.findIndex(p => p.isActive && !p.isFolded && !p.isAllIn);
    newState.currentPlayerIndex = firstActive >= 0 ? firstActive : sbIndex;
  }

  return newState;
}

export function calculateSidePots(state: GameState): SidePot[] {
  const playersInHand = getPlayersInHand(state);
  if (playersInHand.length === 0) return [];

  const allInAmounts = playersInHand
    .filter(p => p.isAllIn)
    .map(p => p.totalBet)
    .sort((a, b) => a - b);

  const uniqueAmounts = [...new Set(allInAmounts)];
  if (uniqueAmounts.length === 0) {
    return [{ amount: state.pot, eligiblePlayerIds: playersInHand.map(p => p.id) }];
  }

  const sidePots: SidePot[] = [];
  let previousLevel = 0;

  for (const level of uniqueAmounts) {
    const contribution = level - previousLevel;
    const eligible = playersInHand.filter(p => p.totalBet >= level);
    const potAmount = contribution * eligible.length;
    if (potAmount > 0) {
      sidePots.push({ amount: potAmount, eligiblePlayerIds: eligible.map(p => p.id) });
    }
    previousLevel = level;
  }

  const remainingPlayers = playersInHand.filter(p => p.totalBet > previousLevel);
  if (remainingPlayers.length > 0) {
    let remaining = 0;
    for (const p of remainingPlayers) {
      remaining += p.totalBet - previousLevel;
    }
    if (remaining > 0) {
      sidePots.push({ amount: remaining, eligiblePlayerIds: remainingPlayers.map(p => p.id) });
    }
  }

  return sidePots;
}

export function determineWinners(state: GameState): { playerId: string; amount: number; handName: string }[] {
  const inHand = getPlayersInHand(state);

  if (inHand.length === 1) {
    return [{ playerId: inHand[0].id, amount: state.pot, handName: 'Last Standing' }];
  }

  const sidePots = calculateSidePots(state);
  const winners: Map<string, { amount: number; handName: string }> = new Map();

  const evaluations = new Map<string, ReturnType<typeof evaluateHand>>();
  for (const player of inHand) {
    evaluations.set(player.id, evaluateHand(player.cards, state.communityCards));
  }

  for (const pot of sidePots) {
    const eligibleEvals = pot.eligiblePlayerIds
      .filter(id => evaluations.has(id))
      .map(id => ({ id, eval: evaluations.get(id)! }));

    if (eligibleEvals.length === 0) continue;

    eligibleEvals.sort((a, b) => compareHands(b.eval, a.eval));
    const bestValue = eligibleEvals[0].eval.value;
    const potWinners = eligibleEvals.filter(e => e.eval.value === bestValue);
    const share = Math.floor(pot.amount / potWinners.length);

    for (const w of potWinners) {
      const existing = winners.get(w.id);
      if (existing) {
        existing.amount += share;
      } else {
        winners.set(w.id, { amount: share, handName: w.eval.rankName });
      }
    }
  }

  return Array.from(winners.entries()).map(([playerId, data]) => ({
    playerId,
    amount: data.amount,
    handName: data.handName,
  }));
}
