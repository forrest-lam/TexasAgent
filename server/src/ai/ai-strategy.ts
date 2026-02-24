import { PlayerAction, AIDecisionContext, AIPersonality, AIEngineType } from '@texas-agent/shared';

export interface AIStrategy {
  decide(context: AIDecisionContext): Promise<PlayerAction>;
  getName(): string;
}

export interface AIStrategyConfig {
  personality: AIPersonality;
  engineType: AIEngineType;
  llmApiUrl?: string;
  llmApiKey?: string;
  llmModel?: string;
  llmTimeout?: number;
}

export function createAIStrategy(config: AIStrategyConfig): AIStrategy {
  // Dynamic import is handled in ai-player.ts
  // This is the factory interface definition
  throw new Error('Use AIPlayer.create() instead');
}
