import { Card } from '@texas-agent/shared';
import PokerCard from '../table/PokerCard';
import { motion, AnimatePresence } from 'framer-motion';

interface PlayerCardsProps {
  cards: Card[];
  showCards: boolean;
  isFolded: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export default function PlayerCards({ cards, showCards, isFolded, size = 'sm' }: PlayerCardsProps) {
  if (isFolded) {
    return (
      <motion.div
        initial={{ opacity: 1 }}
        animate={{ opacity: 0.3 }}
        className="flex gap-0.5"
      >
        <div className={`${size === 'sm' ? 'w-10 h-14 sm:w-12 sm:h-17' : 'w-12 h-17 sm:w-16 sm:h-22'} rounded-lg bg-gray-700/50 border border-gray-600/30 flex items-center justify-center`}>
          <span className="text-gray-600 text-xs italic">✕</span>
        </div>
        <div className={`${size === 'sm' ? 'w-10 h-14 sm:w-12 sm:h-17' : 'w-12 h-17 sm:w-16 sm:h-22'} rounded-lg bg-gray-700/50 border border-gray-600/30 flex items-center justify-center`}>
          <span className="text-gray-600 text-xs italic">✕</span>
        </div>
      </motion.div>
    );
  }

  if (cards.length === 0) return null;

  return (
    <AnimatePresence>
      <div className="flex gap-0.5">
        {cards.map((card, i) => (
          <PokerCard
            key={`${card.rank}-${card.suit}-${i}`}
            card={showCards ? card : undefined}
            faceDown={!showCards}
            size={size}
            delay={i * 0.1}
          />
        ))}
      </div>
    </AnimatePresence>
  );
}
