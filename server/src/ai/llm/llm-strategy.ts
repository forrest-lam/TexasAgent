import { PlayerAction, AIDecisionContext, ActionType } from '@texas-agent/shared';
import { AIStrategy } from '../ai-strategy';
import { RuleBasedStrategy } from '../rule-based/rule-strategy';
import { buildDecisionPrompt, parseDecisionResponse } from './prompt-builder';

export interface LLMConfig {
  apiUrl: string;
  apiKey: string;
  model: string;
  timeout: number;
}

const DEFAULT_CONFIG: LLMConfig = {
  apiUrl: process.env.LLM_API_URL || 'https://api.openai.com/v1/chat/completions',
  apiKey: process.env.LLM_API_KEY || '',
  model: process.env.LLM_MODEL || 'gpt-4o-mini',
  timeout: Number(process.env.LLM_TIMEOUT) || 10000,
};

export class LLMStrategy implements AIStrategy {
  private config: LLMConfig;
  private fallback: RuleBasedStrategy;

  constructor(personality: AIDecisionContext['personality'], config?: Partial<LLMConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.fallback = new RuleBasedStrategy(personality);
  }

  getName(): string {
    return `LLM Engine (${this.config.model})`;
  }

  async decide(context: AIDecisionContext): Promise<PlayerAction> {
    if (!this.config.apiKey) {
      console.error('LLM API key not configured, falling back to rule-based engine');
      return this.fallback.decide(context);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    const prompt = buildDecisionPrompt(context);

    const response = await fetch(this.config.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: [
          {
            role: 'system',
            content: 'You are an expert Texas Hold\'em poker AI. Respond only with valid JSON.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 200,
      }),
      signal: controller.signal,
    }).catch(err => {
      console.error('LLM API call failed:', err.message);
      return null;
    });

    clearTimeout(timeoutId);

    if (!response || !response.ok) {
      console.error('LLM API error, falling back to rule-based engine');
      return this.fallback.decide(context);
    }

    const data: any = await response.json().catch(() => null);
    if (!data?.choices?.[0]?.message?.content) {
      console.error('LLM response parse error, falling back');
      return this.fallback.decide(context);
    }

    const content: string = data.choices[0].message.content;
    const decision = parseDecisionResponse(content);

    if (!decision) {
      console.error('Could not parse LLM decision, falling back');
      return this.fallback.decide(context);
    }

    const validAction = this.validateAndNormalize(decision, context);
    return validAction;
  }

  private validateAndNormalize(
    decision: { type: string; amount?: number },
    context: AIDecisionContext
  ): PlayerAction {
    const callAmount = context.currentBet - context.playerBet;
    const type = decision.type as ActionType;

    switch (type) {
      case 'fold':
        return { type: 'fold' };
      case 'check':
        if (callAmount === 0) return { type: 'check' };
        return { type: 'fold' };
      case 'call':
        if (callAmount <= context.playerChips) return { type: 'call' };
        return { type: 'all-in' };
      case 'raise': {
        let amount = decision.amount || context.minRaise;
        amount = Math.max(amount, context.minRaise);
        const maxAmount = context.playerChips + context.playerBet;
        if (amount >= maxAmount) return { type: 'all-in' };
        return { type: 'raise', amount };
      }
      case 'all-in':
        return { type: 'all-in' };
      default:
        return callAmount === 0 ? { type: 'check' } : { type: 'fold' };
    }
  }
}
