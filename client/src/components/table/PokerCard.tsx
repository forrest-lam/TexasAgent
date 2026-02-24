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
  sm: 'w-10 h-14 text-xs',
  md: 'w-14 h-20 text-sm',
  lg: 'w-18 h-26 text-base',
};

const responsiveSizeClasses = {
  sm: 'w-8 h-11 text-[10px] sm:w-10 sm:h-14 sm:text-xs',
  md: 'w-10 h-14 text-xs sm:w-14 sm:h-20 sm:text-sm',
  lg: 'w-14 h-20 text-sm sm:w-18 sm:h-26 sm:text-base',
};

export default function PokerCard({ card, faceDown = false, size = 'md', delay = 0, responsiveSize = false }: PokerCardProps) {
  const sizeClass = responsiveSize ? responsiveSizeClasses[size] : sizeClasses[size];

  if (faceDown || !card) {
    return (
      <motion.div
        initial={{ scale: 0.5, opacity: 0, y: -40 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay }}
        className={`${sizeClass} rounded-lg bg-gradient-to-br from-blue-900 to-blue-700 border border-blue-500/30 shadow-lg flex items-center justify-center`}
      >
        <div className="w-[80%] h-[80%] rounded border border-blue-400/20 bg-blue-800/50 flex items-center justify-center">
          <span className="text-blue-300/50 text-lg font-bold">♠</span>
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
      className={`${sizeClass} rounded-lg bg-white shadow-lg border border-gray-200 flex flex-col p-0.5 sm:p-1 cursor-default select-none relative overflow-hidden`}
    >
      <div className="flex flex-col items-start leading-none">
        <span className="font-bold" style={{ color: suitColor }}>{card.rank}</span>
        <span style={{ color: suitColor }}>{suitSymbol}</span>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <span className={`${size === 'sm' ? 'text-base sm:text-lg' : 'text-lg sm:text-2xl'}`} style={{ color: suitColor }}>
          {suitSymbol}
        </span>
      </div>
      <div className="flex flex-col items-end leading-none rotate-180">
        <span className="font-bold" style={{ color: suitColor }}>{card.rank}</span>
        <span style={{ color: suitColor }}>{suitSymbol}</span>
      </div>
    </motion.div>
  );
}
