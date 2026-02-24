import { PlayerAction, AIDecisionContext } from '@texas-agent/shared';
import { AIStrategy } from '../ai-strategy';
import { estimateHandStrength } from './hand-strength';
import { getPersonalityParams, PersonalityParams } from './personalities';
import { calculatePotOdds } from '@texas-agent/shared';

export class RuleBasedStrategy implements AIStrategy {
  private params: PersonalityParams;

  constructor(personality: AIDecisionContext['personality']) {
    this.params = getPersonalityParams(personality);
  }

  getName(): string {
    return 'Rule-Based Engine';
  }

  async decide(context: AIDecisionContext): Promise<PlayerAction> {
    const handStrength = estimateHandStrength(
      context.hand,
      context.communityCards,
      context.numActivePlayers - 1,
      300
    );

    const callAmount = context.currentBet - context.playerBet;
    const potOdds = calculatePotOdds(callAmount, context.pot);

    const positionMultiplier = this.getPositionMultiplier(context.position);
    const adjustedStrength = handStrength * positionMultiplier;

    const ev = this.calculateEV(adjustedStrength, context.pot, callAmount, potOdds);

    return this.selectAction(adjustedStrength, ev, callAmount, context);
  }

  private getPositionMultiplier(position: string): number {
    const multipliers: Record<string, number> = {
      early: 0.9,
      middle: 1.0,
      late: 1.1,
      blinds: 0.95,
    };
    const base = multipliers[position] || 1.0;
    return 1 + (base - 1) * this.params.positionAwareness;
  }

  private calculateEV(
    handStrength: number,
    pot: number,
    callAmount: number,
    potOdds: number
  ): number {
    const winEV = handStrength * (pot + callAmount);
    const loseEV = (1 - handStrength) * callAmount;
    return winEV - loseEV;
  }

  private selectAction(
    strength: number,
    ev: number,
    callAmount: number,
    context: AIDecisionContext
  ): PlayerAction {
    const shouldBluff = Math.random() < this.params.bluffFrequency;

    if (callAmount === 0) {
      if (strength >= this.params.raiseThreshold || shouldBluff) {
        const raiseAmount = this.calculateRaiseAmount(strength, context);
        return { type: 'raise', amount: raiseAmount };
      }
      return { type: 'check' };
    }

    if (strength < this.params.foldThreshold && !shouldBluff) {
      if (callAmount > context.playerChips * 0.3) {
        return { type: 'fold' };
      }
      if (ev < 0 && this.params.potOddsWeight > 0.5) {
        return { type: 'fold' };
      }
    }

    if (strength >= this.params.raiseThreshold || (shouldBluff && Math.random() < this.params.aggressiveness)) {
      if (context.playerChips <= callAmount) {
        return { type: 'all-in' };
      }
      const raiseAmount = this.calculateRaiseAmount(strength, context);
      return { type: 'raise', amount: raiseAmount };
    }

    if (callAmount >= context.playerChips) {
      if (strength >= this.params.foldThreshold + 0.1) {
        return { type: 'all-in' };
      }
      return { type: 'fold' };
    }

    return { type: 'call' };
  }

  private calculateRaiseAmount(strength: number, context: AIDecisionContext): number {
    const minRaise = context.minRaise;
    const maxRaise = context.playerChips + context.playerBet;

    const potPercentage = 0.5 + strength * this.params.aggressiveness;
    let raiseAmount = Math.floor(context.pot * potPercentage);

    raiseAmount = Math.max(raiseAmount, minRaise);
    raiseAmount = Math.min(raiseAmount, maxRaise);

    const jitter = 1 + (Math.random() - 0.5) * 0.1;
    raiseAmount = Math.floor(raiseAmount * jitter);

    return Math.max(raiseAmount, minRaise);
  }
}
