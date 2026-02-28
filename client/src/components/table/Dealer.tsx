import { motion } from 'framer-motion';

interface DealerProps {
  /** Current game phase for contextual expressions */
  phase?: string;
}

/**
 * Female croupier (荷官/发牌员) avatar displayed at the center of the poker table.
 * Uses a high-quality image approach with CSS styling for a polished look.
 */
export default function Dealer({ phase }: DealerProps) {
  const isShowdown = phase === 'showdown';
  const isDealing = phase === 'preflop' || phase === 'flop' || phase === 'turn' || phase === 'river';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="flex flex-col items-center select-none pointer-events-none"
    >
      {/* Croupier avatar with idle breathing animation */}
      <motion.div
        animate={{ y: [0, -1.5, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        className="relative"
      >
        {/* Soft ambient glow behind avatar */}
        <div
          className="absolute -inset-4 rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(212,175,55,0.15) 0%, transparent 70%)',
            filter: 'blur(10px)',
          }}
        />

        {/* Avatar container */}
        <div
          className="relative w-12 h-12 sm:w-16 sm:h-16 rounded-full flex items-center justify-center overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, #2a1a3e 0%, #1a1a2e 50%, #0f1923 100%)',
            border: '2px solid rgba(212,175,55,0.5)',
            boxShadow: '0 0 15px rgba(212,175,55,0.15), 0 4px 12px rgba(0,0,0,0.5), inset 0 1px 2px rgba(255,255,255,0.1)',
          }}
        >
          {/* Female croupier emoji face */}
          <span className="text-2xl sm:text-3xl" style={{ lineHeight: 1 }}>
            {isShowdown ? '🤩' : '👩‍💼'}
          </span>
        </div>

        {/* Dealing indicator animation */}
        {isDealing && (
          <motion.div
            className="absolute -right-0.5 -bottom-0.5 sm:-right-1 sm:-bottom-1"
            animate={{ rotate: [0, 10, -10, 0] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          >
            <span className="text-xs sm:text-sm">🃏</span>
          </motion.div>
        )}
      </motion.div>

      {/* "荷官" label */}
      <div
        className="mt-1 px-2 py-0.5 rounded-full text-[7px] sm:text-[9px] font-bold tracking-widest uppercase"
        style={{
          background: 'linear-gradient(135deg, rgba(212,175,55,0.25) 0%, rgba(180,140,30,0.15) 100%)',
          color: '#d4af37',
          border: '1px solid rgba(212,175,55,0.3)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
          backdropFilter: 'blur(4px)',
          textShadow: '0 1px 3px rgba(0,0,0,0.5)',
        }}
      >
        荷官
      </div>
    </motion.div>
  );
}
