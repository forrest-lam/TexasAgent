import { Card } from '@texas-agent/shared';
import PokerCard from './PokerCard';
import { motion } from 'framer-motion';

interface CommunityCardsProps {
  cards: Card[];
}

export default function CommunityCards({ cards }: CommunityCardsProps) {
  return (
    <div className="flex items-center justify-center gap-1 sm:gap-2">
      {cards.map((card, i) => (
        <PokerCard key={`${card.rank}-${card.suit}-${i}`} card={card} size="sm" responsiveSize delay={i * 0.15} />
      ))}
      {Array.from({ length: 5 - cards.length }).map((_, i) => (
        <motion.div
          key={`empty-${i}`}
          className="w-10 h-14 sm:w-12 sm:h-17 rounded-lg border border-dashed border-white/8 bg-white/3"
          style={{ boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.2)' }}
        />
      ))}
    </div>
  );
}
