import { Card } from '@texas-agent/shared';
import { SUIT_SYMBOLS, SUIT_COLORS } from '@texas-agent/shared';
import { motion } from 'framer-motion';

interface PokerCardProps {
  card?: Card;
  faceDown?: boolean;
  size?: 'sm' | 'md' | 'lg';
  delay?: number;
  /** When true, use responsive classes that shrink on mobile */
  responsiveSize?: boolean;
}

const sizeClasses = {
  sm: 'w-12 h-17 text-sm',
  md: 'w-16 h-22 text-base',
  lg: 'w-20 h-28 text-lg',
};

const responsiveSizeClasses = {
  sm: 'w-10 h-14 text-xs sm:w-12 sm:h-17 sm:text-sm',
  md: 'w-12 h-17 text-sm sm:w-16 sm:h-22 sm:text-base',
  lg: 'w-16 h-22 text-base sm:w-20 sm:h-28 sm:text-lg',
};

export default function PokerCard({ card, faceDown = false, size = 'md', delay = 0, responsiveSize = false }: PokerCardProps) {
  const sizeClass = responsiveSize ? responsiveSizeClasses[size] : sizeClasses[size];

  if (faceDown || !card) {
    return (
      <motion.div
        initial={{ scale: 0.5, opacity: 0, y: -40 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay }}
        className={`${sizeClass} rounded-lg card-back-3d poker-card-3d border border-blue-400/20 flex items-center justify-center`}
      >
        <div className="w-[80%] h-[80%] rounded-md border border-blue-300/15 bg-blue-900/30 flex items-center justify-center backdrop-blur-sm">
          <span className="text-blue-200/30 text-lg font-bold">♠</span>
        </div>
      </motion.div>
    );
  }

  const suitColor = SUIT_COLORS[card.suit];
  const suitSymbol = SUIT_SYMBOLS[card.suit];

  return (
    <motion.div
      initial={{ scale: 0.5, opacity: 0, rotateY: 180 }}
      animate={{ scale: 1, opacity: 1, rotateY: 0 }}
      transition={{ duration: 0.5, delay }}
      className={`${sizeClass} rounded-lg card-face-3d poker-card-3d border border-gray-200/80 flex flex-col p-0.5 sm:p-1 cursor-default select-none relative overflow-hidden`}
    >
      {/* Glossy highlight */}
      <div className="absolute inset-0 rounded-lg pointer-events-none"
        style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.4) 0%, transparent 40%, transparent 60%, rgba(0,0,0,0.03) 100%)' }} />

      <div className="flex flex-col items-start leading-none relative z-10">
        <span className="font-bold" style={{ color: suitColor }}>{card.rank}</span>
        <span style={{ color: suitColor }}>{suitSymbol}</span>
      </div>
      <div className="flex-1 flex items-center justify-center relative z-10">
        <span className={`${size === 'sm' ? 'text-lg sm:text-xl' : 'text-xl sm:text-3xl'} drop-shadow-sm`} style={{ color: suitColor }}>
          {suitSymbol}
        </span>
      </div>
      <div className="flex flex-col items-end leading-none rotate-180 relative z-10">
        <span className="font-bold" style={{ color: suitColor }}>{card.rank}</span>
        <span style={{ color: suitColor }}>{suitSymbol}</span>
      </div>
    </motion.div>
  );
}
