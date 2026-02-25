import { useRef, useMemo, useState, useEffect } from 'react';
import { GameState } from '@texas-agent/shared';
import CommunityCards from './CommunityCards';
import Pot from './Pot';
import PlayerSeat from '../player/PlayerSeat';
import ChipAnimation from './ChipAnimation';
import RaiseEffect from './RaiseEffect';
import { useI18n } from '../../i18n';

interface PokerTableProps {
  gameState: GameState;
  myPlayerId: string;
}

const SEAT_POSITIONS: Record<number, { x: string; y: string }[]> = {
  2: [
    { x: '50%', y: '75%' },
    { x: '50%', y: '12%' },
  ],
  3: [
    { x: '50%', y: '75%' },
    { x: '15%', y: '30%' },
    { x: '85%', y: '30%' },
  ],
  4: [
    { x: '50%', y: '75%' },
    { x: '10%', y: '50%' },
    { x: '50%', y: '12%' },
    { x: '90%', y: '50%' },
  ],
  5: [
    { x: '50%', y: '75%' },
    { x: '10%', y: '60%' },
    { x: '20%', y: '15%' },
    { x: '80%', y: '15%' },
    { x: '90%', y: '60%' },
  ],
  6: [
    { x: '50%', y: '75%' },
    { x: '8%', y: '60%' },
    { x: '15%', y: '15%' },
    { x: '50%', y: '8%' },
    { x: '85%', y: '15%' },
    { x: '92%', y: '60%' },
  ],
  7: [
    { x: '50%', y: '78%' },
    { x: '8%', y: '65%' },
    { x: '8%', y: '30%' },
    { x: '30%', y: '8%' },
    { x: '70%', y: '8%' },
    { x: '92%', y: '30%' },
    { x: '92%', y: '65%' },
  ],
  8: [
    { x: '50%', y: '78%' },
    { x: '12%', y: '72%' },
    { x: '5%', y: '40%' },
    { x: '20%', y: '10%' },
    { x: '50%', y: '5%' },
    { x: '80%', y: '10%' },
    { x: '95%', y: '40%' },
    { x: '88%', y: '72%' },
  ],
  9: [
    { x: '50%', y: '78%' },
    { x: '12%', y: '75%' },
    { x: '5%', y: '45%' },
    { x: '15%', y: '12%' },
    { x: '38%', y: '5%' },
    { x: '62%', y: '5%' },
    { x: '85%', y: '12%' },
    { x: '95%', y: '45%' },
    { x: '88%', y: '75%' },
  ],
};

function getPositions(count: number) {
  return SEAT_POSITIONS[Math.min(Math.max(count, 2), 9)] || SEAT_POSITIONS[6];
}

export default function PokerTable({ gameState, myPlayerId }: PokerTableProps) {
  const positions = getPositions(gameState.players.length);
  const { t, tHand } = useI18n();

  // Build winner IDs set
  const winnerIds = new Set(gameState.winners?.map(w => w.playerId) || []);

  // Reorder so self is always at bottom
  const selfIdx = gameState.players.findIndex(p => p.id === myPlayerId);
  const ordered = selfIdx >= 0
    ? [...gameState.players.slice(selfIdx), ...gameState.players.slice(0, selfIdx)]
    : gameState.players;

  // Chip fly animation: compute winner positions in the reordered layout
  const prevRoundRef = useRef<number | null>(null);
  const chipTriggerRef = useRef<string | null>(null);

  if (gameState.winners && gameState.winners.length > 0 && gameState.round !== prevRoundRef.current) {
    prevRoundRef.current = gameState.round;
    chipTriggerRef.current = `${gameState.id}-${gameState.round}`;
  } else if (!gameState.winners || gameState.winners.length === 0) {
    chipTriggerRef.current = null;
  }

  const winnerPositions = useMemo(() => {
    if (!gameState.winners || gameState.winners.length === 0) return [];
    return gameState.winners.map(w => {
      const orderIdx = ordered.findIndex(p => p.id === w.playerId);
      const pos = positions[orderIdx] || { x: '50%', y: '50%' };
      return { x: pos.x, y: pos.y, amount: w.amount };
    });
  }, [chipTriggerRef.current]);

  // Raise / All-in effect tracking
  const [raiseEffect, setRaiseEffect] = useState<{
    key: string; position: { x: string; y: string }; isAllIn: boolean;
  } | null>(null);
  const [screenShake, setScreenShake] = useState(false);
  const prevActionRef = useRef<string | null>(null);

  // Compute a stable string key for lastAction to avoid re-triggering on object reference changes
  const la = gameState.lastAction;
  const lastActionKey = la ? `${la.playerId}-${la.action.type}-${la.action.amount || 0}-${gameState.round}` : null;

  useEffect(() => {
    if (!la || !lastActionKey) return;
    if (lastActionKey === prevActionRef.current) return;
    prevActionRef.current = lastActionKey;

    if (la.action.type === 'raise' || la.action.type === 'all-in') {
      const orderIdx = ordered.findIndex(p => p.id === la.playerId);
      const pos = positions[orderIdx] || { x: '50%', y: '50%' };
      setRaiseEffect({ key: lastActionKey, position: pos, isAllIn: la.action.type === 'all-in' });
      setScreenShake(true);
      setTimeout(() => setScreenShake(false), 400);
    }
  }, [lastActionKey]);

  const phaseKey = `phase.${gameState.phase}`;
  const phaseLabel = t(phaseKey);

  return (
    <div className={`relative w-full h-full ${screenShake ? 'screen-shake' : ''}`}>
      {/* Table surface */}
      <div className="absolute inset-[2%] sm:inset-[5%] rounded-[50%] bg-felt-gradient shadow-2xl border-4 sm:border-8 border-amber-900/60"
        style={{ boxShadow: 'inset 0 0 60px rgba(0,0,0,0.4), 0 0 40px rgba(0,0,0,0.6)' }}
      >
        {/* Inner rail */}
        <div className="absolute inset-2 sm:inset-3 rounded-[50%] border border-gold-500/10" />

        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 sm:gap-3">
          {/* Phase indicator */}
          <div className="px-2 py-0.5 sm:px-3 sm:py-1 rounded-full bg-black/30 text-gray-300 text-[10px] sm:text-xs font-medium uppercase tracking-wider">
            {phaseLabel} · {t('game.round')} {gameState.round}
          </div>

          {/* Community cards */}
          <CommunityCards cards={gameState.communityCards} />

          {/* Pot */}
          <Pot amount={gameState.pot} />

          {/* Winners */}
          {gameState.winners && gameState.winners.length > 0 && (
            <div className="flex flex-col items-center gap-1 mt-1 sm:mt-2">
              {gameState.winners.map((w, i) => {
                const p = gameState.players.find(pl => pl.id === w.playerId);
                return (
                  <div key={i} className="px-2 py-1 sm:px-3 sm:py-1.5 rounded-full bg-gold-500/20 border border-gold-500/40 text-gold-400 text-[10px] sm:text-sm font-semibold winner-flash flex items-center gap-1 sm:gap-1.5">
                    <span className="text-xs sm:text-base">👑</span>
                    {p?.name} wins ${w.amount} ({tHand(w.handName)})
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Player seats */}
      {ordered.map((player, i) => {
        const pos = positions[i] || { x: '50%', y: '50%' };
        const origIdx = gameState.players.findIndex(p => p.id === player.id);
        const isCurrentTurn = origIdx === gameState.currentPlayerIndex;

        return (
          <PlayerSeat
            key={player.id}
            player={player}
            isCurrentTurn={isCurrentTurn}
            isSelf={player.id === myPlayerId}
            phase={gameState.phase}
            position={pos}
            isWinner={winnerIds.has(player.id)}
          />
        );
      })}

      {/* Chip fly animation to winner */}
      <ChipAnimation
        winners={winnerPositions}
        triggerKey={chipTriggerRef.current}
      />

      {/* Raise / All-in shockwave effect */}
      <RaiseEffect
        triggerKey={raiseEffect?.key ?? null}
        position={raiseEffect?.position ?? null}
        isAllIn={raiseEffect?.isAllIn}
      />
    </div>
  );
}
