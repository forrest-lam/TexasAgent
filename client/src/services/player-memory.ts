/**
 * Player Memory System (Enhanced)
 * Tracks each player's behavioral patterns across hands with per-phase stats,
 * recent action sequences, and exploitability analysis.
 * Data persists in localStorage to survive page reloads.
 */

export interface PhaseStats {
  folds: number;
  checks: number;
  calls: number;
  raises: number;
  allIns: number;
  total: number;
}

/** A single action record for recent history */
export interface ActionRecord {
  phase: string;      // preflop | flop | turn | river
  action: string;     // fold | check | call | raise | all-in
  amount?: number;
  potSize?: number;
  round: number;      // which game round
}

export interface PlayerProfile {
  id: string;
  name: string;

  // Overall behavioral stats
  handsPlayed: number;
  handsWon: number;
  foldRate: number;     // 0-1
  raiseRate: number;    // 0-1
  callRate: number;     // 0-1
  allInRate: number;    // 0-1
  checkRate: number;    // 0-1
  bluffCaught: number;
  avgBetSize: number;   // average bet relative to pot

  // Per-phase stats
  phaseStats: Record<string, PhaseStats>;

  // Personality assessment
  style: 'tight-passive' | 'tight-aggressive' | 'loose-passive' | 'loose-aggressive' | 'maniac' | 'rock' | 'unknown';
  notes: string;

  // Recent action history (last N actions for pattern detection)
  recentActions: ActionRecord[];

  // Tendencies
  preflopRaiseRate: number;   // raise% specifically preflop
  postflopAggression: number; // (raise+allIn) / (raise+allIn+call+check) on flop+turn+river
  foldToBetRate: number;      // how often folds when facing a bet (non-check situations)
  cbet: number;               // continuation bet rate (raise preflop → bet flop)

  // Streak / tilt detection
  recentWins: number;         // wins in last 10 hands
  recentLosses: number;       // losses in last 10 hands

  // Raw counters
  _folds: number;
  _raises: number;
  _calls: number;
  _checks: number;
  _allIns: number;
  _totalActions: number;
  _totalBetAmount: number;
  _totalPotAtBet: number;
  _facingBetActions: number;  // times faced a bet (call/raise/fold, not check)
  _foldsToBet: number;       // times folded when facing a bet
  _preflopRaises: number;
  _preflopActions: number;
  _postflopAggActions: number;  // raise+allIn postflop
  _postflopPassActions: number; // call+check postflop
  _recentResults: boolean[];    // last 10 hand results (true=win)
}

const STORAGE_KEY = 'texas-agent-player-memory';
const MAX_RECENT_ACTIONS = 30;
const MAX_RECENT_RESULTS = 10;

let memoryCache: Record<string, PlayerProfile> = {};
let currentRound = 0;

function load(): Record<string, PlayerProfile> {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
      memoryCache = JSON.parse(data);
      // Migrate old profiles that lack new fields
      for (const p of Object.values(memoryCache)) {
        if (!p.phaseStats) p.phaseStats = {};
        if (!p.recentActions) p.recentActions = [];
        if (!p._recentResults) p._recentResults = [];
        if (p.preflopRaiseRate === undefined) p.preflopRaiseRate = 0;
        if (p.postflopAggression === undefined) p.postflopAggression = 0;
        if (p.foldToBetRate === undefined) p.foldToBetRate = 0;
        if (p.cbet === undefined) p.cbet = 0;
        if (p.checkRate === undefined) p.checkRate = 0;
        if (p.recentWins === undefined) p.recentWins = 0;
        if (p.recentLosses === undefined) p.recentLosses = 0;
        if (p._facingBetActions === undefined) p._facingBetActions = 0;
        if (p._foldsToBet === undefined) p._foldsToBet = 0;
        if (p._preflopRaises === undefined) p._preflopRaises = 0;
        if (p._preflopActions === undefined) p._preflopActions = 0;
        if (p._postflopAggActions === undefined) p._postflopAggActions = 0;
        if (p._postflopPassActions === undefined) p._postflopPassActions = 0;
        if ((p.style as string) === 'unknown' || !['tight-passive','tight-aggressive','loose-passive','loose-aggressive','maniac','rock'].includes(p.style)) {
          // will be recalculated
        }
      }
    }
  } catch {}
  return memoryCache;
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(memoryCache));
  } catch {}
}

load();

function emptyPhaseStats(): PhaseStats {
  return { folds: 0, checks: 0, calls: 0, raises: 0, allIns: 0, total: 0 };
}

export function getPlayerProfile(playerId: string, playerName?: string): PlayerProfile {
  if (!memoryCache[playerId]) {
    memoryCache[playerId] = {
      id: playerId,
      name: playerName || playerId,
      handsPlayed: 0,
      handsWon: 0,
      foldRate: 0,
      raiseRate: 0,
      callRate: 0,
      allInRate: 0,
      checkRate: 0,
      bluffCaught: 0,
      avgBetSize: 0,
      phaseStats: {},
      style: 'unknown',
      notes: '',
      recentActions: [],
      preflopRaiseRate: 0,
      postflopAggression: 0,
      foldToBetRate: 0,
      cbet: 0,
      recentWins: 0,
      recentLosses: 0,
      _folds: 0,
      _raises: 0,
      _calls: 0,
      _checks: 0,
      _allIns: 0,
      _totalActions: 0,
      _totalBetAmount: 0,
      _totalPotAtBet: 0,
      _facingBetActions: 0,
      _foldsToBet: 0,
      _preflopRaises: 0,
      _preflopActions: 0,
      _postflopAggActions: 0,
      _postflopPassActions: 0,
      _recentResults: [],
    };
  }
  return memoryCache[playerId];
}

export function setCurrentRound(round: number) {
  currentRound = round;
}

export function recordAction(
  playerId: string,
  playerName: string,
  actionType: string,
  amount?: number,
  potSize?: number,
  phase?: string,
) {
  const profile = getPlayerProfile(playerId, playerName);
  profile.name = playerName;
  profile._totalActions++;

  const currentPhase = phase || 'unknown';

  // Per-phase stats
  if (!profile.phaseStats[currentPhase]) {
    profile.phaseStats[currentPhase] = emptyPhaseStats();
  }
  const ps = profile.phaseStats[currentPhase];
  ps.total++;

  // Determine if facing a bet (action is fold/call/raise in response to someone else's bet)
  const facingBet = actionType === 'fold' || actionType === 'call' || (actionType === 'raise' && (amount || 0) > 0);

  switch (actionType) {
    case 'fold':
      profile._folds++;
      ps.folds++;
      if (facingBet) { profile._facingBetActions++; profile._foldsToBet++; }
      break;
    case 'check':
      profile._checks++;
      ps.checks++;
      break;
    case 'call':
      profile._calls++;
      ps.calls++;
      if (facingBet) profile._facingBetActions++;
      break;
    case 'raise':
      profile._raises++;
      ps.raises++;
      if (facingBet) profile._facingBetActions++;
      if (amount && potSize) {
        profile._totalBetAmount += amount;
        profile._totalPotAtBet += potSize;
      }
      break;
    case 'all-in':
      profile._allIns++;
      ps.allIns++;
      if (facingBet) profile._facingBetActions++;
      if (amount && potSize) {
        profile._totalBetAmount += amount;
        profile._totalPotAtBet += potSize;
      }
      break;
  }

  // Preflop-specific tracking
  if (currentPhase === 'preflop') {
    profile._preflopActions++;
    if (actionType === 'raise' || actionType === 'all-in') {
      profile._preflopRaises++;
    }
  }

  // Postflop aggression tracking
  if (currentPhase !== 'preflop' && currentPhase !== 'unknown') {
    if (actionType === 'raise' || actionType === 'all-in') {
      profile._postflopAggActions++;
    } else if (actionType === 'call' || actionType === 'check') {
      profile._postflopPassActions++;
    }
  }

  // Record to recent actions
  profile.recentActions.push({
    phase: currentPhase,
    action: actionType,
    amount,
    potSize,
    round: currentRound,
  });
  if (profile.recentActions.length > MAX_RECENT_ACTIONS) {
    profile.recentActions = profile.recentActions.slice(-MAX_RECENT_ACTIONS);
  }

  // Recompute rates
  recomputeRates(profile);
  save();
}

function recomputeRates(profile: PlayerProfile) {
  const total = profile._totalActions || 1;
  profile.foldRate = profile._folds / total;
  profile.raiseRate = profile._raises / total;
  profile.callRate = profile._calls / total;
  profile.allInRate = profile._allIns / total;
  profile.checkRate = profile._checks / total;
  profile.avgBetSize = profile._totalPotAtBet > 0
    ? profile._totalBetAmount / profile._totalPotAtBet
    : 0;

  // Advanced stats
  profile.preflopRaiseRate = profile._preflopActions > 0
    ? profile._preflopRaises / profile._preflopActions
    : 0;

  const postflopTotal = profile._postflopAggActions + profile._postflopPassActions;
  profile.postflopAggression = postflopTotal > 0
    ? profile._postflopAggActions / postflopTotal
    : 0;

  profile.foldToBetRate = profile._facingBetActions > 0
    ? profile._foldsToBet / profile._facingBetActions
    : 0;

  // Recent results
  const recent = profile._recentResults || [];
  profile.recentWins = recent.filter(r => r).length;
  profile.recentLosses = recent.filter(r => !r).length;

  // Determine style (enhanced)
  const vpip = 1 - profile.foldRate;
  const aggression = profile.raiseRate + profile.allInRate;

  if (total < 5) {
    profile.style = 'unknown';
  } else if (vpip > 0.75 && aggression > 0.45) {
    profile.style = 'maniac';
  } else if (vpip < 0.25 && aggression < 0.15) {
    profile.style = 'rock';
  } else if (vpip > 0.55 && aggression > 0.3) {
    profile.style = 'loose-aggressive';
  } else if (vpip > 0.55) {
    profile.style = 'loose-passive';
  } else if (aggression > 0.3) {
    profile.style = 'tight-aggressive';
  } else {
    profile.style = 'tight-passive';
  }

  profile.notes = generateNotes(profile);
}

export function recordHandResult(playerId: string, playerName: string, won: boolean) {
  const profile = getPlayerProfile(playerId, playerName);
  profile.handsPlayed++;
  if (won) profile.handsWon++;

  // Track recent results
  if (!profile._recentResults) profile._recentResults = [];
  profile._recentResults.push(won);
  if (profile._recentResults.length > MAX_RECENT_RESULTS) {
    profile._recentResults = profile._recentResults.slice(-MAX_RECENT_RESULTS);
  }
  profile.recentWins = profile._recentResults.filter(r => r).length;
  profile.recentLosses = profile._recentResults.filter(r => !r).length;

  profile.notes = generateNotes(profile);
  save();
}

function generateNotes(p: PlayerProfile): string {
  if (p._totalActions < 3) return 'Not enough data yet.';

  const parts: string[] = [];
  parts.push(`Style: ${p.style}`);
  parts.push(`VPIP: ${((1 - p.foldRate) * 100).toFixed(0)}%`);
  parts.push(`PFR: ${(p.preflopRaiseRate * 100).toFixed(0)}%`);
  parts.push(`Fold%: ${(p.foldRate * 100).toFixed(0)}%`);
  parts.push(`Agg: ${(p.postflopAggression * 100).toFixed(0)}%`);
  if (p._facingBetActions >= 3) {
    parts.push(`FoldToBet: ${(p.foldToBetRate * 100).toFixed(0)}%`);
  }
  if (p.handsPlayed > 0) {
    parts.push(`WR: ${((p.handsWon / p.handsPlayed) * 100).toFixed(0)}%`);
  }
  if (p.avgBetSize > 0) {
    parts.push(`AvgBet/Pot: ${(p.avgBetSize * 100).toFixed(0)}%`);
  }
  return parts.join(' | ');
}

function getStyleDescription(style: string): string {
  const desc: Record<string, string> = {
    'maniac': 'Extremely aggressive, plays almost every hand with big bets. Likely to overbet and bluff frequently.',
    'rock': 'Ultra-tight, only plays premium hands. When they bet, they almost always have it.',
    'loose-aggressive': 'Plays many hands aggressively. Will bluff often and put pressure with raises.',
    'loose-passive': 'Plays many hands but rarely raises. Tends to call too much — a "calling station".',
    'tight-aggressive': 'Selective but aggressive when entering. Strong, disciplined player.',
    'tight-passive': 'Plays few hands and rarely raises. Passive — easy to push around with bets.',
    'unknown': 'Not enough data to classify.',
  };
  return desc[style] || '';
}

function getExploitTips(p: PlayerProfile): string[] {
  const tips: string[] = [];

  if (p.foldToBetRate > 0.6 && p._facingBetActions >= 5) {
    tips.push('HIGH fold-to-bet rate — bluff and semi-bluff frequently against them');
  }
  if (p.foldToBetRate < 0.25 && p._facingBetActions >= 5) {
    tips.push('Rarely folds to bets — only value-bet strong hands, avoid bluffing');
  }
  if (p.style === 'maniac') {
    tips.push('Maniac — let them hang themselves, trap with strong hands, call down lighter');
  }
  if (p.style === 'rock') {
    tips.push('Rock — steal their blinds freely, fold to their raises unless you have a monster');
  }
  if (p.style === 'loose-passive') {
    tips.push('Calling station — value-bet relentlessly, never bluff, bet thinner for value');
  }
  if (p.style === 'tight-passive') {
    tips.push('Tight-passive — apply pressure with raises, they will fold often');
  }
  if (p.preflopRaiseRate > 0.5 && p._preflopActions >= 5) {
    tips.push('Very high preflop raise rate — 3-bet them more to exploit wide opening range');
  }
  if (p.postflopAggression < 0.2 && (p._postflopAggActions + p._postflopPassActions) >= 5) {
    tips.push('Very passive postflop — steal pots with continuation bets and probes');
  }
  if (p.recentLosses >= 4) {
    tips.push('On a losing streak — may be tilting, expect more erratic/desperate plays');
  }
  if (p.recentWins >= 4) {
    tips.push('On a winning streak — may be overconfident, could be playing looser');
  }

  return tips;
}

export function getAllProfiles(): PlayerProfile[] {
  return Object.values(memoryCache);
}

/**
 * Generate a rich, actionable summary for the LLM advisor.
 * Includes per-player: style, key stats, exploit tips, and recent action patterns.
 * Excludes raw player IDs for privacy.
 */
export function getProfileSummaryForLLM(myPlayerId?: string): string {
  const profiles = getAllProfiles().filter(p => p._totalActions >= 3);
  if (profiles.length === 0) return 'No player behavioral data available yet. This is early in the session.';

  const sections: string[] = [];

  // My own profile (self-awareness)
  if (myPlayerId) {
    const myProfile = profiles.find(p => p.id === myPlayerId);
    if (myProfile && myProfile._totalActions >= 3) {
      sections.push(`### Your Own Play Style
- Style: **${myProfile.style}** — ${getStyleDescription(myProfile.style)}
- VPIP: ${((1 - myProfile.foldRate) * 100).toFixed(0)}% | PFR: ${(myProfile.preflopRaiseRate * 100).toFixed(0)}% | Postflop Aggression: ${(myProfile.postflopAggression * 100).toFixed(0)}%
- Win rate: ${myProfile.handsPlayed > 0 ? ((myProfile.handsWon / myProfile.handsPlayed) * 100).toFixed(0) : '?'}% over ${myProfile.handsPlayed} hands
- Recent: ${myProfile.recentWins}W/${myProfile.recentLosses}L in last ${MAX_RECENT_RESULTS}
- NOTE: If your play has been too predictable or passive, consider mixing in more aggression.`);
    }
  }

  // Opponent profiles
  const opponents = profiles.filter(p => p.id !== myPlayerId);
  for (const p of opponents) {
    const lines: string[] = [];
    lines.push(`### ${p.name}`);
    lines.push(`- **Style**: ${p.style} — ${getStyleDescription(p.style)}`);
    lines.push(`- Stats (${p._totalActions} actions, ${p.handsPlayed} hands):`);
    lines.push(`  VPIP: ${((1 - p.foldRate) * 100).toFixed(0)}% | PFR: ${(p.preflopRaiseRate * 100).toFixed(0)}% | PostflopAgg: ${(p.postflopAggression * 100).toFixed(0)}% | FoldToBet: ${(p.foldToBetRate * 100).toFixed(0)}%`);
    lines.push(`  Win rate: ${p.handsPlayed > 0 ? ((p.handsWon / p.handsPlayed) * 100).toFixed(0) : '?'}% | AvgBet/Pot: ${(p.avgBetSize * 100).toFixed(0)}%`);

    // Per-phase breakdown if enough data
    for (const phase of ['preflop', 'flop', 'turn', 'river']) {
      const ps = p.phaseStats[phase];
      if (ps && ps.total >= 3) {
        const aggPct = ps.total > 0 ? (((ps.raises + ps.allIns) / ps.total) * 100).toFixed(0) : '0';
        const foldPct = ps.total > 0 ? ((ps.folds / ps.total) * 100).toFixed(0) : '0';
        lines.push(`  ${phase}: Agg ${aggPct}% | Fold ${foldPct}% (${ps.total} actions)`);
      }
    }

    // Recent streak
    if (p._recentResults && p._recentResults.length >= 3) {
      lines.push(`- Recent: ${p.recentWins}W/${p.recentLosses}L in last ${p._recentResults.length}`);
    }

    // Exploit tips
    const tips = getExploitTips(p);
    if (tips.length > 0) {
      lines.push(`- **How to exploit**: ${tips.join('; ')}`);
    }

    // Recent notable actions (last 5 from current or recent rounds)
    const recentNotable = p.recentActions
      .filter(a => a.action !== 'check')
      .slice(-5);
    if (recentNotable.length > 0) {
      const actionStr = recentNotable.map(a => {
        const amt = a.amount ? ` $${a.amount}` : '';
        return `${a.phase}:${a.action}${amt}`;
      }).join(' → ');
      lines.push(`- Recent actions: ${actionStr}`);
    }

    sections.push(lines.join('\n'));
  }

  return sections.join('\n\n');
}

export function clearMemory() {
  memoryCache = {};
  save();
}
