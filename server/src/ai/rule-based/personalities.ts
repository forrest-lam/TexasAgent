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
    aggressiveness: 0.2,
    bluffFrequency: 0.05,
    foldThreshold: 0.45,
    raiseThreshold: 0.75,
    tightness: 0.8,
    positionAwareness: 0.6,
    potOddsWeight: 0.9,
  },
  aggressive: {
    aggressiveness: 0.75,
    bluffFrequency: 0.25,
    foldThreshold: 0.25,
    raiseThreshold: 0.5,
    tightness: 0.3,
    positionAwareness: 0.7,
    potOddsWeight: 0.4,
  },
  balanced: {
    aggressiveness: 0.5,
    bluffFrequency: 0.12,
    foldThreshold: 0.35,
    raiseThreshold: 0.6,
    tightness: 0.55,
    positionAwareness: 0.75,
    potOddsWeight: 0.7,
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
