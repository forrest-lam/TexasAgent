import { formatChips } from '@texas-agent/shared';
import { motion, AnimatePresence } from 'framer-motion';

interface PotProps {
  amount: number;
}

/** Realistic poker chip stack for the pot display */
function ChipStack({ amount }: { amount: number }) {
  // Show 1-5 stacked chips based on pot size
  const chipCount = Math.min(Math.max(Math.ceil(amount / 200), 1), 5);
  const colors = [
    'from-red-600 to-red-800 border-red-400',
    'from-blue-600 to-blue-800 border-blue-400',
    'from-green-600 to-green-800 border-green-400',
    'from-purple-600 to-purple-800 border-purple-400',
    'from-gray-800 to-gray-950 border-gray-500',
  ];

  return (
    <div className="relative w-6 h-8 sm:w-7 sm:h-9">
      {Array.from({ length: chipCount }).map((_, i) => (
        <div
          key={i}
          className={`absolute left-0 w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-gradient-to-br ${colors[i % colors.length]}
            border-2 shadow-md`}
          style={{ bottom: `${i * 3}px`, zIndex: i }}
        >
          {/* Inner ring pattern */}
          <div className="absolute inset-[3px] rounded-full border border-white/20" />
          <div className="absolute inset-[5px] sm:inset-[6px] rounded-full border border-dashed border-white/15" />
        </div>
      ))}
    </div>
  );
}

export default function Pot({ amount }: PotProps) {
  if (amount === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="flex items-center gap-1.5 sm:gap-2.5 px-2.5 py-1 sm:px-4 sm:py-1.5 rounded-full bg-black/50 border border-white/10 backdrop-blur-sm"
      >
        <ChipStack amount={amount} />
        <span className="text-gold-400 font-bold text-sm sm:text-lg tabular-nums drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
          {formatChips(amount)}
        </span>
      </motion.div>
    </AnimatePresence>
  );
}
