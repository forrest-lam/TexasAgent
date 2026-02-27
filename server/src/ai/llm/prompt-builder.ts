import { AIDecisionContext, AIPersonality } from '@texas-agent/shared';
import { formatCards } from '@texas-agent/shared';

/** Personality-specific system messages — stronger framing than user-level hints */
const SYSTEM_MESSAGES: Record<AIPersonality, string> = {
  aggressive: `You are a fearless, hyper-aggressive Texas Hold'em shark. You LOVE raising and putting pressure on opponents. Folding disgusts you — you only fold when you have absolute garbage and face a huge bet. Your default action is RAISE. Bluff often. Respond ONLY with valid JSON: {"action":"fold|check|call|raise|all-in","amount":number,"reasoning":"brief reason"}`,
  conservative: `You are a disciplined, patient Texas Hold'em grinder. You wait for premium hands and strong spots. You prefer to minimize losses rather than maximize risk. Respond ONLY with valid JSON: {"action":"fold|check|call|raise|all-in","amount":number,"reasoning":"brief reason"}`,
  balanced: `You are a skilled, adaptive Texas Hold'em professional. You play a solid TAG (tight-aggressive) style but you're not afraid to make big moves when the situation calls for it. You exploit weak players aggressively and give respect to strong ones. Respond ONLY with valid JSON: {"action":"fold|check|call|raise|all-in","amount":number,"reasoning":"brief reason"}`,
};

export function getSystemMessage(personality: AIPersonality): string {
  return SYSTEM_MESSAGES[personality];
}

export function getTemperature(personality: AIPersonality): number {
  switch (personality) {
    case 'aggressive': return 0.9;
    case 'balanced': return 0.7;
    case 'conservative': return 0.5;
  }
}

export function buildDecisionPrompt(context: AIDecisionContext): string {
  const callAmount = context.currentBet - context.playerBet;
  const canCheck = callAmount === 0;

  const opponentInfo = context.players
    .filter(p => p.id !== context.playerId && !p.isFolded)
    .map((p, i) => `  Player ${i + 1} (${p.name || 'Unknown'}): chips=${p.chips}, bet=${p.currentBet}${p.isAllIn ? ' (ALL-IN)' : ''}`)
    .join('\n');

  const availableActions: string[] = [];
  if (canCheck) availableActions.push('"check"');
  else availableActions.push('"fold"', '"call"');
  availableActions.push('"raise"');
  if (context.playerChips > 0) availableActions.push('"all-in"');

  // Build hand history section
  let handHistorySection = '';
  if (context.handHistory && context.handHistory.length > 0) {
    const lines = context.handHistory.map(h =>
      `  [${h.phase}] ${h.playerName}: ${h.action}${h.amount ? ` ${h.amount}` : ''} (pot: ${h.potSize})`
    );
    handHistorySection = `\nACTION HISTORY THIS HAND:\n${lines.join('\n')}\n`;
  }

  // Build opponent profiles section
  let profilesSection = '';
  if (context.opponentProfiles && context.opponentProfiles.length > 0) {
    const profiles = context.opponentProfiles.map(op => {
      const stats = [
        `Style: ${op.style}`,
        `Hands: ${op.handsPlayed}`,
        `Win%: ${(op.winRate * 100).toFixed(0)}%`,
        `VPIP: ${(op.vpip * 100).toFixed(0)}%`,
        `PFR: ${(op.pfr * 100).toFixed(0)}%`,
        `PostflopAgg: ${(op.postflopAgg * 100).toFixed(0)}%`,
        `FoldToBet: ${(op.foldToBet * 100).toFixed(0)}%`,
        `AvgBet/Pot: ${op.avgBetSize.toFixed(2)}`,
      ].join(', ');
      const tips = op.exploitTips.length > 0
        ? `\n    Exploit: ${op.exploitTips.join('; ')}`
        : '';
      const recent = op.recentActions !== 'none'
        ? `\n    Recent: ${op.recentActions}`
        : '';
      return `  ${op.name}: ${stats}${tips}${recent}`;
    });
    profilesSection = `\nOPPONENT BEHAVIORAL PROFILES (based on ${context.opponentProfiles[0]?.handsPlayed || 0}+ hands of history):\n${profiles.join('\n')}\n`;
  }

  return `You are an expert Texas Hold'em poker player with a ${context.personality} play style.

CURRENT GAME STATE:
- Phase: ${context.phase}
- Your hand: ${formatCards(context.hand)}
- Community cards: ${context.communityCards.length > 0 ? formatCards(context.communityCards) : 'None (pre-flop)'}
- Pot size: ${context.pot}
- Current bet to match: ${context.currentBet}
- Your current bet: ${context.playerBet}
- Amount to call: ${callAmount}
- Your chips: ${context.playerChips}
- Minimum raise to: ${context.minRaise}
- Your position: ${context.position}
- Active players: ${context.numActivePlayers}

OPPONENTS (current state):
${opponentInfo}
${handHistorySection}${profilesSection}
PERSONALITY: ${context.personality}
${context.personality === 'conservative' ? '- Play tight, fold marginal hands, only raise with strong hands. Patience is your weapon.' : ''}
${context.personality === 'aggressive' ? '- RAISE is your DEFAULT action. Bluff at least 25% of the time. Apply maximum pressure. Only fold when truly hopeless facing a big bet. When in doubt, RAISE.' : ''}
${context.personality === 'balanced' ? '- Play solid TAG style but lean aggressive. Raise more than you call. Bluff in good spots. Exploit weak/passive opponents with frequent raises and barrel bluffs.' : ''}
${profilesSection ? '- IMPORTANT: Use the opponent profiles above to make exploitative adjustments. Target weak players and avoid traps from strong ones.' : ''}

Available actions: ${availableActions.join(', ')}

Respond with ONLY a JSON object (no markdown, no explanation):
{"action": "<action_type>", "amount": <number_or_null>, "reasoning": "<brief_reason>"}

Where action is one of: ${availableActions.join(', ')}
If action is "raise", amount must be >= ${context.minRaise}
If action is not "raise", amount should be null`;
}

export function parseDecisionResponse(response: string): { type: string; amount?: number; reasoning?: string } | null {
  const jsonMatch = response.match(/\{[\s\S]*?\}/);
  if (!jsonMatch) return null;

  const parsed = JSON.parse(jsonMatch[0]);
  if (!parsed.action) return null;

  const actionMap: Record<string, string> = {
    'fold': 'fold',
    'check': 'check',
    'call': 'call',
    'raise': 'raise',
    'all-in': 'all-in',
    'allin': 'all-in',
    'all_in': 'all-in',
  };

  const type = actionMap[parsed.action.toLowerCase()];
  if (!type) return null;

  return {
    type,
    amount: parsed.amount != null ? Number(parsed.amount) : undefined,
    reasoning: parsed.reasoning ? String(parsed.reasoning) : undefined,
  };
}
