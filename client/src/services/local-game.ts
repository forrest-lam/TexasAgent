import {
  GameState, Player, PlayerAction, RoomConfig, AIPersonality, AIEngineType,
  Deck, generateId, AI_STARTING_CHIPS,
  getNextActivePlayerIndex, getSmallBlindIndex, getBigBlindIndex,
  isValidAction, applyAction, advancePhase, resetBetsForNewRound,
  determineWinners, calculateSidePots, getPlayersInHand,
} from '@texas-agent/shared';
import { playSound } from './sound-service';
import { LogEntry } from '../stores/game-store';

type StateCallback = (state: GameState) => void;
type LogCallback = (entry: LogEntry) => void;

export class LocalGameEngine {
  private deck!: Deck;
  private state!: GameState;
  private config: RoomConfig;
  private onStateChange: StateCallback;
  private onLog: LogCallback;
  private aiWorkerTimer: ReturnType<typeof setTimeout> | null = null;
  // Use a plain Set internally, serialize to array for JSON
  private actedSet: Set<string> = new Set();

  private humanChips: number;

  constructor(config: RoomConfig, onStateChange: StateCallback, onLog: LogCallback, humanChips?: number) {
    this.config = config;
    this.onStateChange = onStateChange;
    this.onLog = onLog;
    this.humanChips = humanChips ?? config.startingChips;
  }

  start(): void {
    this.deck = new Deck();
    const players = this.createPlayers();
    this.state = this.initState(players, 0);
    this.postBlinds();
    this.dealHoleCards();

    const bbIndex = getBigBlindIndex(this.state);
    this.state.currentPlayerIndex = getNextActivePlayerIndex(this.state, bbIndex);
    if (this.state.currentPlayerIndex === -1) {
      this.state.currentPlayerIndex = getNextActivePlayerIndex(this.state, this.state.dealerIndex);
    }

    // Clear acted set for preflop — blinds don't count as having "acted"
    this.actedSet.clear();
    this.state.actedThisRound = [];

    this.onLog({ key: 'log.gameStarted' });
    this.emit();
    this.scheduleAI();
  }

  handleAction(action: PlayerAction): void {
    const playerId = this.state.players[this.state.currentPlayerIndex]?.id;
    if (!playerId || playerId !== 'human') return;
    if (!isValidAction(this.state, playerId, action)) return;

    this.processAction(playerId, action);
  }

  getState(): GameState {
    return this.state;
  }

  cleanup(): void {
    if (this.aiWorkerTimer) clearTimeout(this.aiWorkerTimer);
  }

  private createPlayers(): Player[] {
    const aiNames = ['AlphaBot', 'BetaMind', 'GammaAce', 'DeltaPro', 'EpsilonX', 'ZetaKing', 'ThetaQ', 'IoaStar'];
    const personalities: AIPersonality[] = ['conservative', 'aggressive', 'balanced'];
    const players: Player[] = [{
      id: 'human',
      name: 'You',
      chips: this.humanChips,
      cards: [],
      currentBet: 0,
      totalBet: 0,
      isActive: true,
      isFolded: false,
      isAllIn: false,
      isAI: false,
      seatIndex: 0,
    }];

    for (let i = 0; i < this.config.aiCount; i++) {
      players.push({
        id: `ai-${i}`,
        name: aiNames[i % aiNames.length],
        chips: AI_STARTING_CHIPS,
        cards: [],
        currentBet: 0,
        totalBet: 0,
        isActive: true,
        isFolded: false,
        isAllIn: false,
        isAI: true,
        aiPersonality: personalities[i % 3],
        aiEngineType: 'rule-based',
        seatIndex: i + 1,
      });
    }

    return players;
  }

  private initState(players: Player[], dealerIndex: number): GameState {
    const p = players.map(pl => ({
      ...pl,
      cards: [],
      currentBet: 0,
      totalBet: 0,
      isFolded: false,
      isAllIn: false,
      isActive: pl.chips > 0,
      isDealer: false,
      isSmallBlind: false,
      isBigBlind: false,
    }));

    const state: GameState = {
      id: generateId(),
      phase: 'preflop',
      players: p,
      communityCards: [],
      pot: 0,
      sidePots: [],
      currentPlayerIndex: 0,
      dealerIndex,
      smallBlind: this.config.smallBlind,
      bigBlind: this.config.bigBlind,
      minRaise: this.config.bigBlind * 2,
      currentBet: this.config.bigBlind,
      round: (this.state?.round || 0) + 1,
      actedThisRound: [],
    };

    state.players[dealerIndex].isDealer = true;
    const sbIdx = getSmallBlindIndex(state);
    const bbIdx = getBigBlindIndex(state);
    if (state.players[sbIdx]) state.players[sbIdx].isSmallBlind = true;
    if (state.players[bbIdx]) state.players[bbIdx].isBigBlind = true;

    return state;
  }

  private postBlinds(): void {
    const sbIdx = getSmallBlindIndex(this.state);
    const bbIdx = getBigBlindIndex(this.state);
    const sb = this.state.players[sbIdx];
    const bb = this.state.players[bbIdx];

    if (sb) {
      const amt = Math.min(this.state.smallBlind, sb.chips);
      sb.chips -= amt;
      sb.currentBet = amt;
      sb.totalBet = amt;
      this.state.pot += amt;
      if (sb.chips === 0) sb.isAllIn = true;
    }
    if (bb) {
      const amt = Math.min(this.state.bigBlind, bb.chips);
      bb.chips -= amt;
      bb.currentBet = amt;
      bb.totalBet = amt;
      this.state.pot += amt;
      if (bb.chips === 0) bb.isAllIn = true;
    }
    this.state.currentBet = this.state.bigBlind;
  }

  private dealHoleCards(): void {
    for (const p of this.state.players) {
      if (p.isActive) p.cards = this.deck.deal(2);
    }
    playSound('deal');
  }

  private dealCommunity(count: number): void {
    this.deck.burn();
    this.state.communityCards.push(...this.deck.deal(count));
    playSound('deal');
  }

  private async processAction(playerId: string, action: PlayerAction): Promise<void> {
    const newState = applyAction(this.state, playerId, action);
    Object.assign(this.state, newState);

    // Track that this player has acted
    this.actedSet.add(playerId);
    this.state.actedThisRound = Array.from(this.actedSet);

    const player = this.state.players.find(p => p.id === playerId);
    this.onLog({
      key: 'log.action',
      params: { name: player?.name || '?', action: action.type, ...(action.amount ? { amount: action.amount } : {}) },
    });

    // If a raise happened, everyone except the raiser needs to act again
    if (action.type === 'raise' || action.type === 'all-in') {
      // Only reset if the current bet actually went up (all-in might not raise)
      const prevBet = this.state.currentBet;
      // For raise, reset acted set except for the raiser
      if (action.type === 'raise' || (action.type === 'all-in' && (player?.currentBet || 0) > prevBet)) {
        this.actedSet.clear();
        this.actedSet.add(playerId);
        this.state.actedThisRound = Array.from(this.actedSet);
      }
    }

    const inHand = getPlayersInHand(this.state);
    if (inHand.length <= 1) {
      this.finishHand();
      return;
    }

    if (this.isBettingDone()) {
      await this.nextPhase();
    } else {
      this.state.currentPlayerIndex = getNextActivePlayerIndex(this.state, this.state.currentPlayerIndex);
      if (this.state.currentPlayerIndex === -1) {
        await this.nextPhase();
      } else {
        this.emit();
        this.scheduleAI();
      }
    }
  }

  /**
   * Determine if the current betting round is complete.
   * A betting round ends when:
   * 1. All non-folded, non-all-in players have acted AND
   * 2. All non-folded, non-all-in players have matched the current bet
   * Special preflop rule: BB has "option" - they must also have acted even if everyone just called
   */
  private isBettingDone(): boolean {
    const inHand = getPlayersInHand(this.state);
    const canAct = inHand.filter(p => !p.isAllIn);

    // If nobody can act (everyone is all-in or folded), round is done
    if (canAct.length === 0) return true;

    // Check if all players who can act have matched the current bet
    const allMatched = canAct.every(p => p.currentBet === this.state.currentBet);
    if (!allMatched) return false;

    // Check if all players who can act have actually acted this round
    const allActed = canAct.every(p => this.actedSet.has(p.id));
    if (!allActed) return false;

    // If only 1 can act and they've matched and acted, done
    return true;
  }

  private async nextPhase(): Promise<void> {
    const inHand = getPlayersInHand(this.state);
    const canAct = inHand.filter(p => !p.isAllIn);

    // If nobody (or at most 1) can act AND everyone who should have matched the bet has,
    // then we need to deal remaining community cards without further action
    if (canAct.length === 0) {
      // All players all-in: run out remaining community cards with delays
      while (this.state.communityCards.length < 5) {
        const need = this.state.communityCards.length < 3 ? 3 - this.state.communityCards.length : 1;
        this.dealCommunity(Math.min(need, 5 - this.state.communityCards.length));
        const next = advancePhase(this.state);
        this.state.phase = next === 'showdown' && this.state.communityCards.length < 5 ? this.state.phase : next;
        this.emit();
        await new Promise(r => setTimeout(r, 800));
      }
      this.finishHand();
      return;
    }

    // Normal case: advance to next phase
    const next = advancePhase(this.state);
    if (next === 'showdown') {
      this.finishHand();
      return;
    }

    this.state.phase = next;
    Object.assign(this.state, resetBetsForNewRound(this.state));

    // Reset acted tracking for new round
    this.actedSet.clear();
    this.state.actedThisRound = [];

    if (next === 'flop') this.dealCommunity(3);
    else this.dealCommunity(1);

    this.state.currentPlayerIndex = getNextActivePlayerIndex(this.state, this.state.dealerIndex);
    if (this.state.currentPlayerIndex === -1) {
      // No one can act this round (e.g., all but one are all-in and that one folded)
      await this.nextPhase();
      return;
    }

    this.emit();
    this.scheduleAI();
  }

  private finishHand(): void {
    this.state.phase = 'showdown';
    this.state.sidePots = calculateSidePots(this.state);
    this.state.winners = determineWinners(this.state);

    if (this.state.winners) {
      for (const w of this.state.winners) {
        const p = this.state.players.find(pl => pl.id === w.playerId);
        if (p) p.chips += w.amount;
        this.onLog({
          key: 'log.wins',
          params: { name: p?.name || '?', amount: w.amount, hand: w.handName },
        });
      }
      playSound('win');
    }

    // Early win (everyone else folded): hide AI cards — no need to reveal
    const isEarlyWin = this.state.winners?.length === 1
      && this.state.winners[0].handName === 'Last Standing';
    if (isEarlyWin) {
      for (const p of this.state.players) {
        if (p.id !== 'human') {
          p.cards = p.cards.map(() => ({ suit: 'spades' as const, rank: '2' as const }));
        }
      }
    }

    this.emit();

    // Longer delay at showdown so players can see the result
    setTimeout(() => this.startNextHand(), 6000);
  }

  /** Restart the whole game (e.g. after player busted) */
  restart(): void {
    if (this.aiWorkerTimer) clearTimeout(this.aiWorkerTimer);
    this.deck = new Deck();
    const players = this.createPlayers();
    this.state = this.initState(players, 0);
    // Reset round counter
    (this.state as any).round = 1;
    this.postBlinds();
    this.dealHoleCards();

    const bbIndex = getBigBlindIndex(this.state);
    this.state.currentPlayerIndex = getNextActivePlayerIndex(this.state, bbIndex);
    if (this.state.currentPlayerIndex === -1) {
      this.state.currentPlayerIndex = getNextActivePlayerIndex(this.state, this.state.dealerIndex);
    }

    this.actedSet.clear();
    this.state.actedThisRound = [];

    this.onLog({ key: 'log.gameRestarted' });
    this.emit();
    this.scheduleAI();
  }

  private startNextHand(): void {
    const alive = this.state.players.filter(p => p.chips > 0);
    if (alive.length < 2) {
      this.onLog({ key: 'log.gameOver' });
      this.state.phase = 'showdown'; // keep in showdown to show restart button
      this.emit();
      return;
    }

    this.deck = new Deck();
    const nextDealer = (this.state.dealerIndex + 1) % this.state.players.length;
    this.state = this.initState(this.state.players, nextDealer);
    this.postBlinds();
    this.dealHoleCards();

    const bbIdx = getBigBlindIndex(this.state);
    this.state.currentPlayerIndex = getNextActivePlayerIndex(this.state, bbIdx);
    if (this.state.currentPlayerIndex === -1) {
      this.state.currentPlayerIndex = getNextActivePlayerIndex(this.state, this.state.dealerIndex);
    }

    // Reset acted tracking
    this.actedSet.clear();
    this.state.actedThisRound = [];

    this.onLog({ key: 'log.newHand' });
    this.emit();
    this.scheduleAI();
  }

  private scheduleAI(): void {
    if (this.aiWorkerTimer) clearTimeout(this.aiWorkerTimer);

    const current = this.state.players[this.state.currentPlayerIndex];
    if (!current?.isAI) return;

    const delay = 800 + Math.random() * 1500;
    this.aiWorkerTimer = setTimeout(() => {
      this.makeAIDecision(current);
    }, delay);
  }

  private makeAIDecision(player: Player): void {
    const callAmount = this.state.currentBet - player.currentBet;
    const strength = this.estimateSimpleStrength(player);

    let action: PlayerAction;

    if (callAmount === 0) {
      if (strength > 0.7 && Math.random() < 0.5) {
        const raiseAmt = Math.min(this.state.minRaise + Math.floor(Math.random() * this.state.bigBlind * 3), player.chips + player.currentBet);
        action = raiseAmt >= this.state.minRaise ? { type: 'raise', amount: raiseAmt } : { type: 'check' };
      } else {
        action = { type: 'check' };
      }
    } else if (strength > 0.6 || (strength > 0.35 && callAmount <= this.state.bigBlind * 3)) {
      if (strength > 0.8 && Math.random() < 0.4) {
        const raiseAmt = Math.min(this.state.minRaise + Math.floor(Math.random() * this.state.pot * 0.5), player.chips + player.currentBet);
        action = raiseAmt >= this.state.minRaise ? { type: 'raise', amount: raiseAmt } : { type: 'call' };
      } else {
        action = player.chips >= callAmount ? { type: 'call' } : { type: 'all-in' };
      }
    } else {
      action = { type: 'fold' };
    }

    // Play sound for AI actions
    const soundMap: Record<string, any> = {
      fold: 'fold', check: 'check', call: 'call', raise: 'raise', 'all-in': 'allIn',
    };
    playSound(soundMap[action.type] || 'chip');

    if (isValidAction(this.state, player.id, action)) {
      this.processAction(player.id, action);
    } else {
      this.processAction(player.id, callAmount === 0 ? { type: 'check' } : { type: 'fold' });
    }
  }

  private estimateSimpleStrength(player: Player): number {
    const rankVal: Record<string, number> = {
      '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
      '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
    };
    const [c1, c2] = player.cards;
    if (!c1 || !c2) return 0.3;
    const r1 = rankVal[c1.rank] || 5;
    const r2 = rankVal[c2.rank] || 5;
    const high = Math.max(r1, r2);
    const low = Math.min(r1, r2);
    const suited = c1.suit === c2.suit;
    const pair = r1 === r2;

    let s = 0;
    if (pair) { s = 0.5 + (high / 14) * 0.5; }
    else { s = (high + low) / 28; if (suited) s += 0.05; if (high - low <= 4) s += 0.03; }

    // Phase-dependent adjustment: be more cautious after flop without good cards
    if (this.state.phase !== 'preflop' && this.state.communityCards.length > 0) {
      // Slightly boost since we don't fully analyze board here
      s += 0.05;
    }

    const personality = player.aiPersonality || 'balanced';
    if (personality === 'aggressive') s += 0.1;
    if (personality === 'conservative') s -= 0.08;

    return Math.min(Math.max(s, 0), 1);
  }

  private emit(): void {
    this.onStateChange(JSON.parse(JSON.stringify(this.state)));
  }
}
