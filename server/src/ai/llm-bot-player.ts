/**
 * LLMBotPlayer — a named AI bot backed by a real LLM.
 *
 * - Each bot has its own API key (from env), model, and base URL.
 * - Timeout: 50 seconds. On timeout or parse error → fallback to rule-based.
 * - Tracks which room it is currently in (null = available).
 */

import { PlayerAction, AIDecisionContext, LLM_BOT_CONFIGS, LLMBotId, AIPersonality } from '@texas-agent/shared';
import { AIStrategy } from './ai-strategy';
import { RuleBasedStrategy } from './rule-based/rule-strategy';
import { buildDecisionPrompt, parseDecisionResponse, getSystemMessage, getTemperature } from './llm/prompt-builder';

const LLM_BOT_TIMEOUT_MS = 50_000;

/** Map botId → env var suffix for per-bot overrides */
const BOT_ENV_SUFFIX: Record<string, string> = {
  'llm-bot-deepseek': 'DEEPSEEK',
  'llm-bot-kimi': 'KIMI',
  'llm-bot-minimax': 'MINIMAX',
  'llm-bot-qwen': 'QWEN',  'llm-bot-glm': 'GLM',,
};

export class LLMBotPlayer {
  readonly botId: LLMBotId;
  readonly name: string;
  readonly model: string;
  readonly apiBaseUrl: string;
  readonly personality: AIPersonality;
  readonly emoji: string;

  private fallback: RuleBasedStrategy;
  /** roomId the bot is currently seated in, null = free */
  private currentRoomId: string | null = null;

  constructor(botId: LLMBotId) {
    const cfg = LLM_BOT_CONFIGS.find(c => c.id === botId);
    if (!cfg) throw new Error(`Unknown LLM bot id: ${botId}`);

    const suffix = BOT_ENV_SUFFIX[botId] ?? '';
    this.botId = botId;
    this.name = cfg.name;
    this.model = (suffix && process.env[`LLM_MODEL_${suffix}`]) || cfg.model;
    this.apiBaseUrl = (suffix && process.env[`LLM_API_BASE_URL_${suffix}`]) || process.env.LLM_API_BASE_URL || cfg.apiBaseUrl;
    this.personality = cfg.personality;
    this.emoji = cfg.emoji;
    this.fallback = new RuleBasedStrategy(cfg.personality);
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

  private getApiKey(): string {
    const suffix = BOT_ENV_SUFFIX[this.botId] ?? '';
    const perBotKey = suffix ? process.env[`${suffix}_API_KEY`] : '';
    return perBotKey || process.env.LLM_API_KEY || '';
  }

  async makeDecision(context: AIDecisionContext): Promise<PlayerAction> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      console.warn(`[LLMBot:${this.name}] No API key configured, using fallback`);
      const fallbackResult = await this.fallback.decide(context);
      console.log(`[LLMBot:${this.name}] ⚠️ Fallback decision: ${fallbackResult.type}${fallbackResult.type === 'raise' ? ` ${fallbackResult.amount}` : ''}`);
      return fallbackResult;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
      console.warn(`[LLMBot:${this.name}] Request timed out after ${LLM_BOT_TIMEOUT_MS / 1000}s, using fallback`);
    }, LLM_BOT_TIMEOUT_MS);

    try {
      const prompt = buildDecisionPrompt(context);

      const response = await fetch(`${this.apiBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: 'system',
              content: getSystemMessage(this.personality),
            },
            { role: 'user', content: prompt },
          ],
          temperature: getTemperature(this.personality),
          max_tokens: 300,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.error(`[LLMBot:${this.name}] API error ${response.status}, using fallback`);
        const fallbackResult = await this.fallback.decide(context);
        console.log(`[LLMBot:${this.name}] ⚠️ Fallback decision: ${fallbackResult.type}${fallbackResult.type === 'raise' ? ` ${fallbackResult.amount}` : ''}`);
        return fallbackResult;
      }

      const data: any = await response.json().catch(() => null);
      const content: string | undefined = data?.choices?.[0]?.message?.content;

      if (!content) {
        console.error(`[LLMBot:${this.name}] Empty response, using fallback`);
        const fallbackResult = await this.fallback.decide(context);
        console.log(`[LLMBot:${this.name}] ⚠️ Fallback decision: ${fallbackResult.type}${fallbackResult.type === 'raise' ? ` ${fallbackResult.amount}` : ''}`);
        return fallbackResult;
      }

      const decision = parseDecisionResponse(content);
      if (!decision) {
        console.error(`[LLMBot:${this.name}] Could not parse decision from: ${content.slice(0, 100)}, using fallback`);
        const fallbackResult = await this.fallback.decide(context);
        console.log(`[LLMBot:${this.name}] ⚠️ Fallback decision: ${fallbackResult.type}${fallbackResult.type === 'raise' ? ` ${fallbackResult.amount}` : ''}`);
        return fallbackResult;
      }

      const result = this.validateAndNormalize(decision, context);
      const reasonStr = decision.reasoning ? ` | Reason: ${decision.reasoning}` : '';
      console.log(`[LLMBot:${this.name}] ✅ LLM decision: ${result.type}${result.type === 'raise' ? ` ${result.amount}` : ''}${reasonStr}`);
      return result;

    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err?.name === 'AbortError') {
        // timeout already logged
      } else {
        console.error(`[LLMBot:${this.name}] Unexpected error: ${err?.message}, using fallback`);
      }
      const fallbackResult = await this.fallback.decide(context);
      console.log(`[LLMBot:${this.name}] ⚠️ Fallback decision: ${fallbackResult.type}${fallbackResult.type === 'raise' ? ` ${fallbackResult.amount}` : ''}`);
      return fallbackResult;
    }
  }

  private validateAndNormalize(
    decision: { type: string; amount?: number },
    context: AIDecisionContext,
  ): PlayerAction {
    const callAmount = context.currentBet - context.playerBet;

    switch (decision.type) {
      case 'fold': return { type: 'fold' };
      case 'check':
        return callAmount === 0 ? { type: 'check' } : { type: 'fold' };
      case 'call':
        return callAmount <= context.playerChips ? { type: 'call' } : { type: 'all-in' };
      case 'raise': {
        const amount = Math.max(decision.amount ?? context.minRaise, context.minRaise);
        const max = context.playerChips + context.playerBet;
        if (amount >= max) return { type: 'all-in' };
        return { type: 'raise', amount };
      }
      case 'all-in': return { type: 'all-in' };
      default:
        return callAmount === 0 ? { type: 'check' } : { type: 'fold' };
    }
  }
}

/** Singleton registry of all LLM bots */
class LLMBotRegistry {
  private bots = new Map<LLMBotId, LLMBotPlayer>();

  constructor() {
    for (const cfg of LLM_BOT_CONFIGS) {
      this.bots.set(cfg.id as LLMBotId, new LLMBotPlayer(cfg.id as LLMBotId));
    }
  }

  get(botId: LLMBotId): LLMBotPlayer | undefined {
    return this.bots.get(botId);
  }

  getAll(): LLMBotPlayer[] {
    return Array.from(this.bots.values());
  }

  isValidBotId(id: string): id is LLMBotId {
    return this.bots.has(id as LLMBotId);
  }
}

export const llmBotRegistry = new LLMBotRegistry();
