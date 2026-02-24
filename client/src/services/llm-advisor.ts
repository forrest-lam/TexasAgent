/**
 * LLM Advisor Service (Enhanced)
 * Connects to OpenAI-compatible APIs to provide poker strategy advice.
 * Now includes rich player profiling data and exploit-oriented prompting.
 */

import { GameState, Card } from '@texas-agent/shared';
import { getProfileSummaryForLLM } from './player-memory';
import { useAuthStore } from '../stores/auth-store';

// Fallback to env vars if user hasn't configured their own
function getLLMConfig() {
  const user = useAuthStore.getState().user;
  const token = useAuthStore.getState().token;
  // If user has configured LLM on server, fetch the full key from their profile
  // For now, use env vars as fallback; user-specific config loaded at runtime
  const envKey = import.meta.env.VITE_LLM_API_KEY as string || '';
  const envUrl = (import.meta.env.VITE_LLM_API_BASE_URL as string || 'https://api.openai.com/v1').replace(/\/$/, '');
  const envModel = import.meta.env.VITE_LLM_MODEL as string || 'gpt-4o-mini';
  return {
    apiKey: (window as any).__userLLMApiKey || envKey,
    apiBaseUrl: user?.llmConfig?.apiBaseUrl || envUrl,
    model: user?.llmConfig?.model || envModel,
    token,
  };
}

export function isLLMConfigured(): boolean {
  const { apiKey } = getLLMConfig();
  const user = useAuthStore.getState().user;
  return !!apiKey || !!user?.llmConfig?.hasApiKey;
}

// Load the user's full API key from server (called once when advisor is used)
export async function loadUserLLMKey(): Promise<void> {
  const { token } = getLLMConfig();
  if (!token || (window as any).__userLLMApiKey) return;
  try {
    const API_BASE = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';
    const res = await fetch(`${API_BASE}/api/user/llm-config/full`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      if (data.apiKey) (window as any).__userLLMApiKey = data.apiKey;
    }
  } catch {}
}

function cardToString(card: Card): string {
  const suitMap: Record<string, string> = {
    hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠',
  };
  return `${card.rank}${suitMap[card.suit] || card.suit}`;
}

function getPositionLabel(myIndex: number, dealerIndex: number, totalActive: number): string {
  const relPos = (myIndex - dealerIndex + totalActive) % totalActive;
  if (relPos === 0) return 'Dealer (BTN)';
  if (relPos === 1) return 'Small Blind (SB)';
  if (relPos === 2) return 'Big Blind (BB)';
  if (relPos <= totalActive * 0.4) return 'Early Position (EP)';
  if (relPos <= totalActive * 0.7) return 'Middle Position (MP)';
  return 'Late Position (LP)';
}

function buildPrompt(state: GameState, myPlayerId: string): string {
  const me = state.players.find(p => p.id === myPlayerId);
  if (!me) return '';

  const myCards = me.cards.map(cardToString).join(' ');
  const community = state.communityCards.map(cardToString).join(' ') || 'None';
  const callAmount = state.currentBet - me.currentBet;
  const potOdds = callAmount > 0 ? (callAmount / (state.pot + callAmount) * 100).toFixed(1) : '0';

  // Position info
  const activePlayers = state.players.filter(p => p.isActive && !p.isFolded);
  const myIdx = state.players.findIndex(p => p.id === myPlayerId);
  const position = getPositionLabel(myIdx, state.dealerIndex || 0, activePlayers.length);

  // Build opponents info with more detail
  const opponents = state.players
    .filter(p => p.id !== myPlayerId && !p.isFolded && p.isActive)
    .map(p => {
      const parts = [`${p.name}: chips=$${p.chips}, bet=$${p.currentBet}`];
      if (p.isAllIn) parts.push('(ALL-IN)');
      const stackToPot = state.pot > 0 ? (p.chips / state.pot).toFixed(1) : '∞';
      parts.push(`stack/pot=${stackToPot}`);
      return parts.join(' ');
    }).join('\n  ');

  const playersInHand = state.players.filter(p => !p.isFolded && p.isActive).length;
  const stackToPot = state.pot > 0 ? (me.chips / state.pot).toFixed(1) : '∞';

  // Rich player behavioral data
  const playerMemory = getProfileSummaryForLLM(myPlayerId);

  return `## Current Hand State
- **Phase**: ${state.phase}
- **My Cards**: ${myCards}
- **Community Cards**: ${community}
- **My Position**: ${position}
- **My Chips**: $${me.chips} (stack/pot ratio: ${stackToPot})
- **My Current Bet**: $${me.currentBet}
- **Pot Size**: $${state.pot}
- **Current Bet to Match**: $${state.currentBet}
- **Call Amount Needed**: $${callAmount} (pot odds: ${potOdds}%)
- **Min Raise To**: $${state.minRaise}
- **Big Blind**: $${state.bigBlind}
- **Players in Hand**: ${playersInHand}

## Opponents Still in Hand
  ${opponents}

## Player Behavioral Profiles (from tracked history)
${playerMemory}

## Your Analysis Task
Based on ALL the above information, especially the opponent profiles and exploit tips:

1. **Hand Strength**: Evaluate my hand considering community cards, draws, and outs
2. **Pot Odds vs Equity**: Is calling/raising mathematically profitable?
3. **Opponent Exploitation**: How should I specifically exploit each opponent's known weaknesses?
4. **Position Advantage**: How does my position affect the optimal play?
5. **Recommended Action**: **FOLD**, **CHECK**, **CALL**, **RAISE $X**, or **ALL-IN**
6. **Confidence**: How confident are you (low/medium/high)?

IMPORTANT GUIDELINES:
- Do NOT default to conservative play. Be aggressive when the math and reads support it.
- If opponents have high fold-to-bet rates, recommend bluffs and semi-bluffs.
- If opponents are passive, recommend thin value bets.
- If you have position advantage, lean toward aggression.
- Consider stack-to-pot ratio when sizing bets.

Format:
**Recommendation**: [ACTION]
**Confidence**: [low/medium/high]
**Reason**: [2-3 sentences explaining WHY, referencing specific opponent tendencies]`;
}

const SYSTEM_PROMPT = `You are an elite Texas Hold'em poker strategist — not a cautious advisor, but an aggressive, exploitative player who maximizes EV.

KEY PRINCIPLES:
1. **Exploit opponent weaknesses ruthlessly**: If data shows a player folds too much, bluff them. If they call too much, value-bet thinner. If they're passive, steal pots.
2. **Position is power**: In late position, widen your aggression range significantly.
3. **Aggression wins**: Betting and raising have TWO ways to win (opponent folds OR you have the best hand). Calling only wins one way.
4. **Don't be results-oriented**: A good bluff that gets called is still a correct play if the math supports it.
5. **Adapt to the table**: If everyone is tight, steal more. If the table is loose, tighten up and value-bet hard.

You give CONCISE, ACTIONABLE advice. Always respond in the user's language (if Chinese context detected, respond in Chinese).`;

export async function getAdvice(state: GameState, myPlayerId: string): Promise<string> {
  // Ensure user LLM key is loaded from server
  await loadUserLLMKey();

  const { apiKey, apiBaseUrl, model } = getLLMConfig();

  if (!apiKey) {
    throw new Error('API Key not configured');
  }

  const prompt = buildPrompt(state, myPlayerId);
  if (!prompt) throw new Error('Cannot build prompt');

  const response = await fetch(`${apiBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      max_tokens: 500,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => 'Unknown error');
    throw new Error(`API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || 'No response';
}
