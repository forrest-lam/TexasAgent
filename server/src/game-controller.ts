import {
  GameState, GamePhase, Player, PlayerAction, Room,
  getActivePlayers, getPlayersInHand, getNextActivePlayerIndex,
  getSmallBlindIndex, getBigBlindIndex, calculateMinRaise,
  isValidAction, applyAction, isRoundOver, advancePhase,
  resetBetsForNewRound, determineWinners, calculateSidePots,
  Deck, generateId, ACTION_TIMEOUT,
} from '@texas-agent/shared';
import { AIPlayer } from './ai/ai-player';

type GameEventCallback = (roomId: string, event: string, data: unknown) => void;

export class GameController {
  private deck!: Deck;
  private room: Room;
  private aiPlayers: Map<string, AIPlayer> = new Map();
  private actionTimer: ReturnType<typeof setTimeout> | null = null;
  private emitEvent: GameEventCallback;
  private isProcessing = false;

  constructor(room: Room, emitEvent: GameEventCallback) {
    this.room = room;
    this.emitEvent = emitEvent;
  }

  startGame(): GameState {
    if (this.room.players.length < 2) {
      throw new Error('Need at least 2 players to start');
    }

    this.deck = new Deck();
    this.aiPlayers.clear();

    // Initialize AI players
    for (const player of this.room.players) {
      if (player.isAI) {
        this.aiPlayers.set(
          player.id,
          new AIPlayer(player.aiPersonality || 'balanced', player.aiEngineType || 'rule-based')
        );
      }
    }

    const state = this.initializeGameState();
    this.room.gameState = state;
    this.room.status = 'playing';

    // Post blinds and deal cards
    this.postBlinds(state);
    this.dealHoleCards(state);

    // Set first player to act (UTG position)
    const bbIndex = getBigBlindIndex(state);
    state.currentPlayerIndex = getNextActivePlayerIndex(state, bbIndex);
    if (state.currentPlayerIndex === -1) {
      state.currentPlayerIndex = getNextActivePlayerIndex(state, state.dealerIndex);
    }

    this.emitEvent(this.room.id, 'game:started', this.sanitizeState(state));
    this.scheduleNextAction(state);

    return state;
  }

  handlePlayerAction(playerId: string, action: PlayerAction): void {
    const state = this.room.gameState;
    if (!state || state.phase === 'waiting' || state.phase === 'showdown') return;

    const currentPlayer = state.players[state.currentPlayerIndex];
    if (!currentPlayer || currentPlayer.id !== playerId) return;

    if (!isValidAction(state, playerId, action)) {
      this.emitEvent(this.room.id, 'error', 'Invalid action');
      return;
    }

    this.clearActionTimer();
    this.processAction(playerId, action);
  }

  cleanup(): void {
    this.clearActionTimer();
    this.aiPlayers.clear();
  }

  getState(): GameState | undefined {
    return this.room.gameState;
  }

  getSanitizedStateForPlayer(playerId: string): GameState | undefined {
    const state = this.room.gameState;
    if (!state) return undefined;

    const sanitized = JSON.parse(JSON.stringify(state)) as GameState;
    for (const player of sanitized.players) {
      if (player.id !== playerId && state.phase !== 'showdown') {
        player.cards = player.cards.map(() => ({ suit: 'spades' as const, rank: '2' as const }));
      }
    }
    return sanitized;
  }

  private initializeGameState(): GameState {
    // Reset player state for new hand
    const players: Player[] = this.room.players.map(p => ({
      ...p,
      cards: [],
      currentBet: 0,
      totalBet: 0,
      isFolded: false,
      isAllIn: false,
      isActive: p.chips > 0,
      isDealer: false,
      isSmallBlind: false,
      isBigBlind: false,
    }));

    // Calculate dealer position
    const prevState = this.room.gameState;
    let dealerIndex = 0;
    if (prevState) {
      dealerIndex = getNextActivePlayerIndex(
        { ...prevState, players } as GameState,
        prevState.dealerIndex
      );
      if (dealerIndex === -1) dealerIndex = 0;
    }

    const state: GameState = {
      id: generateId(),
      phase: 'preflop',
      players,
      communityCards: [],
      pot: 0,
      sidePots: [],
      currentPlayerIndex: 0,
      dealerIndex,
      smallBlind: this.room.config.smallBlind,
      bigBlind: this.room.config.bigBlind,
      minRaise: this.room.config.bigBlind * 2,
      currentBet: this.room.config.bigBlind,
      round: (prevState?.round || 0) + 1,
      actedThisRound: [],
    };

    // Mark positional roles
    state.players[dealerIndex].isDealer = true;
    const sbIndex = getSmallBlindIndex(state);
    const bbIndex = getBigBlindIndex(state);
    if (state.players[sbIndex]) state.players[sbIndex].isSmallBlind = true;
    if (state.players[bbIndex]) state.players[bbIndex].isBigBlind = true;

    return state;
  }

  private postBlinds(state: GameState): void {
    const sbIndex = getSmallBlindIndex(state);
    const bbIndex = getBigBlindIndex(state);
    const sbPlayer = state.players[sbIndex];
    const bbPlayer = state.players[bbIndex];

    if (sbPlayer) {
      const sbAmount = Math.min(state.smallBlind, sbPlayer.chips);
      sbPlayer.chips -= sbAmount;
      sbPlayer.currentBet = sbAmount;
      sbPlayer.totalBet = sbAmount;
      state.pot += sbAmount;
      if (sbPlayer.chips === 0) sbPlayer.isAllIn = true;
    }

    if (bbPlayer) {
      const bbAmount = Math.min(state.bigBlind, bbPlayer.chips);
      bbPlayer.chips -= bbAmount;
      bbPlayer.currentBet = bbAmount;
      bbPlayer.totalBet = bbAmount;
      state.pot += bbAmount;
      if (bbPlayer.chips === 0) bbPlayer.isAllIn = true;
    }

    state.currentBet = state.bigBlind;
  }

  private dealHoleCards(state: GameState): void {
    for (const player of state.players) {
      if (player.isActive) {
        player.cards = this.deck.deal(2);
      }
    }
  }

  private dealCommunityCards(state: GameState, count: number): void {
    this.deck.burn();
    const cards = this.deck.deal(count);
    state.communityCards.push(...cards);
  }

  private async processAction(playerId: string, action: PlayerAction): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    const state = this.room.gameState!;
    const newState = applyAction(state, playerId, action);
    Object.assign(state, newState);

    // Broadcast the action
    this.emitEvent(this.room.id, 'game:action', { playerId, action });

    // Check if only one player remains
    const inHand = getPlayersInHand(state);
    if (inHand.length <= 1) {
      this.finishHand(state);
      this.isProcessing = false;
      return;
    }

    // Check if the betting round is over
    if (this.isBettingRoundComplete(state)) {
      await this.advanceToNextPhase(state);
    } else {
      // Move to next player
      state.currentPlayerIndex = getNextActivePlayerIndex(state, state.currentPlayerIndex);
      if (state.currentPlayerIndex === -1) {
        await this.advanceToNextPhase(state);
      } else {
        this.broadcastState(state);
        this.scheduleNextAction(state);
      }
    }

    this.isProcessing = false;
  }

  private isBettingRoundComplete(state: GameState): boolean {
    const inHand = getPlayersInHand(state);
    const canAct = inHand.filter(p => !p.isAllIn);

    if (canAct.length === 0) return true;
    if (canAct.length === 1 && canAct[0].currentBet >= state.currentBet) return true;

    // All players who can act have matched the current bet
    return canAct.every(p => p.currentBet === state.currentBet);
  }

  private async advanceToNextPhase(state: GameState): Promise<void> {
    const inHand = getPlayersInHand(state);
    const canAct = inHand.filter(p => !p.isAllIn);

    // If all remaining players are all-in, deal remaining community cards
    if (canAct.length <= 1) {
      await this.runOutBoard(state);
      return;
    }

    const nextPhase = advancePhase(state);

    if (nextPhase === 'showdown') {
      this.finishHand(state);
      return;
    }

    state.phase = nextPhase;
    const resetState = resetBetsForNewRound(state);
    Object.assign(state, resetState);

    // Deal community cards
    switch (nextPhase) {
      case 'flop':
        this.dealCommunityCards(state, 3);
        break;
      case 'turn':
      case 'river':
        this.dealCommunityCards(state, 1);
        break;
    }

    // Set first player after dealer to act
    state.currentPlayerIndex = getNextActivePlayerIndex(state, state.dealerIndex);
    if (state.currentPlayerIndex === -1) {
      await this.advanceToNextPhase(state);
      return;
    }

    this.broadcastState(state);
    this.scheduleNextAction(state);
  }

  private async runOutBoard(state: GameState): Promise<void> {
    // Deal remaining community cards
    while (state.communityCards.length < 5) {
      const count = state.phase === 'preflop' ? 3 :
                    state.communityCards.length < 3 ? 3 - state.communityCards.length : 1;
      this.dealCommunityCards(state, Math.min(count, 5 - state.communityCards.length));

      if (state.communityCards.length === 3) state.phase = 'flop';
      else if (state.communityCards.length === 4) state.phase = 'turn';
      else if (state.communityCards.length === 5) state.phase = 'river';

      this.broadcastState(state);
      await new Promise(resolve => setTimeout(resolve, 800));
    }

    this.finishHand(state);
  }

  private finishHand(state: GameState): void {
    this.clearActionTimer();
    state.phase = 'showdown';
    state.sidePots = calculateSidePots(state);
    state.winners = determineWinners(state);

    // Distribute winnings
    if (state.winners) {
      for (const winner of state.winners) {
        const player = state.players.find(p => p.id === winner.playerId);
        if (player) {
          player.chips += winner.amount;
        }
      }
    }

    this.emitEvent(this.room.id, 'game:ended', this.sanitizeStateForShowdown(state));

    // Schedule next hand after delay
    setTimeout(() => {
      this.startNextHand();
    }, 5000);
  }

  private startNextHand(): void {
    // Remove players with no chips
    const activePlayers = this.room.players.filter(p => p.chips > 0 || p.isAI);
    if (activePlayers.filter(p => p.chips > 0).length < 2) {
      this.room.status = 'waiting';
      this.emitEvent(this.room.id, 'room:updated', this.room);
      return;
    }

    // Reset for new hand
    this.deck = new Deck();
    const state = this.initializeGameState();
    this.room.gameState = state;

    this.postBlinds(state);
    this.dealHoleCards(state);

    const bbIndex = getBigBlindIndex(state);
    state.currentPlayerIndex = getNextActivePlayerIndex(state, bbIndex);
    if (state.currentPlayerIndex === -1) {
      state.currentPlayerIndex = getNextActivePlayerIndex(state, state.dealerIndex);
    }

    this.emitEvent(this.room.id, 'game:started', this.sanitizeState(state));
    this.scheduleNextAction(state);
  }

  private scheduleNextAction(state: GameState): void {
    this.clearActionTimer();

    const currentPlayer = state.players[state.currentPlayerIndex];
    if (!currentPlayer) return;

    if (currentPlayer.isAI) {
      this.handleAITurn(state, currentPlayer);
    } else {
      // Notify human player it's their turn
      this.emitEvent(this.room.id, 'game:your-turn', {
        playerId: currentPlayer.id,
        timeLimit: ACTION_TIMEOUT,
      });

      // Set timeout for human player
      this.actionTimer = setTimeout(() => {
        this.handlePlayerTimeout(currentPlayer.id);
      }, ACTION_TIMEOUT);
    }
  }

  private async handleAITurn(state: GameState, aiPlayer: Player): Promise<void> {
    const ai = this.aiPlayers.get(aiPlayer.id);
    if (!ai) {
      this.processAction(aiPlayer.id, { type: 'fold' });
      return;
    }

    const action = await ai.makeDecision(state, aiPlayer.id);

    // Validate AI action, fallback to fold if invalid
    if (isValidAction(state, aiPlayer.id, action)) {
      this.processAction(aiPlayer.id, action);
    } else {
      // Try simpler actions as fallback
      const callAmount = state.currentBet - aiPlayer.currentBet;
      if (callAmount === 0) {
        this.processAction(aiPlayer.id, { type: 'check' });
      } else if (aiPlayer.chips >= callAmount) {
        this.processAction(aiPlayer.id, { type: 'call' });
      } else {
        this.processAction(aiPlayer.id, { type: 'fold' });
      }
    }
  }

  private handlePlayerTimeout(playerId: string): void {
    const state = this.room.gameState;
    if (!state) return;

    const currentPlayer = state.players[state.currentPlayerIndex];
    if (!currentPlayer || currentPlayer.id !== playerId) return;

    // Auto-fold on timeout (or check if possible)
    const callAmount = state.currentBet - currentPlayer.currentBet;
    if (callAmount === 0) {
      this.processAction(playerId, { type: 'check' });
    } else {
      this.processAction(playerId, { type: 'fold' });
    }
  }

  private clearActionTimer(): void {
    if (this.actionTimer) {
      clearTimeout(this.actionTimer);
      this.actionTimer = null;
    }
  }

  private sanitizeState(state: GameState): GameState {
    const sanitized = JSON.parse(JSON.stringify(state)) as GameState;
    for (const player of sanitized.players) {
      if (player.isAI) continue;
      // Cards are sent individually per player via socket
    }
    return sanitized;
  }

  private sanitizeStateForShowdown(state: GameState): GameState {
    return JSON.parse(JSON.stringify(state)) as GameState;
  }

  private broadcastState(state: GameState): void {
    this.emitEvent(this.room.id, 'game:state', this.sanitizeState(state));
  }
}
