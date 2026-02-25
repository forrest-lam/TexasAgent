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
    // In multi-way pots, tighten up — more opponents means need stronger hand
    const multiWayPenalty = context.numActivePlayers > 2
      ? 1 - (context.numActivePlayers - 2) * 0.04 * this.params.tightness
      : 1;
    const adjustedStrength = handStrength * positionMultiplier * Math.max(multiWayPenalty, 0.75);

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
    const callRatio = callAmount / context.playerChips; // what fraction of stack is the call

    // === No bet to call: check or raise ===
    if (callAmount === 0) {
      if (strength >= this.params.raiseThreshold || shouldBluff) {
        const raiseAmount = this.calculateRaiseAmount(strength, context);
        return { type: 'raise', amount: raiseAmount };
      }
      return { type: 'check' };
    }

    // === Must call: fold / call / raise / all-in ===

    // Fold conditions — more willing to fold with weak hands
    if (strength < this.params.foldThreshold && !shouldBluff) {
      // Large bet relative to stack → fold weak hands
      if (callRatio > 0.2) {
        return { type: 'fold' };
      }
      // Negative EV and we respect pot odds → fold
      if (ev < 0 && this.params.potOddsWeight > 0.5) {
        return { type: 'fold' };
      }
      // Even small bets: fold very weak hands (well below threshold)
      if (strength < this.params.foldThreshold * 0.7) {
        return { type: 'fold' };
      }
    }

    // Raise with strong hands or occasional bluff
    if (strength >= this.params.raiseThreshold || (shouldBluff && Math.random() < this.params.aggressiveness)) {
      if (context.playerChips <= callAmount) {
        return { type: 'all-in' };
      }
      const raiseAmount = this.calculateRaiseAmount(strength, context);
      return { type: 'raise', amount: raiseAmount };
    }

    // Facing all-in (call would use entire stack): need a very strong hand
    if (callAmount >= context.playerChips) {
      if (strength >= this.params.raiseThreshold * 0.95) {
        return { type: 'all-in' };
      }
      return { type: 'fold' };
    }

    // Large bet (>30% stack): only call with decent hand
    if (callRatio > 0.3 && strength < this.params.foldThreshold + 0.15) {
      return { type: 'fold' };
    }

    return { type: 'call' };
  }

  private calculateRaiseAmount(strength: number, context: AIDecisionContext): number {
    const minRaise = context.minRaise;
    const maxRaise = context.playerChips + context.playerBet;

    // Base raise: 25%-60% pot depending on hand strength and aggressiveness
    const potPercentage = 0.25 + strength * this.params.aggressiveness * 0.55;
    let raiseAmount = Math.floor(context.pot * potPercentage);

    raiseAmount = Math.max(raiseAmount, minRaise);
    raiseAmount = Math.min(raiseAmount, maxRaise);

    // Cap raise at 40% of stack to avoid over-committing with medium hands
    if (strength < this.params.raiseThreshold + 0.15) {
      raiseAmount = Math.min(raiseAmount, Math.floor(context.playerChips * 0.4));
      raiseAmount = Math.max(raiseAmount, minRaise);
    }

    const jitter = 1 + (Math.random() - 0.5) * 0.1;
    raiseAmount = Math.floor(raiseAmount * jitter);

    return Math.max(raiseAmount, minRaise);
  }
}
