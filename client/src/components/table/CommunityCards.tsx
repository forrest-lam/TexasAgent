import { Card } from '@texas-agent/shared';
import PokerCard from './PokerCard';
import { motion } from 'framer-motion';

interface CommunityCardsProps {
  cards: Card[];
}

export default function CommunityCards({ cards }: CommunityCardsProps) {
  return (
    <div className="flex items-center justify-center gap-2">
      {cards.map((card, i) => (
        <PokerCard key={`${card.rank}-${card.suit}-${i}`} card={card} size="md" delay={i * 0.15} />
      ))}
      {Array.from({ length: 5 - cards.length }).map((_, i) => (
        <motion.div
          key={`empty-${i}`}
          className="w-14 h-20 rounded-lg border border-dashed border-white/10 bg-white/5"
        />
      ))}
    </div>
  );
}
