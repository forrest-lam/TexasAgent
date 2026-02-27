/**
 * RuleBotPlayer — a named AI bot backed by a rule-based strategy.
 *
 * - Persistent accounts that appear on the leaderboard.
 * - Each bot has a fixed personality (aggressive / conservative / balanced).
 * - Tracks which room it is currently in (null = available).
 */

import { PlayerAction, AIDecisionContext, RULE_BOT_CONFIGS, RuleBotId, AIPersonality } from '@texas-agent/shared';
import { RuleBasedStrategy } from './rule-based/rule-strategy';

export class RuleBotPlayer {
  readonly botId: RuleBotId;
  readonly name: string;
  readonly personality: AIPersonality;
  readonly emoji: string;

  private strategy: RuleBasedStrategy;
  /** roomId the bot is currently seated in, null = free */
  private currentRoomId: string | null = null;

  constructor(botId: RuleBotId) {
    const cfg = RULE_BOT_CONFIGS.find(c => c.id === botId);
    if (!cfg) throw new Error(`Unknown rule bot id: ${botId}`);

    this.botId = botId;
    this.name = cfg.name;
    this.personality = cfg.personality;
    this.emoji = cfg.emoji;
    this.strategy = new RuleBasedStrategy(cfg.personality);
  }

  get isBusy(): boolean {
    return this.currentRoomId !== null;
  }

  occupyRoom(roomId: string) {
    this.currentRoomId = roomId;
  }

  releaseRoom(roomId: string) {
    if (this.currentRoomId === roomId) {
      this.currentRoomId = null;
    }
  }

  getCurrentRoomId(): string | null {
    return this.currentRoomId;
  }

  async makeDecision(context: AIDecisionContext): Promise<PlayerAction> {
    const action = await this.strategy.decide(context);
    console.log(`[RuleBot:${this.name}] ✅ Decision: ${action.type}${action.type === 'raise' ? ` ${action.amount}` : ''}`);
    return action;
  }
}

/** Singleton registry of all rule-based bots */
class RuleBotRegistry {
  private bots = new Map<RuleBotId, RuleBotPlayer>();

  constructor() {
    for (const cfg of RULE_BOT_CONFIGS) {
      this.bots.set(cfg.id as RuleBotId, new RuleBotPlayer(cfg.id as RuleBotId));
    }
  }

  get(botId: RuleBotId): RuleBotPlayer | undefined {
    return this.bots.get(botId);
  }

  getAll(): RuleBotPlayer[] {
    return Array.from(this.bots.values());
  }

  isValidBotId(id: string): id is RuleBotId {
    return this.bots.has(id as RuleBotId);
  }
}

export const ruleBotRegistry = new RuleBotRegistry();
