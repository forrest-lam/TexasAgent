import { formatChips } from '@texas-agent/shared';
import { motion, AnimatePresence } from 'framer-motion';

interface PotProps {
  amount: number;
}

export default function Pot({ amount }: PotProps) {
  if (amount === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="flex items-center gap-1 sm:gap-2 px-2 py-1 sm:px-4 sm:py-1.5 rounded-full bg-black/40 border border-gold-500/30 backdrop-blur-sm"
      >
        <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-gradient-to-br from-gold-400 to-gold-600 border border-gold-500 shadow-md flex items-center justify-center">
          <span className="text-[6px] sm:text-[8px] font-bold text-black">$</span>
        </div>
        <span className="text-gold-400 font-bold text-sm sm:text-lg tabular-nums">
          {formatChips(amount)}
        </span>
      </motion.div>
    </AnimatePresence>
  );
}
