import { AIPersonality } from '@texas-agent/shared';

export interface PersonalityParams {
  aggressiveness: number;    // 0-1: how likely to raise vs call
  bluffFrequency: number;    // 0-1: how often to bluff
  foldThreshold: number;     // 0-1: hand strength below which to fold
  raiseThreshold: number;    // 0-1: hand strength above which to raise
  tightness: number;         // 0-1: how selective with starting hands
  positionAwareness: number; // 0-1: how much position matters
  potOddsWeight: number;     // 0-1: how strictly follows pot odds
}

export const PERSONALITIES: Record<AIPersonality, PersonalityParams> = {
  conservative: {
    aggressiveness: 0.1,
    bluffFrequency: 0.02,
    foldThreshold: 0.55,
    raiseThreshold: 0.82,
    tightness: 0.9,
    positionAwareness: 0.6,
    potOddsWeight: 0.95,
  },
  aggressive: {
    aggressiveness: 0.65,
    bluffFrequency: 0.15,
    foldThreshold: 0.32,
    raiseThreshold: 0.55,
    tightness: 0.4,
    positionAwareness: 0.7,
    potOddsWeight: 0.5,
  },
  balanced: {
    aggressiveness: 0.35,
    bluffFrequency: 0.08,
    foldThreshold: 0.44,
    raiseThreshold: 0.65,
    tightness: 0.65,
    positionAwareness: 0.75,
    potOddsWeight: 0.8,
  },
};

export function getPersonalityParams(personality: AIPersonality): PersonalityParams {
  return PERSONALITIES[personality];
}

export const AI_NAMES: Record<AIPersonality, string[]> = {
  conservative: ['Cautious Carl', 'Safe Sally', 'Prudent Pete'],
  aggressive: ['Bold Boris', 'Risky Rita', 'Daring Dave'],
  balanced: ['Smart Sam', 'Clever Claire', 'Wise Walter'],
};

export function getRandomAIName(personality: AIPersonality): string {
  const names = AI_NAMES[personality];
  return names[Math.floor(Math.random() * names.length)];
}
