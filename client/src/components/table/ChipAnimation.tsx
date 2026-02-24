import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface FlyingChip {
  id: string;
  targetX: string;
  targetY: string;
  amount: number;
  delay: number;
}

interface ChipAnimationProps {
  /** winner positions: array of { x, y, amount } for each winner */
  winners: { x: string; y: string; amount: number }[];
  /** trigger key — changes when new showdown happens */
  triggerKey: string | null;
}

/**
 * Renders multiple chip tokens that fly from the center of the table
 * to each winner's seat position.
 */
export default function ChipAnimation({ winners, triggerKey }: ChipAnimationProps) {
  const [chips, setChips] = useState<FlyingChip[]>([]);

  useEffect(() => {
    if (!triggerKey || winners.length === 0) {
      setChips([]);
      return;
    }

    // Generate multiple chip tokens per winner for a richer effect
    const newChips: FlyingChip[] = [];
    winners.forEach((w, wi) => {
      const chipCount = Math.min(Math.max(Math.ceil(w.amount / 100), 3), 8);
      for (let i = 0; i < chipCount; i++) {
        newChips.push({
          id: `${triggerKey}-${wi}-${i}`,
          targetX: w.x,
          targetY: w.y,
          amount: w.amount,
          delay: 0.3 + i * 0.08 + wi * 0.15,
        });
      }
    });

    setChips(newChips);

    // Clear chips after animation completes
    const timer = setTimeout(() => setChips([]), 3000);
    return () => clearTimeout(timer);
  }, [triggerKey]);

  return (
    <AnimatePresence>
      {chips.map((chip) => (
        <motion.div
          key={chip.id}
          className="absolute z-30 pointer-events-none"
          style={{ left: '50%', top: '50%' }}
          initial={{
            x: '-50%',
            y: '-50%',
            scale: 0.6,
            opacity: 1,
          }}
          animate={{
            left: chip.targetX,
            top: chip.targetY,
            scale: [0.6, 1.1, 0.9],
            opacity: [1, 1, 0],
          }}
          transition={{
            duration: 0.8,
            delay: chip.delay,
            ease: [0.25, 0.46, 0.45, 0.94],
            opacity: { duration: 1.0, delay: chip.delay + 0.3 },
          }}
          exit={{ opacity: 0, scale: 0 }}
        >
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-gold-400 via-yellow-400 to-gold-600 border-2 border-gold-300 shadow-[0_0_12px_rgba(212,175,55,0.6)] flex items-center justify-center">
            <span className="text-[8px] font-black text-amber-900">$</span>
          </div>
        </motion.div>
      ))}
    </AnimatePresence>
  );
}
