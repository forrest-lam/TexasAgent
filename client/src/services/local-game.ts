import {
  GameState, Player, PlayerAction, RoomConfig, AIPersonality, AIEngineType,
  Deck, generateId, AI_STARTING_CHIPS, LLM_BOT_CONFIGS, RULE_BOT_CONFIGS,
  getNextActivePlayerIndex, getSmallBlindIndex, getBigBlindIndex,
  isValidAction, applyAction, advancePhase, resetBetsForNewRound,
  determineWinners, calculateSidePots, getPlayersInHand,
} from '@texas-agent/shared';
import { playSound } from './sound-service';
import { LogEntry } from '../stores/game-store';

type StateCallback = (state: GameState) => void;
type LogCallback = (entry: LogEntry) => void;

/** Pick up to `max` random LLM bots from the config list */
function pickRandomLLMBots(max: number): typeof LLM_BOT_CONFIGS[number][] {
  const shuffled = [...LLM_BOT_CONFIGS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, max);
}

/** Pick up to `max` random named rule bots from the config list */
function pickRandomRuleBots(max: number): typeof RULE_BOT_CONFIGS[number][] {
  const shuffled = [...RULE_BOT_CONFIGS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, max);
}

export interface LocalGameOptions {
  /** Server base URL for LLM bot API calls */
  serverUrl?: string;
  /** Auth token for API calls */
  authToken?: string;
  /** Max number of LLM bots to include (0-2, default 2) */
  maxLLMBots?: number;
  /** Max number of named rule bots (Blaze/Shield/Sage) to include (0-3, default 2) */
  maxRuleBots?: number;
}

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
  private options: LocalGameOptions;
  /** Map player id → LLM bot config id for LLM bot players */
  private llmBotMap: Map<string, string> = new Map();
  /** Map player id → Rule bot config id for named rule bot players */
  private ruleBotMap: Map<string, string> = new Map();

  constructor(config: RoomConfig, onStateChange: StateCallback, onLog: LogCallback, humanChips?: number, options?: LocalGameOptions) {
    this.config = config;
    this.onStateChange = onStateChange;
    this.onLog = onLog;
    this.humanChips = humanChips ?? config.startingChips;
    this.options = options ?? {};
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

    // Pick random LLM bots (up to maxLLMBots, default 2)
    // LLM bots always join; if server API is unavailable they fallback to local rule-based strategy
    this.llmBotMap.clear();
    this.ruleBotMap.clear();
    const maxLLM = this.options.maxLLMBots ?? 2;
    const selectedLLMBots = pickRandomLLMBots(maxLLM);

    // Pick random named rule bots (up to maxRuleBots, default 2)
    // Named rule bots always work — they fallback to local rule-based strategy if API is unavailable
    const maxRule = this.options.maxRuleBots ?? 2;
    const selectedRuleBots = pickRandomRuleBots(maxRule);

    let seatIdx = 1;

    // Add LLM bot players first
    for (const bot of selectedLLMBots) {
      const playerId = `llm-${bot.id}`;
      this.llmBotMap.set(playerId, bot.id);
      players.push({
        id: playerId,
        name: bot.name,
        chips: AI_STARTING_CHIPS,
        cards: [],
        currentBet: 0,
        totalBet: 0,
        isActive: true,
        isFolded: false,
        isAllIn: false,
        isAI: true,
        isLLMBot: true,
        llmBotId: bot.id,
        aiPersonality: bot.personality,
        aiEngineType: 'llm',
        seatIndex: seatIdx++,
      });
    }

    // Add named rule bots (Blaze/Shield/Sage)
    for (const bot of selectedRuleBots) {
      const playerId = `rulebot-${bot.id}`;
      this.ruleBotMap.set(playerId, bot.id);
      players.push({
        id: playerId,
        name: bot.name,
        chips: AI_STARTING_CHIPS,
        cards: [],
        currentBet: 0,
        totalBet: 0,
        isActive: true,
        isFolded: false,
        isAllIn: false,
        isAI: true,
        isRuleBot: true,
        ruleBotId: bot.id,
        aiPersonality: bot.personality,
        aiEngineType: 'rule-based',
        seatIndex: seatIdx++,
      });
    }

    // Fill remaining seats with anonymous rule-based bots
    const namedCount = selectedLLMBots.length + selectedRuleBots.length;
    const ruleCount = this.config.aiCount - namedCount;
    for (let i = 0; i < ruleCount; i++) {
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
        seatIndex: seatIdx++,
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
    // Remove AI bots with no chips (they "leave the table")
    const bustedBots = this.state.players.filter(p => p.isAI && p.chips <= 0);
    if (bustedBots.length > 0) {
      for (const bot of bustedBots) {
        this.onLog({ key: 'log.playerLeft', params: { name: bot.name } });
        // Clean up bot maps
        this.llmBotMap.delete(bot.id);
        this.ruleBotMap.delete(bot.id);
      }
      this.state.players = this.state.players.filter(p => !(p.isAI && p.chips <= 0));
    }

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

  /**
   * Calculate a valid raise amount for AI, respecting Texas Hold'em min-raise rules.
   * The raise must be >= state.minRaise (which tracks the minimum legal total bet).
   * Amount is aligned to bigBlind increments and capped at player's stack.
   */
  private calculateAIRaiseAmount(player: Player, strength: number): number {
    const { minRaise, currentBet, bigBlind, pot } = this.state;
    const maxRaise = player.chips + player.currentBet;

    // The raise increment (how much above currentBet the minRaise requires)
    const increment = Math.max(minRaise - currentBet, bigBlind);

    // Determine multiplier based on hand strength
    let multiplier: number;
    const personality = player.aiPersonality || 'balanced';
    const aggFactor = personality === 'aggressive' ? 0.7 : personality === 'conservative' ? 0.3 : 0.5;

    if (strength >= 0.85) {
      multiplier = aggFactor >= 0.7 ? 4 : aggFactor >= 0.5 ? 3 : 2;
    } else if (strength >= 0.7) {
      multiplier = aggFactor >= 0.7 ? 3 : 2;
    } else if (strength >= 0.55) {
      multiplier = 2;
    } else {
      multiplier = 1; // minimum raise for bluffs/marginal hands
    }

    // Also consider pot-relative sizing
    const desiredPotPct = 0.5 + strength * aggFactor * 0.5;
    const desiredTotal = Math.floor(pot * desiredPotPct) + currentBet;
    const potMultiplier = Math.max(1, Math.round((desiredTotal - currentBet) / increment));
    multiplier = Math.min(multiplier, potMultiplier);
    multiplier = Math.max(1, multiplier);

    let raiseAmount = currentBet + increment * multiplier;

    // Align to bigBlind
    raiseAmount = Math.round(raiseAmount / bigBlind) * bigBlind;

    // Clamp to [minRaise, maxRaise]
    raiseAmount = Math.max(minRaise, Math.min(raiseAmount, maxRaise));

    // Cap raise at 40% of stack for medium-strength hands
    if (strength < 0.7) {
      const stackCap = Math.floor((player.chips * 0.4 + player.currentBet) / bigBlind) * bigBlind;
      raiseAmount = Math.min(raiseAmount, stackCap);
      raiseAmount = Math.max(raiseAmount, minRaise);
    }

    // Final alignment
    raiseAmount = Math.round(raiseAmount / bigBlind) * bigBlind;
    raiseAmount = Math.max(minRaise, Math.min(raiseAmount, maxRaise));

    return raiseAmount;
  }

  private makeAIDecision(player: Player): void {
    const llmBotId = this.llmBotMap.get(player.id);
    if (llmBotId && this.options.serverUrl && this.options.authToken) {
      // LLM bot — call server API
      this.makeLLMBotDecision(player, llmBotId);
      return;
    }

    const ruleBotId = this.ruleBotMap.get(player.id);
    if (ruleBotId && this.options.serverUrl && this.options.authToken) {
      // Named rule bot — call server API for full strategy (Monte Carlo simulation)
      this.makeNamedRuleBotDecision(player, ruleBotId);
      return;
    }

    // Anonymous rule-based decision (local simplified strategy)
    this.makeRuleBasedDecision(player);
  }

  private async makeLLMBotDecision(player: Player, botId: string): Promise<void> {
    const callAmount = this.state.currentBet - player.currentBet;
    const context = {
      playerId: player.id,
      hand: player.cards,
      communityCards: this.state.communityCards,
      pot: this.state.pot,
      currentBet: this.state.currentBet,
      playerBet: player.currentBet,
      playerChips: player.chips,
      minRaise: this.state.minRaise,
      bigBlind: this.state.bigBlind,
      phase: this.state.phase,
      numActivePlayers: getPlayersInHand(this.state).length,
      position: this.estimatePosition(player),
      personality: player.aiPersonality || 'balanced',
      players: this.state.players.map(p => ({
        id: p.id,
        name: p.name,
        chips: p.chips,
        currentBet: p.currentBet,
        isFolded: p.isFolded,
        isAllIn: p.isAllIn,
      })),
    };

    try {
      const response = await fetch(`${this.options.serverUrl}/api/llm/bot-decision`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.options.authToken}`,
        },
        body: JSON.stringify({ botId, context }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.action) {
          const action = data.action as PlayerAction;
          const soundMap: Record<string, any> = {
            fold: 'fold', check: 'check', call: 'call', raise: 'raise', 'all-in': 'allIn',
          };
          playSound(soundMap[action.type] || 'chip');

          if (isValidAction(this.state, player.id, action)) {
            this.processAction(player.id, action);
            return;
          }
        }
      }
    } catch (err) {
      console.warn(`[LocalGame] LLM bot ${botId} API call failed, falling back to rule-based`, err);
    }

    // Fallback to rule-based if LLM call fails
    this.makeRuleBasedDecision(player);
  }

  /** Named rule bot (Blaze/Shield/Sage) — call server API for full Monte Carlo strategy */
  private async makeNamedRuleBotDecision(player: Player, botId: string): Promise<void> {
    const context = {
      playerId: player.id,
      hand: player.cards,
      communityCards: this.state.communityCards,
      pot: this.state.pot,
      currentBet: this.state.currentBet,
      playerBet: player.currentBet,
      playerChips: player.chips,
      minRaise: this.state.minRaise,
      bigBlind: this.state.bigBlind,
      phase: this.state.phase,
      numActivePlayers: getPlayersInHand(this.state).length,
      position: this.estimatePosition(player),
      personality: player.aiPersonality || 'balanced',
      players: this.state.players.map(p => ({
        id: p.id,
        name: p.name,
        chips: p.chips,
        currentBet: p.currentBet,
        isFolded: p.isFolded,
        isAllIn: p.isAllIn,
      })),
    };

    try {
      const response = await fetch(`${this.options.serverUrl}/api/rule-bot/decision`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.options.authToken}`,
        },
        body: JSON.stringify({ botId, context }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.action) {
          const action = data.action as PlayerAction;
          const soundMap: Record<string, any> = {
            fold: 'fold', check: 'check', call: 'call', raise: 'raise', 'all-in': 'allIn',
          };
          playSound(soundMap[action.type] || 'chip');

          if (isValidAction(this.state, player.id, action)) {
            this.processAction(player.id, action);
            return;
          }
        }
      }
    } catch (err) {
      console.warn(`[LocalGame] Rule bot ${botId} API call failed, falling back to local rule-based`, err);
    }

    // Fallback to local simplified rule-based if API call fails
    this.makeRuleBasedDecision(player);
  }

  private estimatePosition(player: Player): 'early' | 'middle' | 'late' | 'blinds' {
    const active = this.state.players.filter(p => p.isActive && !p.isFolded);
    const idx = active.findIndex(p => p.id === player.id);
    if (idx < 0) return 'middle';
    const total = active.length;
    if (player.isSmallBlind || player.isBigBlind) return 'blinds';
    const relPos = idx / total;
    if (relPos < 0.33) return 'early';
    if (relPos < 0.66) return 'middle';
    return 'late';
  }

  private makeRuleBasedDecision(player: Player): void {
    const callAmount = this.state.currentBet - player.currentBet;
    const strength = this.estimateSimpleStrength(player);
    const maxRaise = player.chips + player.currentBet;

    let action: PlayerAction;

    if (callAmount === 0) {
      // No bet to call: check or raise
      if (strength > 0.7 && Math.random() < 0.5) {
        const raiseAmt = this.calculateAIRaiseAmount(player, strength);
        if (raiseAmt >= maxRaise) {
          action = { type: 'all-in' };
        } else if (raiseAmt >= this.state.minRaise) {
          action = { type: 'raise', amount: raiseAmt };
        } else {
          action = { type: 'check' };
        }
      } else {
        action = { type: 'check' };
      }
    } else if (strength > 0.6 || (strength > 0.35 && callAmount <= this.state.bigBlind * 3)) {
      // Consider raising with strong hands
      if (strength > 0.8 && Math.random() < 0.4) {
        const raiseAmt = this.calculateAIRaiseAmount(player, strength);
        if (raiseAmt >= maxRaise) {
          action = { type: 'all-in' };
        } else if (raiseAmt >= this.state.minRaise && player.chips >= (raiseAmt - player.currentBet)) {
          action = { type: 'raise', amount: raiseAmt };
        } else {
          action = player.chips >= callAmount ? { type: 'call' } : { type: 'all-in' };
        }
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
      // Fallback: try call, then check, then fold
      if (callAmount === 0) {
        this.processAction(player.id, { type: 'check' });
      } else if (player.chips >= callAmount) {
        this.processAction(player.id, { type: 'call' });
      } else {
        this.processAction(player.id, { type: 'fold' });
      }
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
