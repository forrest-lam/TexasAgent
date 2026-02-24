import { AIDecisionContext } from '@texas-agent/shared';
import { formatCards } from '@texas-agent/shared';

export function buildDecisionPrompt(context: AIDecisionContext): string {
  const callAmount = context.currentBet - context.playerBet;
  const canCheck = callAmount === 0;

  const opponentInfo = context.players
    .filter(p => p.id !== context.playerId && !p.isFolded)
    .map((p, i) => `  Player ${i + 1}: chips=${p.chips}, bet=${p.currentBet}${p.isAllIn ? ' (ALL-IN)' : ''}`)
    .join('\n');

  const availableActions: string[] = [];
  if (canCheck) availableActions.push('"check"');
  else availableActions.push('"fold"', '"call"');
  availableActions.push('"raise"');
  if (context.playerChips > 0) availableActions.push('"all-in"');

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

OPPONENTS:
${opponentInfo}

PERSONALITY: ${context.personality}
${context.personality === 'conservative' ? '- Play tight, fold marginal hands, only raise with strong hands' : ''}
${context.personality === 'aggressive' ? '- Play loose-aggressive, apply pressure, bluff occasionally, raise frequently' : ''}
${context.personality === 'balanced' ? '- Play solid TAG style, mix raises and calls, bluff selectively based on position' : ''}

Available actions: ${availableActions.join(', ')}

Respond with ONLY a JSON object (no markdown, no explanation):
{"action": "<action_type>", "amount": <number_or_null>, "reasoning": "<brief_reason>"}

Where action is one of: ${availableActions.join(', ')}
If action is "raise", amount must be >= ${context.minRaise}
If action is not "raise", amount should be null`;
}

export function parseDecisionResponse(response: string): { type: string; amount?: number } | null {
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
  };
}
