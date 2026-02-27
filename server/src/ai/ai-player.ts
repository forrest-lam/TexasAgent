import { PlayerAction, AIDecisionContext, AIPersonality, AIEngineType, GameState, Player } from '@texas-agent/shared';
import { delay, randomBetween } from '@texas-agent/shared';
import { AI_THINK_DELAY_MIN, AI_THINK_DELAY_MAX } from '@texas-agent/shared';
import { AIStrategy } from './ai-strategy';
import { RuleBasedStrategy } from './rule-based/rule-strategy';
import { LLMStrategy } from './llm/llm-strategy';

export class AIPlayer {
  private strategy: AIStrategy;
  private personality: AIPersonality;
  private engineType: AIEngineType;

  constructor(personality: AIPersonality, engineType: AIEngineType = 'rule-based') {
    this.personality = personality;
    this.engineType = engineType;

    if (engineType === 'llm') {
      this.strategy = new LLMStrategy(personality);
    } else {
      this.strategy = new RuleBasedStrategy(personality);
    }
  }

  getEngineName(): string {
    return this.strategy.getName();
  }

  async makeDecision(state: GameState, playerId: string): Promise<PlayerAction> {
    const player = state.players.find(p => p.id === playerId);
    if (!player) return { type: 'fold' };

    const context = this.buildContext(state, player);

    const thinkDelay = randomBetween(AI_THINK_DELAY_MIN, AI_THINK_DELAY_MAX);
    await delay(thinkDelay);

    const action = await this.strategy.decide(context);
    return action;
  }

  private buildContext(state: GameState, player: Player): AIDecisionContext {
    const activePlayers = state.players.filter(p => !p.isFolded && p.isActive);
    const position = this.calculatePosition(state, player);

    return {
      playerId: player.id,
      hand: player.cards,
      communityCards: state.communityCards,
      pot: state.pot,
      currentBet: state.currentBet,
      playerBet: player.currentBet,
      playerChips: player.chips,
      minRaise: state.minRaise,
      bigBlind: state.bigBlind,
      phase: state.phase,
      numActivePlayers: activePlayers.length,
      position,
      personality: this.personality,
      players: state.players.map(p => ({
        id: p.id,
        name: p.name,
        chips: p.chips,
        currentBet: p.currentBet,
        isFolded: p.isFolded,
        isAllIn: p.isAllIn,
        isAI: p.isAI,
      })),
    };
  }

  private calculatePosition(state: GameState, player: Player): 'early' | 'middle' | 'late' | 'blinds' {
    const activePlayers = state.players.filter(p => p.isActive && !p.isFolded);
    const n = activePlayers.length;
    const dealerIdx = activePlayers.findIndex(p => p.id === state.players[state.dealerIndex]?.id);
    const myIdx = activePlayers.findIndex(p => p.id === player.id);

    if (myIdx === -1 || dealerIdx === -1) return 'middle';

    const relativePos = (myIdx - dealerIdx + n) % n;

    if (relativePos <= 1 && n > 2) return 'blinds';
    if (relativePos <= Math.ceil(n / 3)) return 'early';
    if (relativePos <= Math.ceil((2 * n) / 3)) return 'middle';
    return 'late';
  }
}
