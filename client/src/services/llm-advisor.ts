/**
 * LLM Advisor Service (Enhanced)
 * Connects to OpenAI-compatible APIs to provide poker strategy advice.
 * Now includes rich player profiling data and exploit-oriented prompting.
 */

import { GameState, Card, evaluateHand } from '@texas-agent/shared';
import { getProfileSummaryForLLM } from './player-memory';
import { useAuthStore } from '../stores/auth-store';
import { useI18n } from '../i18n';
import type { HandAction } from '../stores/game-store';

function getAuthToken(): string {
  return useAuthStore.getState().token || '';
}

/**
 * Whether LLM advisor might be available.
 * Since API key can be configured on the server side (env var),
 * we can't fully know on the client — so we always return true
 * as long as the user is authenticated, and let the server
 * return an error if no key is actually configured.
 */
export function isLLMConfigured(): boolean {
  return !!getAuthToken();
}

export function hasLLMApiKey(): boolean {
  return !!getAuthToken();
}

// No-op: kept for backward compatibility with callers
export async function loadUserLLMKey(): Promise<void> {}

function cardToString(card: Card): string {
  const suitMap: Record<string, string> = {
    hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠',
  };
  return `${card.rank}${suitMap[card.suit] || card.suit}`;
}

function getPositionLabel(me: { isDealer?: boolean; isSmallBlind?: boolean; isBigBlind?: boolean }, myIndex: number, dealerIndex: number, totalPlayers: number): string {
  // Prefer authoritative flags set by the server
  if (me.isBigBlind) return 'Big Blind (BB)';
  if (me.isSmallBlind) return 'Small Blind (SB)';
  if (me.isDealer) return 'Dealer (BTN)';

  // Fallback: compute relative position using the full players array size
  const relPos = (myIndex - dealerIndex + totalPlayers) % totalPlayers;
  if (relPos === 0) return 'Dealer (BTN)';
  if (relPos === 1) return 'Small Blind (SB)';
  if (relPos === 2) return 'Big Blind (BB)';
  if (relPos <= totalPlayers * 0.4) return 'Early Position (EP)';
  if (relPos <= totalPlayers * 0.7) return 'Middle Position (MP)';
  return 'Late Position (LP)';
}

const RANK_VAL: Record<string, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
  '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
};

/** Analyze hand strength and draws, return a human-readable summary */
function analyzeHandStrength(holeCards: Card[], communityCards: Card[], locale: string): string {
  const lines: string[] = [];

  if (communityCards.length >= 3) {
    // Evaluate current made hand
    const eval_ = evaluateHand(holeCards, communityCards);
    const bestCardsStr = eval_.bestCards.map(cardToString).join(' ');
    if (locale === 'zh') {
      lines.push(`**已成牌**: ${eval_.rankName}（最佳组合: ${bestCardsStr}）`);
    } else {
      lines.push(`**Made Hand**: ${eval_.rankName} (best 5: ${bestCardsStr})`);
    }

    // Check if hole cards contribute to the made hand
    const bestCardIds = new Set(eval_.bestCards.map(c => `${c.rank}${c.suit}`));
    const holeInBest = holeCards.filter(c => bestCardIds.has(`${c.rank}${c.suit}`));
    if (holeInBest.length === 0) {
      lines.push(locale === 'zh'
        ? `⚠️ 注意：你的底牌都没有参与最佳组合，这是公共牌面上的牌力，所有人共享！`
        : `⚠️ WARNING: Neither of your hole cards is in the best 5. This hand is on the board — everyone shares it!`);
    } else if (holeInBest.length === 1) {
      lines.push(locale === 'zh'
        ? `你的底牌 ${cardToString(holeInBest[0])} 参与了最佳组合`
        : `Your hole card ${cardToString(holeInBest[0])} contributes to the best hand`);
    } else {
      lines.push(locale === 'zh'
        ? `你的两张底牌都参与了最佳组合`
        : `Both your hole cards contribute to the best hand`);
    }
  }

  // Detect draws (only useful before river)
  if (communityCards.length >= 3 && communityCards.length < 5) {
    const allCards = [...holeCards, ...communityCards];
    const draws: string[] = [];

    // Flush draw detection
    const suitCounts = new Map<string, number>();
    for (const c of allCards) {
      suitCounts.set(c.suit, (suitCounts.get(c.suit) || 0) + 1);
    }
    for (const [suit, count] of suitCounts) {
      const suitSymbol = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' }[suit] || suit;
      if (count === 4) {
        const holeSuited = holeCards.filter(c => c.suit === suit);
        if (holeSuited.length > 0) {
          draws.push(locale === 'zh' ? `同花听牌 (${suitSymbol}, 差1张)` : `Flush draw (${suitSymbol}, need 1)`);
        }
      }
    }

    // Straight draw detection
    const uniqueRanks = [...new Set(allCards.map(c => RANK_VAL[c.rank]))].sort((a, b) => a - b);
    // Check for open-ended and gutshot straight draws
    for (let i = 0; i <= uniqueRanks.length - 4; i++) {
      const window = uniqueRanks.slice(i, i + 5);
      if (window.length >= 4) {
        const span = window[window.length - 1] - window[0];
        // Check that at least one hole card is involved
        const windowRanks = new Set(window);
        const holeInWindow = holeCards.filter(c => windowRanks.has(RANK_VAL[c.rank]));
        if (holeInWindow.length > 0) {
          if (span === 4 && window.length === 4) {
            draws.push(locale === 'zh' ? '两头顺子听牌 (差1张, 8 outs)' : 'Open-ended straight draw (need 1, 8 outs)');
          } else if (span === 4 && window.length === 5) {
            // Already a straight — handled by evaluateHand
          } else if (span === 3 && window.length === 4) {
            draws.push(locale === 'zh' ? '两头顺子听牌 (差1张)' : 'Open-ended straight draw (need 1)');
          }
        }
      }
    }
    // Gutshot detection: 4 cards within a span of 5 with one gap
    for (let high = 5; high <= 14; high++) {
      const rangeSet = new Set<number>();
      for (let r = high - 4; r <= high; r++) rangeSet.add(r === 1 ? 14 : r);
      const matching = uniqueRanks.filter(r => rangeSet.has(r));
      if (matching.length === 4) {
        const holeInRange = holeCards.filter(c => rangeSet.has(RANK_VAL[c.rank]));
        if (holeInRange.length > 0 && !draws.some(d => d.includes('straight') || d.includes('顺子'))) {
          draws.push(locale === 'zh' ? '卡顺听牌 (差1张, 4 outs)' : 'Gutshot straight draw (need 1, 4 outs)');
        }
      }
    }

    if (draws.length > 0) {
      lines.push((locale === 'zh' ? '**听牌**: ' : '**Draws**: ') + draws.join(', '));
    }
  }

  // Preflop: describe starting hand category
  if (communityCards.length === 0 && holeCards.length === 2) {
    const r1 = RANK_VAL[holeCards[0].rank];
    const r2 = RANK_VAL[holeCards[1].rank];
    const suited = holeCards[0].suit === holeCards[1].suit;
    const isPair = r1 === r2;
    const high = Math.max(r1, r2);
    const low = Math.min(r1, r2);

    let category = '';
    if (isPair) {
      if (high >= 12) category = locale === 'zh' ? '超强起手牌（大对子）' : 'Premium (high pair)';
      else if (high >= 9) category = locale === 'zh' ? '强起手牌（中高对子）' : 'Strong (mid-high pair)';
      else category = locale === 'zh' ? '小对子（适合看翻牌博三条）' : 'Small pair (set mining)';
    } else if (high === 14 && low >= 11) {
      category = locale === 'zh' ? '强起手牌（A+高牌）' : 'Strong (Ace + high card)';
    } else if (high === 14 && low >= 9) {
      category = locale === 'zh' ? '中上起手牌（A+中牌）' : 'Good (Ace + mid card)';
    } else if (high >= 12 && low >= 11) {
      category = locale === 'zh' ? '强起手牌（两张高牌）' : 'Strong (two high cards)';
    } else if (high >= 10 && low >= 9 && suited) {
      category = locale === 'zh' ? '可玩牌（同花连张）' : 'Playable (suited connectors)';
    } else if (high - low === 1 && suited && low >= 6) {
      category = locale === 'zh' ? '可玩牌（同花连张）' : 'Playable (suited connectors)';
    } else {
      category = locale === 'zh' ? '普通起手牌' : 'Marginal hand';
    }
    const suitedStr = suited ? (locale === 'zh' ? '同花' : 'suited') : (locale === 'zh' ? '不同花' : 'offsuit');
    lines.push(locale === 'zh'
      ? `**起手牌分类**: ${category}（${suitedStr}）`
      : `**Starting Hand**: ${category} (${suitedStr})`);
  }

  return lines.join('\n');
}

function buildPrompt(state: GameState, myPlayerId: string, locale: string, handActions: HandAction[]): string {
  const me = state.players.find(p => p.id === myPlayerId);
  if (!me) return '';

  const myCards = me.cards.map(cardToString).join(' ');
  const community = state.communityCards.map(cardToString).join(' ') || 'None';
  const callAmount = state.currentBet - me.currentBet;
  const potOdds = callAmount > 0 ? (callAmount / (state.pot + callAmount) * 100).toFixed(1) : '0';

  // Position info — use server-set flags (isDealer/isSB/isBB) as primary source
  const myIdx = state.players.findIndex(p => p.id === myPlayerId);
  const position = getPositionLabel(me, myIdx, state.dealerIndex || 0, state.players.filter(p => p.isActive).length);

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
  const playerMemory = getProfileSummaryForLLM(myPlayerId, me.name);

  // Pre-computed hand strength analysis (so LLM doesn't have to figure out card combos)
  const handStrength = analyzeHandStrength(me.cards, state.communityCards, locale);

  const analysisTask = locale === 'zh'
    ? `## 分析任务
基于以上所有信息，特别是**预计算的手牌强度分析（Hand Strength Analysis）**、对手的行为画像、当前手牌行动历史和剥削建议，给出**两个**不同的策略建议（主要建议和备选建议），并为每个建议分配概率（两者概率之和为100%）。

分析要点：
1. **牌力评估**：⚠️ 必须信任上方"Hand Strength Analysis"中预计算的牌力结果！不要自己推算牌型组合！如果预计算显示你有顺子/同花/葫芦等强牌，就按该牌力来制定策略。
2. **底池赔率 vs 胜率**：跟注/加注在数学上是否盈利？
3. **当前手牌行动解读**：根据本手牌中各阶段的行动序列，推断对手可能持有的牌力范围
4. **对手剥削**：如何针对每个对手的已知弱点进行剥削？
5. **位置优势**：我的位置如何影响最优打法？

重要原则：
- 不要默认保守打法。当数学和读牌支持时要保持激进。
- 如果对手弃牌率高，推荐诈唬和半诈唬。
- 如果对手被动，推荐薄价值下注。
- 有位置优势时，倾向于激进。
- 考虑筹码/底池比来决定下注大小。
- 结合当前手牌的行动历史来判断对手本手的真实意图。
- 两个建议应该是**不同的操作**，代表不同的策略方向。

你必须严格按照以下JSON格式返回（不要包含其他内容）：
\`\`\`json
{
  "suggestions": [
    {
      "action": "弃牌/过牌/跟注/加注 $X/全下",
      "probability": 70,
      "reason": "2-3句话解释原因"
    },
    {
      "action": "弃牌/过牌/跟注/加注 $X/全下",
      "probability": 30,
      "reason": "2-3句话解释原因"
    }
  ]
}
\`\`\``
    : `## Your Analysis Task
Based on ALL the above information, especially the **pre-computed Hand Strength Analysis**, opponent profiles, current hand action history, and exploit tips, provide **TWO** different strategy suggestions (primary and alternative), with a probability assigned to each (probabilities must sum to 100%).

Analysis points:
1. **Hand Strength**: ⚠️ You MUST trust the pre-computed "Hand Strength Analysis" section above! Do NOT try to evaluate card combinations yourself! If it says you have a Straight/Flush/Full House etc., base your strategy on that.
2. **Pot Odds vs Equity**: Is calling/raising mathematically profitable?
3. **Current Hand Action Reads**: Based on the action sequence this hand, infer opponents' likely hand strength ranges
4. **Opponent Exploitation**: How should I specifically exploit each opponent's known weaknesses?
5. **Position Advantage**: How does my position affect the optimal play?

IMPORTANT GUIDELINES:
- Do NOT default to conservative play. Be aggressive when the math and reads support it.
- If opponents have high fold-to-bet rates, recommend bluffs and semi-bluffs.
- If opponents are passive, recommend thin value bets.
- If you have position advantage, lean toward aggression.
- Consider stack-to-pot ratio when sizing bets.
- Use the current hand's action history to read opponents' real intentions this hand.
- The two suggestions should be **different actions**, representing different strategic directions.

You MUST respond in the following JSON format ONLY (no other text):
\`\`\`json
{
  "suggestions": [
    {
      "action": "FOLD/CHECK/CALL/RAISE $X/ALL-IN",
      "probability": 70,
      "reason": "2-3 sentences explaining why"
    },
    {
      "action": "FOLD/CHECK/CALL/RAISE $X/ALL-IN",
      "probability": 30,
      "reason": "2-3 sentences explaining why"
    }
  ]
}
\`\`\``;

  // Build current hand action history grouped by phase
  let actionHistorySection = '';
  if (handActions.length > 0) {
    const phases = ['preflop', 'flop', 'turn', 'river'];
    const lines: string[] = [];
    for (const phase of phases) {
      const phaseActions = handActions.filter(a => a.phase === phase);
      if (phaseActions.length === 0) continue;
      const actionStr = phaseActions.map(a => {
        const amt = a.amount ? ` $${a.amount}` : '';
        return `${a.playerName} → ${a.action}${amt}`;
      }).join(', ');
      lines.push(`  **${phase}**: ${actionStr}`);
    }
    if (lines.length > 0) {
      actionHistorySection = `\n## Current Hand Action History\n${lines.join('\n')}\n`;
    }
  }

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

## Hand Strength Analysis (pre-computed, TRUST this)
${handStrength}

## Opponents Still in Hand
  ${opponents}
${actionHistorySection}
## Player Behavioral Profiles (from tracked history)
${playerMemory}

${analysisTask}`;
}

function getSystemPrompt(locale: string): string {
  const preflopGuide = locale === 'zh'
    ? `
## Preflop 手牌强度分级（必须遵守）
翻前阶段你必须严格参考以下手牌分级来评估手牌强度，不能仅凭"是否有对子"来判断：
- **超强牌（永远加注/再加注）**：AA, KK, QQ, AKs, AKo
- **强牌（通常加注/3-bet）**：JJ, TT, AQs, AQo, AJs, KQs
- **中上牌（适合开局加注或跟注加注）**：99, 88, AJo, ATs, KJs, KQo, QJs, JTs
- **可玩牌（位置好时加注/跟注，位置差时谨慎）**：77, 66, A9s-A2s, KTs, QTs, T9s, 98s, 87s
- **小对子（22-55）**：适合在位置好时跟注看翻牌（set mining），但翻前价值远低于高牌组合如AJ/KQ
- **弱牌**：不在上述列表中的组合，通常弃牌

关键要点：
- AJo/AJs 是中上强度的好牌，翻前不应轻易弃牌！
- 小对子（22-55）翻前并不比 AJ/KQ 强，它们的价值在于翻牌后中三条
- 同花连张（如 87s, 98s）的隐含赔率高，位置好时可以玩
- "s"表示同花（suited），同花比不同花（offsuit/o）大约强 3-4%`
    : `
## Preflop Hand Strength Tiers (MUST follow)
During preflop, you MUST evaluate hand strength based on these tiers, NOT just "whether it's a pair":
- **Premium (always raise/3-bet)**: AA, KK, QQ, AKs, AKo
- **Strong (usually raise/3-bet)**: JJ, TT, AQs, AQo, AJs, KQs
- **Good (open-raise or call raises)**: 99, 88, AJo, ATs, KJs, KQo, QJs, JTs
- **Playable (raise/call in position, fold early position)**: 77, 66, A9s-A2s, KTs, QTs, T9s, 98s, 87s
- **Small pairs (22-55)**: Good for set mining when in position, but preflop value is LOWER than high-card hands like AJ/KQ
- **Weak**: Hands not listed above, usually fold

KEY POINTS:
- AJo/AJs is a good hand — do NOT fold it preflop easily!
- Small pairs (22-55) are NOT stronger than AJ/KQ preflop; their value comes from hitting sets postflop
- Suited connectors (87s, 98s) have high implied odds, playable in position
- "s" means suited, which is ~3-4% stronger than offsuit ("o")`;

  if (locale === 'zh') {
    return `你是一位顶尖的德州扑克策略专家——不是保守的顾问，而是一个激进的、善于剥削对手弱点的玩家，追求最大化期望收益(EV)。

核心原则：
1. **无情地利用对手弱点**：如果数据显示对手弃牌率高，就诈唬他们。如果他们跟注太多，就做薄价值下注。如果他们被动，就偷池。
2. **位置即力量**：后位时，大幅扩大你的激进范围。
3. **激进制胜**：下注和加注有两种赢法（对手弃牌或你有最好的牌）。跟注只有一种赢法。
4. **不要被结果导向**：如果数学支持，即使诈唬被抓也是正确的打法。
5. **适应牌桌**：如果所有人都紧，就多偷盲。如果牌桌松散，就收紧并加大价值下注。
${preflopGuide}

你给出**简洁、可执行**的建议。你必须使用中文回复。`;
  }
  return `You are an elite Texas Hold'em poker strategist — not a cautious advisor, but an aggressive, exploitative player who maximizes EV.

KEY PRINCIPLES:
1. **Exploit opponent weaknesses ruthlessly**: If data shows a player folds too much, bluff them. If they call too much, value-bet thinner. If they're passive, steal pots.
2. **Position is power**: In late position, widen your aggression range significantly.
3. **Aggression wins**: Betting and raising have TWO ways to win (opponent folds OR you have the best hand). Calling only wins one way.
4. **Don't be results-oriented**: A good bluff that gets called is still a correct play if the math supports it.
5. **Adapt to the table**: If everyone is tight, steal more. If the table is loose, tighten up and value-bet hard.
${preflopGuide}

You give CONCISE, ACTIONABLE advice. You MUST respond in English.`;
}

/** A single suggestion from the LLM advisor */
export interface AdvisorSuggestion {
  action: string;       // Raw action text from LLM (e.g. "RAISE $200", "弃牌")
  probability: number;  // 0-100
  reason: string;
}

export async function getAdvice(state: GameState, myPlayerId: string, handActions: HandAction[] = [], isLocal = false): Promise<AdvisorSuggestion[]> {
  const token = getAuthToken();
  const locale = useI18n.getState().locale;

  if (!token) {
    throw new Error('Not authenticated');
  }

  const prompt = buildPrompt(state, myPlayerId, locale, handActions);
  if (!prompt) throw new Error('Cannot build prompt');

  const API_BASE = import.meta.env.VITE_SERVER_URL ?? (import.meta.env.PROD ? '' : `http://${window.location.hostname}:3001`);

  const response = await fetch(`${API_BASE}/api/llm/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: getSystemPrompt(locale) },
        { role: 'user', content: prompt },
      ],
      max_tokens: 800,
      temperature: 0.7,
      ...(isLocal ? { localMode: true } : {}),
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || `API error ${response.status}`);
  }

  const data = await response.json();
  const content: string = data.choices?.[0]?.message?.content || '';

  return parseAdvisorResponse(content);
}

/** Parse LLM JSON response into structured suggestions */
function parseAdvisorResponse(content: string): AdvisorSuggestion[] {
  // Try to extract JSON from markdown code block or raw text
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || content.match(/(\{[\s\S]*\})/);
  if (!jsonMatch) {
    // Fallback: return the raw text as a single suggestion
    return [{ action: content.trim(), probability: 100, reason: '' }];
  }

  try {
    const parsed = JSON.parse(jsonMatch[1].trim());
    const suggestions: AdvisorSuggestion[] = (parsed.suggestions || []).map((s: any) => ({
      action: String(s.action || '').trim(),
      probability: Number(s.probability) || 50,
      reason: String(s.reason || '').trim(),
    }));

    if (suggestions.length === 0) {
      return [{ action: content.trim(), probability: 100, reason: '' }];
    }

    // Sort by probability descending
    suggestions.sort((a, b) => b.probability - a.probability);
    return suggestions;
  } catch {
    return [{ action: content.trim(), probability: 100, reason: '' }];
  }
}
