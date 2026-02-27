/**
 * Two-layer memory system for LLM bots.
 *
 * Layer 1 — GlobalMemory (cross-room):
 *   Persistent opponent profiles keyed by player name.
 *   Stores cumulative behavioral statistics (VPIP, PFR, aggression, fold-to-bet, etc.)
 *   across all rooms / hands a player has participated in.
 *   Survives room destruction — only cleared on server restart.
 *
 * Layer 2 — HandMemory (per-room, per-hand, per-bot):
 *   Each LLM bot has its own independent view of the current hand's actions.
 *   A bot can only "see" public actions (bet/raise/call/check/fold) but NOT
 *   other players' hole cards. At the end of each hand, results are merged
 *   back into Layer 1 (GlobalMemory).
 */

import { GamePhase, ActionType } from '@texas-agent/shared';

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

export interface PhaseStats {
  folds: number;
  checks: number;
  calls: number;
  raises: number;
  allIns: number;
  total: number;
}

/** A single recorded action visible to all players (public information) */
export interface ActionRecord {
  phase: GamePhase;
  action: ActionType;
  amount?: number;
  potSize?: number;
  round: number;
}

/** Cumulative opponent profile stored in GlobalMemory (Layer 1) */
export interface OpponentProfile {
  name: string;

  /* overall counts */
  handsPlayed: number;
  handsWon: number;

  /* raw action counters */
  _folds: number;
  _checks: number;
  _calls: number;
  _raises: number;
  _allIns: number;
  _totalActions: number;

  /* betting sizing */
  _totalBetAmount: number;
  _totalPotAtBet: number;

  /* facing-bet tracking */
  _facingBetActions: number;
  _foldsToBet: number;

  /* preflop / postflop breakdown */
  _preflopRaises: number;
  _preflopActions: number;
  _postflopAggActions: number;
  _postflopPassActions: number;

  /* per-phase stats */
  phaseStats: Record<string, PhaseStats>;

  /* derived rates (recomputed after every merge) */
  foldRate: number;
  raiseRate: number;
  callRate: number;
  checkRate: number;
  allInRate: number;
  avgBetSize: number;
  preflopRaiseRate: number;
  postflopAggression: number;
  foldToBetRate: number;

  /* auto-classified style */
  style: 'tight-passive' | 'tight-aggressive' | 'loose-passive' |
         'loose-aggressive' | 'maniac' | 'rock' | 'unknown';

  /* recent actions across hands (max 30) */
  recentActions: ActionRecord[];

  /* recent win/loss for tilt detection (last 10 hands) */
  _recentResults: boolean[];
  recentWins: number;
  recentLosses: number;
}

/** Compact summary sent inside the LLM prompt (Layer 1 output) */
export interface OpponentSummary {
  name: string;
  style: string;
  handsPlayed: number;
  winRate: number;
  vpip: number;
  pfr: number;
  postflopAgg: number;
  foldToBet: number;
  avgBetSize: number;
  recentActions: string;
  exploitTips: string[];
}

/** A single action entry visible in the current hand (Layer 2) */
export interface HandActionEntry {
  playerId: string;
  playerName: string;
  action: ActionType;
  amount?: number;
  potSize: number;
  phase: GamePhase;
}

/* ================================================================== */
/*  Layer 1 — GlobalMemory (cross-room persistent profiles)            */
/* ================================================================== */

class GlobalMemory {
  private profiles = new Map<string, OpponentProfile>();

  /** Merge a batch of hand actions into the global profile for one player */
  mergeHandActions(
    playerName: string,
    actions: Array<{
      action: ActionType;
      amount?: number;
      potSize?: number;
      phase: GamePhase;
      facingBet: boolean;
    }>,
    round: number,
  ): void {
    const profile = this.getOrCreate(playerName);

    for (const a of actions) {
      profile._totalActions++;

      const ps = this.ensurePhaseStats(profile, a.phase);
      ps.total++;

      if (a.facingBet) {
        profile._facingBetActions++;
        if (a.action === 'fold') profile._foldsToBet++;
      }

      switch (a.action) {
        case 'fold':
          profile._folds++;
          ps.folds++;
          break;
        case 'check':
          profile._checks++;
          ps.checks++;
          if (a.phase !== 'preflop') profile._postflopPassActions++;
          break;
        case 'call':
          profile._calls++;
          ps.calls++;
          if (a.phase === 'preflop') profile._preflopActions++;
          if (a.phase !== 'preflop') profile._postflopPassActions++;
          break;
        case 'raise':
          profile._raises++;
          ps.raises++;
          if (a.amount && a.potSize && a.potSize > 0) {
            profile._totalBetAmount += a.amount;
            profile._totalPotAtBet += a.potSize;
          }
          if (a.phase === 'preflop') { profile._preflopRaises++; profile._preflopActions++; }
          if (a.phase !== 'preflop') profile._postflopAggActions++;
          break;
        case 'all-in':
          profile._allIns++;
          ps.allIns++;
          if (a.phase === 'preflop') { profile._preflopRaises++; profile._preflopActions++; }
          if (a.phase !== 'preflop') profile._postflopAggActions++;
          break;
      }

      profile.recentActions.push({
        phase: a.phase,
        action: a.action,
        amount: a.amount,
        potSize: a.potSize,
        round,
      });
      if (profile.recentActions.length > 30) {
        profile.recentActions.shift();
      }
    }

    this.recomputeRates(profile);
  }

  /** Record whether the player won or lost this hand */
  recordHandResult(playerName: string, won: boolean): void {
    const profile = this.getOrCreate(playerName);
    profile.handsPlayed++;
    if (won) profile.handsWon++;

    profile._recentResults.push(won);
    if (profile._recentResults.length > 10) profile._recentResults.shift();
    profile.recentWins = profile._recentResults.filter(Boolean).length;
    profile.recentLosses = profile._recentResults.filter(r => !r).length;
  }

  /** Build summaries for all opponents of `myPlayerName` with ≥3 total actions */
  getOpponentSummaries(myPlayerName: string): OpponentSummary[] {
    const result: OpponentSummary[] = [];

    for (const [, profile] of this.profiles) {
      if (profile.name === myPlayerName) continue;
      if (profile._totalActions < 3) continue;

      const vpip = profile._totalActions > 0
        ? ((profile._calls + profile._raises + profile._allIns) / profile._totalActions)
        : 0;

      const recent = profile.recentActions
        .filter(a => a.action !== 'check')
        .slice(-5)
        .map(a => `${a.phase}:${a.action}${a.amount ? `(${a.amount})` : ''}`)
        .join(' → ');

      result.push({
        name: profile.name,
        style: profile.style,
        handsPlayed: profile.handsPlayed,
        winRate: profile.handsPlayed > 0 ? profile.handsWon / profile.handsPlayed : 0,
        vpip,
        pfr: profile.preflopRaiseRate,
        postflopAgg: profile.postflopAggression,
        foldToBet: profile.foldToBetRate,
        avgBetSize: profile.avgBetSize,
        recentActions: recent || 'none',
        exploitTips: this.getExploitTips(profile),
      });
    }

    return result;
  }

  /* ---------- internals ---------- */

  private getOrCreate(playerName: string): OpponentProfile {
    let profile = this.profiles.get(playerName);
    if (!profile) {
      profile = this.createEmptyProfile(playerName);
      this.profiles.set(playerName, profile);
    }
    return profile;
  }

  private createEmptyProfile(name: string): OpponentProfile {
    return {
      name,
      handsPlayed: 0, handsWon: 0,
      _folds: 0, _checks: 0, _calls: 0, _raises: 0, _allIns: 0,
      _totalActions: 0,
      _totalBetAmount: 0, _totalPotAtBet: 0,
      _facingBetActions: 0, _foldsToBet: 0,
      _preflopRaises: 0, _preflopActions: 0,
      _postflopAggActions: 0, _postflopPassActions: 0,
      phaseStats: {},
      foldRate: 0, raiseRate: 0, callRate: 0, checkRate: 0, allInRate: 0,
      avgBetSize: 0, preflopRaiseRate: 0, postflopAggression: 0, foldToBetRate: 0,
      style: 'unknown',
      recentActions: [],
      _recentResults: [], recentWins: 0, recentLosses: 0,
    };
  }

  private ensurePhaseStats(profile: OpponentProfile, phase: string): PhaseStats {
    if (!profile.phaseStats[phase]) {
      profile.phaseStats[phase] = { folds: 0, checks: 0, calls: 0, raises: 0, allIns: 0, total: 0 };
    }
    return profile.phaseStats[phase];
  }

  private recomputeRates(p: OpponentProfile): void {
    const t = p._totalActions || 1;
    p.foldRate = p._folds / t;
    p.raiseRate = p._raises / t;
    p.callRate = p._calls / t;
    p.checkRate = p._checks / t;
    p.allInRate = p._allIns / t;
    p.avgBetSize = p._totalPotAtBet > 0 ? p._totalBetAmount / p._totalPotAtBet : 0;
    p.preflopRaiseRate = p._preflopActions > 0 ? p._preflopRaises / p._preflopActions : 0;

    const postTotal = p._postflopAggActions + p._postflopPassActions;
    p.postflopAggression = postTotal > 0 ? p._postflopAggActions / postTotal : 0;
    p.foldToBetRate = p._facingBetActions > 0 ? p._foldsToBet / p._facingBetActions : 0;

    const vpip = (p._calls + p._raises + p._allIns) / t;
    const agg = p.raiseRate + p.allInRate;

    if (t < 5) { p.style = 'unknown'; }
    else if (vpip > 0.75 && agg > 0.45) { p.style = 'maniac'; }
    else if (vpip < 0.25 && agg < 0.15) { p.style = 'rock'; }
    else if (vpip > 0.55 && agg > 0.30) { p.style = 'loose-aggressive'; }
    else if (vpip > 0.55) { p.style = 'loose-passive'; }
    else if (agg > 0.30) { p.style = 'tight-aggressive'; }
    else { p.style = 'tight-passive'; }
  }

  private getExploitTips(p: OpponentProfile): string[] {
    const tips: string[] = [];
    if (p.foldToBetRate > 0.6) tips.push('High fold-to-bet — bluff more often');
    if (p.foldToBetRate < 0.2 && p._facingBetActions >= 5) tips.push('Rarely folds to bets — value bet heavily, avoid bluffs');
    if (p.preflopRaiseRate > 0.5) tips.push('Very aggressive preflop — tighten up, 3-bet strong hands');
    if (p.preflopRaiseRate < 0.1 && p._preflopActions >= 5) tips.push('Passive preflop — steal blinds frequently');
    if (p.postflopAggression > 0.6) tips.push('Aggressive postflop — check-raise traps effective');
    if (p.postflopAggression < 0.2 && p._postflopAggActions + p._postflopPassActions >= 5) {
      tips.push('Passive postflop — bet for thin value');
    }
    if (p.allInRate > 0.15) tips.push('Frequent all-ins — only call with premium hands');
    if (p.recentLosses >= 4) tips.push('On a losing streak — may be tilted, expect erratic play');
    if (p.recentWins >= 4) tips.push('On a hot streak — may be overconfident');
    return tips;
  }
}

/* ================================================================== */
/*  Layer 2 — HandMemory (per-room, per-hand, per-bot view)            */
/* ================================================================== */

/**
 * Stores the raw action log for one hand.
 * Each action carries `facingBet` context so Layer 1 can merge accurately.
 *
 * Multiple bots share the same underlying action array (public information),
 * but each bot queries it independently (filtered by what it can see).
 */
interface RawAction {
  playerId: string;
  playerName: string;
  action: ActionType;
  amount?: number;
  potSize: number;
  phase: GamePhase;
  /** Was the player facing a bet when they acted? */
  facingBet: boolean;
}

export class HandMemory {
  private actions: RawAction[] = [];
  private round = 0;

  startHand(round: number): void {
    this.actions = [];
    this.round = round;
  }

  getRound(): number {
    return this.round;
  }

  recordAction(
    playerId: string,
    playerName: string,
    action: ActionType,
    amount: number | undefined,
    potSize: number,
    phase: GamePhase,
    currentBet: number,
    playerBet: number,
  ): void {
    const facingBet = currentBet > playerBet;
    this.actions.push({ playerId, playerName, action, amount, potSize, phase, facingBet });
  }

  /**
   * Get the public action log visible to any bot.
   * This is purely public information — no hole cards leaked.
   */
  getActionLog(): HandActionEntry[] {
    return this.actions.map(a => ({
      playerId: a.playerId,
      playerName: a.playerName,
      action: a.action,
      amount: a.amount,
      potSize: a.potSize,
      phase: a.phase,
    }));
  }

  /**
   * Get all raw actions grouped by player name, for merging into Layer 1.
   * Called once at hand end.
   */
  getActionsByPlayer(): Map<string, Array<{
    action: ActionType;
    amount?: number;
    potSize?: number;
    phase: GamePhase;
    facingBet: boolean;
  }>> {
    const map = new Map<string, Array<{
      action: ActionType;
      amount?: number;
      potSize?: number;
      phase: GamePhase;
      facingBet: boolean;
    }>>();

    for (const a of this.actions) {
      let list = map.get(a.playerName);
      if (!list) {
        list = [];
        map.set(a.playerName, list);
      }
      list.push({
        action: a.action,
        amount: a.amount,
        potSize: a.potSize,
        phase: a.phase,
        facingBet: a.facingBet,
      });
    }

    return map;
  }
}

/* ================================================================== */
/*  RoomMemory — combines Layer 1 + Layer 2 for a single room          */
/* ================================================================== */

/**
 * Per-room coordinator that owns a HandMemory (Layer 2) and
 * references the singleton GlobalMemory (Layer 1).
 */
export class RoomMemory {
  private handMemory = new HandMemory();

  /** Start a new hand — resets the hand-level action log */
  startHand(round: number): void {
    this.handMemory.startHand(round);
  }

  /** Record a player action during the current hand */
  recordAction(
    playerId: string,
    playerName: string,
    action: ActionType,
    amount: number | undefined,
    potSize: number,
    phase: GamePhase,
    currentBet: number,
    playerBet: number,
  ): void {
    this.handMemory.recordAction(playerId, playerName, action, amount, potSize, phase, currentBet, playerBet);
  }

  /**
   * Called at hand end: merge all hand actions into GlobalMemory (Layer 1)
   * and record win/loss results.
   */
  finalizeHand(winnerNames: Set<string>, participantNames: string[]): void {
    const round = this.handMemory.getRound();
    const actionsByPlayer = this.handMemory.getActionsByPlayer();

    // Merge actions into global profiles
    for (const [playerName, actions] of actionsByPlayer) {
      globalMemory.mergeHandActions(playerName, actions, round);
    }

    // Record hand results for all participants
    for (const name of participantNames) {
      globalMemory.recordHandResult(name, winnerNames.has(name));
    }
  }

  /** Get the current hand's public action log (Layer 2) — same for all bots */
  getHandActionLog(): HandActionEntry[] {
    return this.handMemory.getActionLog();
  }

  /** Get global opponent summaries (Layer 1), excluding `myPlayerName` */
  getOpponentSummaries(myPlayerName: string): OpponentSummary[] {
    return globalMemory.getOpponentSummaries(myPlayerName);
  }
}

/* ================================================================== */
/*  Singletons & exports                                               */
/* ================================================================== */

/** Single global memory instance (Layer 1) — persists across rooms */
const globalMemory = new GlobalMemory();

/** Per-room memory instances */
const roomMemories = new Map<string, RoomMemory>();

export function getRoomMemory(roomId: string): RoomMemory {
  let mem = roomMemories.get(roomId);
  if (!mem) {
    mem = new RoomMemory();
    roomMemories.set(roomId, mem);
  }
  return mem;
}

export function deleteRoomMemory(roomId: string): void {
  roomMemories.delete(roomId);
}
