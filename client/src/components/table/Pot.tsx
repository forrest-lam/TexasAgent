import { formatChips } from '@texas-agent/shared';
import { motion, AnimatePresence } from 'framer-motion';

interface PotProps {
  amount: number;
}

/** 3D-styled poker chip stack for the pot display */
function ChipStack({ amount }: { amount: number }) {
  const chipCount = Math.min(Math.max(Math.ceil(amount / 200), 1), 5);
  const colors = [
    { bg: 'from-red-500 to-red-700', edge: 'border-red-400', inner: 'border-red-300/30' },
    { bg: 'from-blue-500 to-blue-700', edge: 'border-blue-400', inner: 'border-blue-300/30' },
    { bg: 'from-green-500 to-green-700', edge: 'border-green-400', inner: 'border-green-300/30' },
    { bg: 'from-purple-500 to-purple-700', edge: 'border-purple-400', inner: 'border-purple-300/30' },
    { bg: 'from-gray-700 to-gray-900', edge: 'border-gray-500', inner: 'border-gray-400/30' },
  ];

  return (
    <div className="relative w-6 h-8 sm:w-7 sm:h-9" style={{ transformStyle: 'preserve-3d' }}>
      {Array.from({ length: chipCount }).map((_, i) => {
        const c = colors[i % colors.length];
        return (
          <div
            key={i}
            className={`absolute left-0 w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-gradient-to-br ${c.bg}
              border-2 ${c.edge} chip-3d`}
            style={{ bottom: `${i * 4}px`, zIndex: i }}
          >
            {/* Inner ring */}
            <div className={`absolute inset-[3px] rounded-full border ${c.inner}`} />
            {/* Dashed pattern ring */}
            <div className="absolute inset-[5px] sm:inset-[6px] rounded-full border border-dashed border-white/10" />
            {/* Top highlight for 3D look */}
            <div className="absolute inset-0 rounded-full"
              style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.2) 0%, transparent 50%, rgba(0,0,0,0.15) 100%)' }} />
          </div>
        );
      })}
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
        style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)' }}
      >
        <ChipStack amount={amount} />
        <span className="text-gold-400 font-bold text-sm sm:text-lg tabular-nums drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
          {formatChips(amount)}
        </span>
      </motion.div>
    </AnimatePresence>
  );
}
