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
  /** Timer for the delay between hands (finishHand → startNextHand) */
  private nextHandTimer: ReturnType<typeof setTimeout> | null = null;
  private emitEvent: GameEventCallback;
  private isProcessing = false;
  /** Set to true after cleanup() — all async operations should bail out */
  private destroyed = false;
  /** Queued action from a timeout that arrived while isProcessing was true */
  private pendingTimeoutAction: { playerId: string; action: PlayerAction } | null = null;
  /** Players who timed out this hand — will be kicked before the next hand */
  private timedOutPlayers: Set<string> = new Set();
  /** Players who chose to stand up — will be removed from players list before the next hand */
  private standingPlayers: Set<string> = new Set();
  /** Callback to notify socket-handler to kick a player from the room */
  private onPlayerKick?: (playerId: string) => void;
  /** Callback to notify socket-handler that a player should transition to spectator (stood up) */
  private onPlayerStand?: (playerId: string) => void;
  /** Callback to notify socket-handler the room should be destroyed (only AI left and no spectators) */
  private onRoomEmpty?: () => void;

  constructor(room: Room, emitEvent: GameEventCallback) {
    this.room = room;
    this.emitEvent = emitEvent;
  }

  /** Register a callback that will be called to kick timed-out players from the room */
  setOnPlayerKick(cb: (playerId: string) => void): void {
    this.onPlayerKick = cb;
  }

  /** Register a callback that will be called when only AI players remain in the room */
  setOnRoomEmpty(cb: () => void): void {
    this.onRoomEmpty = cb;
  }

  /** Register a callback to notify a player they have been auto-stood-up (e.g. after timeout) */
  setOnPlayerStand(cb: (playerId: string) => void): void {
    this.onPlayerStand = cb;
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

    // If no one can act (all players all-in from blinds), run out the board directly
    if (state.currentPlayerIndex === -1) {
      console.log(`[startGame] All players all-in after blinds, running out board`);
      this.advanceToNextPhase(state);
    } else {
      this.scheduleNextAction(state);
    }

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
    // Clear any pending timeout action since the player acted manually
    if (this.pendingTimeoutAction?.playerId === playerId) {
      this.pendingTimeoutAction = null;
    }
    this.processAction(playerId, action);
  }

  /** Handle a human player leaving mid-game: mark them as folded & inactive */
  handlePlayerLeave(playerId: string): void {
    const state = this.room.gameState;
    if (!state || state.phase === 'waiting' || state.phase === 'showdown') return;

    const player = state.players.find(p => p.id === playerId);
    if (!player || player.isFolded || !player.isActive) return;

    // Mark player as folded and inactive
    player.isFolded = true;
    player.isActive = false;

    // If it was this player's turn, clear the timer and advance the game
    const currentPlayer = state.players[state.currentPlayerIndex];
    if (currentPlayer && currentPlayer.id === playerId) {
      this.clearActionTimer();
      // Broadcast the fold action
      this.emitEvent(this.room.id, 'game:action', { playerId, action: { type: 'fold' } });

      // Check if only one player remains
      const inHand = getPlayersInHand(state);
      if (inHand.length <= 1) {
        this.finishHand(state);
      } else {
        // Move to next player
        state.currentPlayerIndex = getNextActivePlayerIndex(state, state.currentPlayerIndex);
        if (state.currentPlayerIndex === -1) {
          this.finishHand(state);
        } else {
          this.broadcastState(state);
          this.scheduleNextAction(state);
        }
      }
    } else {
      // Not their turn — just broadcast updated state
      this.emitEvent(this.room.id, 'game:action', { playerId, action: { type: 'fold' } });

      // Check if only one player remains after the fold
      const inHand = getPlayersInHand(state);
      if (inHand.length <= 1) {
        this.clearActionTimer();
        this.finishHand(state);
      } else {
        this.broadcastState(state);
      }
    }
  }

  cleanup(): void {
    this.destroyed = true;
    this.clearActionTimer();
    if (this.nextHandTimer) {
      clearTimeout(this.nextHandTimer);
      this.nextHandTimer = null;
    }
    this.pendingTimeoutAction = null;
    this.aiPlayers.clear();
  }

  /** Mark a player as standing up — they will be removed before the next hand */
  handlePlayerStand(playerId: string): void {
    this.standingPlayers.add(playerId);
  }

  /** Cancel standing/timeout for a reconnected player (check both old and new socket IDs) */
  cancelPlayerStand(newId: string, oldId: string): void {
    this.standingPlayers.delete(newId);
    this.standingPlayers.delete(oldId);
    this.timedOutPlayers.delete(newId);
    this.timedOutPlayers.delete(oldId);
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
        player.cards = [];
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
    if (this.destroyed) return;
    if (this.isProcessing) {
      // Queue timeout folds so they are not silently dropped
      console.log(`[processAction] Blocked by isProcessing, queuing ${action.type} for ${playerId}`);
      if (this.pendingTimeoutAction && this.pendingTimeoutAction.playerId === playerId) {
        return; // already queued
      }
      this.pendingTimeoutAction = { playerId, action };
      return;
    }
    this.isProcessing = true;

    try {
      const state = this.room.gameState!;
      const prevCurrentBet = state.currentBet;
      const newState = applyAction(state, playerId, action);
      Object.assign(state, newState);

      // Track that this player has acted in the current betting round
      if (!state.actedThisRound) state.actedThisRound = [];
      if (action.type === 'raise') {
        // A raise re-opens action — only the raiser has acted
        state.actedThisRound = [playerId];
      } else if (action.type === 'all-in' && state.currentBet > prevCurrentBet) {
        // All-in that raises the bet re-opens action
        state.actedThisRound = [playerId];
      } else {
        if (!state.actedThisRound.includes(playerId)) {
          state.actedThisRound.push(playerId);
        }
      }

      // Broadcast the action
      this.emitEvent(this.room.id, 'game:action', { playerId, action });

      // Check if only one player remains
      const inHand = getPlayersInHand(state);
      if (inHand.length <= 1) {
        this.finishHand(state);
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
    } catch (err) {
      console.error(`[processAction] Error processing ${action.type} for ${playerId}:`, err);
    } finally {
      this.isProcessing = false;
      this.processPendingAction();
    }
  }

  /** Process any action that was queued while isProcessing was true */
  private processPendingAction(): void {
    if (this.pendingTimeoutAction) {
      const { playerId, action } = this.pendingTimeoutAction;
      this.pendingTimeoutAction = null;
      // Verify it's still this player's turn
      const state = this.room.gameState;
      if (state) {
        const current = state.players[state.currentPlayerIndex];
        if (current && current.id === playerId) {
          this.processAction(playerId, action);
        }
      }
    }
  }

  private isBettingRoundComplete(state: GameState): boolean {
    const inHand = getPlayersInHand(state);
    const canAct = inHand.filter(p => !p.isAllIn);

    if (canAct.length === 0) return true;
    if (canAct.length === 1 && canAct[0].currentBet >= state.currentBet) {
      // The lone player must have acted at least once
      return (state.actedThisRound || []).includes(canAct[0].id);
    }

    // All players who can act have matched the current bet AND have acted this round
    const allMatched = canAct.every(p => p.currentBet === state.currentBet);
    if (!allMatched) return false;
    const allActed = canAct.every(p => (state.actedThisRound || []).includes(p.id));
    return allActed;
  }

  private async advanceToNextPhase(state: GameState): Promise<void> {
    try {
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
    } catch (err) {
      console.error('[advanceToNextPhase] Error:', err);
      // Emergency: finish hand to prevent stuck game
      this.finishHand(state);
    }
  }

  private async runOutBoard(state: GameState): Promise<void> {
    // Deal remaining community cards
    while (state.communityCards.length < 5) {
      if (this.destroyed) return;
      const count = state.phase === 'preflop' ? 3 :
                    state.communityCards.length < 3 ? 3 - state.communityCards.length : 1;
      this.dealCommunityCards(state, Math.min(count, 5 - state.communityCards.length));

      if (state.communityCards.length === 3) state.phase = 'flop';
      else if (state.communityCards.length === 4) state.phase = 'turn';
      else if (state.communityCards.length === 5) state.phase = 'river';

      this.broadcastState(state);
      await new Promise(resolve => setTimeout(resolve, 800));
      if (this.destroyed) return;
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

    // Sync updated chips back to room.players so the next hand starts with correct values
    for (const gp of state.players) {
      const rp = this.room.players.find(p => p.id === gp.id);
      if (rp) {
        rp.chips = gp.chips;
      }
    }

    this.emitEvent(this.room.id, 'game:ended', null);

    // Schedule next hand after delay
    this.nextHandTimer = setTimeout(() => {
      this.nextHandTimer = null;
      this.startNextHand();
    }, 5000);
  }

  private startNextHand(): void {
    // Bail out if controller has been destroyed
    if (this.destroyed) return;

    // FIRST: merge pending players so we can cancel any standing/timeout for re-seated players
    if (this.room.pendingPlayers && this.room.pendingPlayers.length > 0) {
      for (const pending of this.room.pendingPlayers) {
        // If a player re-sat after standing/timing out, cancel the stand/kick
        this.standingPlayers.delete(pending.id);
        this.timedOutPlayers.delete(pending.id);
        this.room.players.push(pending);
      }
      this.room.pendingPlayers = [];
      // Remove merged players from spectators list
      if (this.room.spectators) {
        const playerIds = new Set(this.room.players.map(p => p.id));
        this.room.spectators = this.room.spectators.filter(s => !playerIds.has(s.id));
      }
      this.emitEvent(this.room.id, 'room:updated', this.room);
    }

    // Kick timed-out players (only those who did NOT re-sit)
    if (this.timedOutPlayers.size > 0) {
      for (const playerId of this.timedOutPlayers) {
        const idx = this.room.players.findIndex(p => p.id === playerId);
        if (idx !== -1) {
          this.room.players.splice(idx, 1);
        }
        if (this.onPlayerKick) {
          this.onPlayerKick(playerId);
        }
      }
      this.timedOutPlayers.clear();
      this.emitEvent(this.room.id, 'room:updated', this.room);
    }

    // Remove standing players (those who chose to stand up and did NOT re-sit)
    if (this.standingPlayers.size > 0) {
      if (!this.room.spectators) this.room.spectators = [];
      for (const playerId of this.standingPlayers) {
        const idx = this.room.players.findIndex(p => p.id === playerId);
        if (idx !== -1) {
          const player = this.room.players[idx];
          // Add to spectators list if human
          if (!player.isAI && !this.room.spectators.find(s => s.id === player.id)) {
            this.room.spectators.push({ id: player.id, name: player.name });
          }
          this.room.players.splice(idx, 1);
        }
      }
      this.standingPlayers.clear();
      this.emitEvent(this.room.id, 'room:updated', this.room);
    }

    // Remove players with no chips
    const activePlayers = this.room.players.filter(p => p.chips > 0 || p.isAI);

    // Check if only AI players remain — if so, set room to waiting and notify
    const humanPlayers = this.room.players.filter(p => !p.isAI);
    if (humanPlayers.length === 0) {
      console.log(`[startNextHand] No human players left in room ${this.room.id}, triggering onRoomEmpty`);
      this.room.status = 'waiting';
      this.emitEvent(this.room.id, 'room:updated', this.room);
      if (this.onRoomEmpty) {
        this.onRoomEmpty();
      }
      return;
    }

    // Actually remove busted players from the room
    this.room.players = activePlayers;

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

    // If no one can act (all players all-in from blinds), run out the board directly
    if (state.currentPlayerIndex === -1) {
      console.log(`[startNextHand] All players all-in after blinds, running out board`);
      this.advanceToNextPhase(state);
    } else {
      this.scheduleNextAction(state);
    }
  }

  private scheduleNextAction(state: GameState): void {
    if (this.destroyed) return;
    this.clearActionTimer();

    const currentPlayer = state.players[state.currentPlayerIndex];
    if (!currentPlayer) {
      // No one can act (e.g. all players are all-in after posting blinds)
      // Advance to next phase / run out the board
      console.log(`[scheduleNextAction] No actionable player (currentPlayerIndex=${state.currentPlayerIndex}), advancing phase`);
      this.advanceToNextPhase(state);
      return;
    }

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
    if (this.destroyed) return;
    const ai = this.aiPlayers.get(aiPlayer.id);
    if (!ai) {
      this.processAction(aiPlayer.id, { type: 'fold' });
      return;
    }

    try {
      const action = await ai.makeDecision(state, aiPlayer.id);
      // Re-check after async: room may have been destroyed during AI think time
      if (this.destroyed) return;

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
    } catch (err) {
      console.error(`[AI] Error during AI decision for ${aiPlayer.id}:`, err);
      if (this.destroyed) return;
      // Fallback: fold on error to prevent game from getting stuck
      const callAmount = state.currentBet - aiPlayer.currentBet;
      if (callAmount === 0) {
        this.processAction(aiPlayer.id, { type: 'check' });
      } else {
        this.processAction(aiPlayer.id, { type: 'fold' });
      }
    }
  }

  private handlePlayerTimeout(playerId: string): void {
    const state = this.room.gameState;
    if (!state) {
      console.warn(`[Timeout] No game state for player ${playerId}`);
      return;
    }

    const currentPlayer = state.players[state.currentPlayerIndex];
    if (!currentPlayer || currentPlayer.id !== playerId) {
      console.warn(`[Timeout] Not ${playerId}'s turn (current: ${currentPlayer?.id})`);
      return;
    }

    console.log(`[Timeout] Player ${playerId} timed out, isProcessing=${this.isProcessing}`);

    // Auto-fold on timeout AND auto-stand (player becomes spectator next hand)
    const callAmount = state.currentBet - currentPlayer.currentBet;
    const action: PlayerAction = callAmount === 0 ? { type: 'check' } : { type: 'fold' };

    // Mark as standing so the player will be removed before the next hand
    this.standingPlayers.add(playerId);
    // Notify client so they transition to spectator UI
    if (this.onPlayerStand) {
      this.onPlayerStand(playerId);
    }

    if (this.isProcessing) {
      // Force-queue the timeout action — it MUST be processed
      console.log(`[Timeout] Queuing action for ${playerId}: ${action.type}`);
      this.pendingTimeoutAction = { playerId, action };
    } else {
      this.processAction(playerId, action);
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

  /**
   * For a real showdown (multiple players), all non-folded cards are revealed.
   * For an early win (Last Standing), only each player sees their own cards.
   */
  getSanitizedStateForShowdown(playerId: string): GameState | undefined {
    const state = this.room.gameState;
    if (!state) return undefined;

    const sanitized = JSON.parse(JSON.stringify(state)) as GameState;
    const isEarlyWin = sanitized.winners?.length === 1
      && sanitized.winners[0].handName === 'Last Standing';

    if (isEarlyWin) {
      // Early win: hide everyone's cards except the requesting player's own
      for (const player of sanitized.players) {
        if (player.id !== playerId) {
          player.cards = [];
        }
      }
    }
    // Real showdown: all non-folded players' cards are visible (no hiding needed)
    return sanitized;
  }

  private broadcastState(state: GameState): void {
    this.emitEvent(this.room.id, 'game:state', this.sanitizeState(state));
  }
}
