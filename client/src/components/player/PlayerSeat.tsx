import { useMemo, useState, useRef, useCallback } from 'react';
import { Player, Card, GamePhase, evaluateHand } from '@texas-agent/shared';
import { formatChips } from '@texas-agent/shared';
import PokerCard from '../table/PokerCard';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, User, Crown } from 'lucide-react';
import { useI18n } from '../../i18n';
import { useGameStore } from '../../stores/game-store';

const REACTION_EMOJIS = [
  { emoji: '🍅', label: '番茄' },
  { emoji: '🥚', label: '鸡蛋' },
  { emoji: '🌹', label: '鲜花' },
  { emoji: '👍', label: '点赞' },
  { emoji: '💰', label: '打赏' },
];

interface PlayerSeatProps {
  player: Player;
  isCurrentTurn: boolean;
  isSelf: boolean;
  phase: GamePhase;
  position: { x: string; y: string };
  isWinner?: boolean;
  communityCards?: Card[];
  isMultiplayer?: boolean;
  compact?: boolean;
}

export default function PlayerSeat({ player, isCurrentTurn, isSelf, phase, position, isWinner, communityCards = [], isMultiplayer = false, compact = false }: PlayerSeatProps) {
  // Show cards: self always, showdown for non-folded (server controls which cards are real vs hidden)
  const showCards = isSelf || (phase === 'showdown' && !player.isFolded);
  const { t, tHand } = useI18n();

  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { sendReaction, myPlayerId } = useGameStore();

  // Evaluate best hand for players whose cards are visible and community cards exist
  const bestHand = useMemo(() => {
    if (!showCards || player.isFolded || player.cards.length === 0) return null;
    // Only evaluate when there are community cards (flop+)
    if (communityCards.length === 0) return null;
    // Check that cards are real (not face-down placeholders — face-down cards have no rank/suit)
    const hasRealCards = player.cards.every(c => c.rank && c.suit);
    if (!hasRealCards) return null;
    try {
      const evaluation = evaluateHand(player.cards, communityCards);
      return evaluation.rankName;
    } catch {
      return null;
    }
  }, [showCards, player.cards, player.isFolded, communityCards]);

  const handleLongPressStart = useCallback(() => {
    if (!isMultiplayer || isSelf) return;
    longPressTimer.current = setTimeout(() => {
      setShowEmojiPicker(true);
    }, 600);
  }, [isMultiplayer, isSelf]);

  const handleLongPressEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    if (!isMultiplayer || isSelf) return;
    e.preventDefault();
    setShowEmojiPicker(true);
  }, [isMultiplayer, isSelf]);

  const handleSendReaction = (emoji: string) => {
    sendReaction(player.id, emoji);
    setShowEmojiPicker(false);
  };

  return (
    <motion.div
      className="absolute flex flex-col items-center gap-0.5 sm:gap-1 -translate-x-1/2 -translate-y-1/2"
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
          <Crown size={16} className="text-gold-400 drop-shadow-[0_0_8px_rgba(212,175,55,0.8)] sm:w-6 sm:h-6" fill="rgba(212,175,55,0.6)" />
        </motion.div>
      )}

      {/* Cards */}
      <div className="flex gap-0.5 mb-0.5 sm:mb-1">
        {player.cards.length > 0 && !player.isFolded ? (
          player.cards.map((card, i) => (
            <PokerCard
              key={i}
              card={showCards ? card : undefined}
              faceDown={!showCards}
              size="sm"
              responsiveSize
              delay={i * 0.1}
            />
          ))
        ) : player.isFolded ? (
          <span className="text-[10px] sm:text-xs text-gray-500 italic">{t('player.folded')}</span>
        ) : null}
      </div>

      {/* Player info — with long press / right-click for emoji picker */}
      <div
        className={`relative rounded-lg sm:rounded-xl ${compact ? 'px-1.5 py-1' : 'px-2.5 py-1.5 sm:px-3 sm:py-2'} ${compact ? 'min-w-[56px]' : 'min-w-[76px] sm:min-w-[100px]'} text-center transition-all duration-300
          ${isCurrentTurn ? 'ring-2 ring-gold-400 animate-pulse-gold' : ''}
          ${isWinner ? 'ring-2 ring-gold-400 winner-glow' : ''}
          ${player.isFolded ? 'opacity-40' : ''}
          bg-casino-card/90 backdrop-blur-sm border border-casino-border/50
          ${isMultiplayer && !isSelf ? 'cursor-pointer select-none' : ''}`}
        onMouseDown={handleLongPressStart}
        onMouseUp={handleLongPressEnd}
        onMouseLeave={handleLongPressEnd}
        onTouchStart={handleLongPressStart}
        onTouchEnd={handleLongPressEnd}
        onContextMenu={handleContextMenu}
      >
        {/* Role badges */}
        <div className="absolute -top-2 left-1/2 -translate-x-1/2 flex gap-0.5 sm:gap-1">
          {player.isDealer && (
            <span className="px-1 py-0.5 text-[7px] sm:text-[9px] font-bold bg-gold-500 text-black rounded-full">D</span>
          )}
          {player.isSmallBlind && (
            <span className="px-1 py-0.5 text-[7px] sm:text-[9px] font-bold bg-blue-500 text-white rounded-full">SB</span>
          )}
          {player.isBigBlind && (
            <span className="px-1 py-0.5 text-[7px] sm:text-[9px] font-bold bg-red-500 text-white rounded-full">BB</span>
          )}
        </div>

        {/* Avatar & Name */}
        <div className="flex items-center justify-center gap-1 sm:gap-1.5 mb-0.5 sm:mb-1">
          <div className={`${compact ? 'w-3 h-3' : 'w-4 h-4 sm:w-6 sm:h-6'} rounded-full flex items-center justify-center
            ${player.isAI ? 'bg-purple-600/50' : 'bg-blue-600/50'}`}>
            {player.isAI ? <Bot size={compact ? 8 : 10} className={compact ? '' : 'sm:w-3.5 sm:h-3.5'} /> : <User size={compact ? 8 : 10} className={compact ? '' : 'sm:w-3.5 sm:h-3.5'} />}
          </div>
          <span className={`${compact ? 'text-[9px] max-w-[44px]' : 'text-[11px] sm:text-xs max-w-[56px] sm:max-w-[70px]'} font-semibold text-white truncate`}>
            {isSelf ? t('player.you') : player.name}
          </span>
        </div>

        {/* Chips */}
        <div className={`text-gold-400 ${compact ? 'text-[9px]' : 'text-[11px] sm:text-xs'} font-mono font-bold`}>
          ${formatChips(player.chips)}
        </div>

        {/* Best hand rank (shown when cards are visible and community cards exist) */}
        {bestHand && (
          <div className="text-[9px] sm:text-[10px] font-medium text-emerald-400/90 mt-0.5 truncate max-w-[72px] sm:max-w-[90px]">
            {tHand(bestHand)}
          </div>
        )}

        {/* All-in badge */}
        {player.isAllIn && (
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2">
            <span className="px-1.5 py-0.5 text-[7px] sm:text-[9px] font-bold bg-red-600 text-white rounded-full uppercase tracking-wider">
              {t('player.allIn')}
            </span>
          </div>
        )}

        {/* Emoji picker popup */}
        <AnimatePresence>
          {showEmojiPicker && (
            <>
              {/* Backdrop to close picker */}
              <div
                className="fixed inset-0 z-[60]"
                onClick={() => setShowEmojiPicker(false)}
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.8, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.8, y: 10 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                className="absolute -top-14 left-1/2 -translate-x-1/2 z-[61]
                  bg-casino-card/98 border border-casino-border/60 rounded-xl px-2 py-1.5
                  flex gap-1.5 shadow-2xl backdrop-blur-md"
                onClick={e => e.stopPropagation()}
              >
                {REACTION_EMOJIS.map(({ emoji, label }) => (
                  <button
                    key={emoji}
                    onClick={() => handleSendReaction(emoji)}
                    title={label}
                    className="text-xl sm:text-2xl hover:scale-125 transition-transform cursor-pointer leading-none p-0.5"
                  >
                    {emoji}
                  </button>
                ))}
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      {/* Bet chip — realistic poker chip style */}
      {player.currentBet > 0 && (
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="mt-0.5 sm:mt-1 flex items-center gap-0.5 sm:gap-1 px-1.5 py-0.5 sm:px-2.5 sm:py-1 rounded-full bg-black/60 border border-white/15 backdrop-blur-sm"
        >
          <div className="relative w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-gradient-to-br from-red-600 to-red-800 border-[1.5px] border-red-400 shadow-md shrink-0">
            <div className="absolute inset-[2px] rounded-full border border-white/20" />
          </div>
          <span className="text-gold-400 text-[10px] sm:text-xs font-bold tabular-nums">
            {formatChips(player.currentBet)}
          </span>
        </motion.div>
      )}

      {/* Folded label */}
      {player.isFolded && (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-[8px] sm:text-[10px] text-gray-500 mt-0.5"
        >
          {t('player.folded')}
        </motion.div>
      )}
    </motion.div>
  );
}
