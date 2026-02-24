import { Player, GamePhase, GameState } from '@texas-agent/shared';
import { formatChips } from '@texas-agent/shared';
import PokerCard from '../table/PokerCard';
import { motion } from 'framer-motion';
import { Bot, User, Crown } from 'lucide-react';
import { useI18n } from '../../i18n';

interface PlayerSeatProps {
  player: Player;
  isCurrentTurn: boolean;
  isSelf: boolean;
  phase: GamePhase;
  position: { x: string; y: string };
  isWinner?: boolean;
}

export default function PlayerSeat({ player, isCurrentTurn, isSelf, phase, position, isWinner }: PlayerSeatProps) {
  // Show cards: self always, showdown for non-folded, winner always (even early win)
  const showCards = isSelf || (phase === 'showdown' && !player.isFolded) || !!isWinner;
  const { t } = useI18n();

  return (
    <motion.div
      className="absolute flex flex-col items-center gap-1 -translate-x-1/2 -translate-y-1/2"
      style={{ left: position.x, top: position.y }}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
    >
      {/* Winner crown */}
      {isWinner && (
        <motion.div
          initial={{ scale: 0, y: 10 }}
          animate={{ scale: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 15 }}
          className="winner-flash"
        >
          <Crown size={24} className="text-gold-400 drop-shadow-[0_0_8px_rgba(212,175,55,0.8)]" fill="rgba(212,175,55,0.6)" />
        </motion.div>
      )}

      {/* Cards */}
      <div className="flex gap-0.5 mb-1">
        {player.cards.length > 0 && !player.isFolded ? (
          player.cards.map((card, i) => (
            <PokerCard
              key={i}
              card={showCards ? card : undefined}
              faceDown={!showCards}
              size="sm"
              delay={i * 0.1}
            />
          ))
        ) : player.isFolded ? (
          <span className="text-xs text-gray-500 italic">{t('player.folded')}</span>
        ) : null}
      </div>

      {/* Player info */}
      <div
        className={`relative rounded-xl px-3 py-2 min-w-[100px] text-center transition-all duration-300
          ${isCurrentTurn ? 'ring-2 ring-gold-400 animate-pulse-gold' : ''}
          ${isWinner ? 'ring-2 ring-gold-400 winner-glow' : ''}
          ${player.isFolded ? 'opacity-40' : ''}
          bg-casino-card/90 backdrop-blur-sm border border-casino-border/50`}
      >
        {/* Role badges */}
        <div className="absolute -top-2 left-1/2 -translate-x-1/2 flex gap-1">
          {player.isDealer && (
            <span className="px-1.5 py-0.5 text-[9px] font-bold bg-gold-500 text-black rounded-full">D</span>
          )}
          {player.isSmallBlind && (
            <span className="px-1.5 py-0.5 text-[9px] font-bold bg-blue-500 text-white rounded-full">SB</span>
          )}
          {player.isBigBlind && (
            <span className="px-1.5 py-0.5 text-[9px] font-bold bg-red-500 text-white rounded-full">BB</span>
          )}
        </div>

        {/* Avatar & Name */}
        <div className="flex items-center justify-center gap-1.5 mb-1">
          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs
            ${player.isAI ? 'bg-purple-600/50' : 'bg-blue-600/50'}`}>
            {player.isAI ? <Bot size={14} /> : <User size={14} />}
          </div>
          <span className="text-xs font-semibold text-white truncate max-w-[70px]">
            {isSelf ? t('player.you') : player.name}
          </span>
        </div>

        {/* Chips */}
        <div className="text-gold-400 text-xs font-mono font-bold">
          ${formatChips(player.chips)}
        </div>

        {/* All-in badge */}
        {player.isAllIn && (
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2">
            <span className="px-2 py-0.5 text-[9px] font-bold bg-red-600 text-white rounded-full uppercase tracking-wider">
              {t('player.allIn')}
            </span>
          </div>
        )}
      </div>

      {/* Bet chip - displayed separately outside the player card for visibility */}
      {player.currentBet > 0 && (
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="mt-1 flex items-center gap-1 px-2.5 py-1 rounded-full bg-black/60 border border-gold-500/50 backdrop-blur-sm"
        >
          <div className="w-4 h-4 rounded-full bg-gradient-to-br from-gold-400 to-gold-600 border border-gold-400/50 flex items-center justify-center shadow-md">
            <span className="text-[7px] font-bold text-black">$</span>
          </div>
          <span className="text-gold-400 text-xs font-bold tabular-nums">
            {formatChips(player.currentBet)}
          </span>
        </motion.div>
      )}

      {/* Folded label */}
      {player.isFolded && (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-[10px] text-gray-500 mt-0.5"
        >
          {t('player.folded')}
        </motion.div>
      )}
    </motion.div>
  );
}
