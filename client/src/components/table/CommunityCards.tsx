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
          className="w-8 h-11 sm:w-14 sm:h-20 rounded-lg border border-dashed border-white/10 bg-white/5"
        />
      ))}
    </div>
  );
}
