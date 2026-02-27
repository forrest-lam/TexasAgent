import { motion, AnimatePresence } from 'framer-motion';
import { ReactionEvent } from '../../stores/game-store';

// Emojis that should show a smash effect on arrival
const SMASH_EMOJIS = new Set(['🍅', '🥚']);

interface GiftFlyAnimationProps {
  reactions: (ReactionEvent & { id: number })[];
  positions: { x: string; y: string }[];
  ordered: { id: string }[];
}

function posToNum(p: string): number {
  return parseFloat(p);
}

export default function GiftFlyAnimation({ reactions, positions, ordered }: GiftFlyAnimationProps) {
  return (
    <AnimatePresence>
      {reactions.map(reaction => {
        const fromIdx = ordered.findIndex(p => p.id === reaction.fromId);
        const toIdx = ordered.findIndex(p => p.id === reaction.toId);
        const fromPos = positions[fromIdx] || { x: '50%', y: '75%' };
        const toPos = positions[toIdx] || { x: '50%', y: '50%' };

        const fx = posToNum(fromPos.x);
        const fy = posToNum(fromPos.y);
        const tx = posToNum(toPos.x);
        const ty = posToNum(toPos.y);

        const midX = (fx + tx) / 2;
        const midY = Math.min(fy, ty) - 22;

        const isSmash = SMASH_EMOJIS.has(reaction.emoji);

        return (
          <motion.div
            key={reaction.id}
            className="absolute z-50 pointer-events-none"
            style={{ left: 0, top: 0, width: '100%', height: '100%' }}
          >
            {/* Flying gift */}
            <motion.div
              className="absolute text-3xl sm:text-4xl pointer-events-none"
              style={{ left: `${fx}%`, top: `${fy}%`, transform: 'translate(-50%, -50%)' }}
              animate={{
                left: [`${fx}%`, `${midX}%`, `${tx}%`],
                top: [`${fy}%`, `${midY}%`, `${ty}%`],
                scale: [1, 1.3, isSmash ? 0.1 : 0.8],
                opacity: [1, 1, 0],
                rotate: [0, -20, 20],
              }}
              transition={{
                duration: 0.85,
                times: [0, 0.45, 1],
                ease: 'easeInOut',
              }}
            >
              {reaction.emoji}
            </motion.div>

            {/* Smash burst at target */}
            {isSmash && (
              <motion.div
                className="absolute pointer-events-none text-4xl sm:text-5xl"
                style={{ left: `${tx}%`, top: `${ty}%`, transform: 'translate(-50%, -50%)' }}
                initial={{ opacity: 0, scale: 0.2 }}
                animate={{ opacity: [0, 1, 1, 0], scale: [0.2, 2.0, 2.4, 2.8] }}
                transition={{ duration: 0.7, delay: 0.82, ease: 'easeOut' }}
              >
                {reaction.emoji === '🍅' ? '🫙' : '🍳'}
              </motion.div>
            )}

            {/* Splat particles */}
            {isSmash && [0, 60, 120, 180, 240, 300].map((angle, i) => {
              const rad = (angle * Math.PI) / 180;
              const dist = 5 + (i % 3) * 2;
              const ex = tx + Math.cos(rad) * dist;
              const ey = ty + Math.sin(rad) * dist;
              return (
                <motion.div
                  key={`splat-${i}`}
                  className="absolute text-lg pointer-events-none"
                  style={{ left: `${tx}%`, top: `${ty}%`, transform: 'translate(-50%,-50%)' }}
                  animate={{
                    opacity: [0, 1, 0],
                    left: [`${tx}%`, `${ex}%`],
                    top: [`${ty}%`, `${ey}%`],
                    scale: [0.5, 1.2, 0],
                  }}
                  transition={{ duration: 0.55, delay: 0.85 + i * 0.02, ease: 'easeOut' }}
                >
                  {reaction.emoji === '🍅' ? '💦' : '✨'}
                </motion.div>
              );
            })}

            {/* Non-smash: float up at target */}
            {!isSmash && (
              <motion.div
                className="absolute text-3xl sm:text-4xl pointer-events-none"
                style={{ left: `${tx}%`, top: `${ty}%`, transform: 'translate(-50%,-50%)' }}
                initial={{ opacity: 0, scale: 0.5, y: 0 }}
                animate={{ opacity: [0, 1, 1, 0], scale: [0.5, 1.4, 1.2, 0.8], y: [0, -20, -50, -80] }}
                transition={{ duration: 1.2, delay: 0.82, ease: 'easeOut' }}
              >
                {reaction.emoji}
              </motion.div>
            )}
          </motion.div>
        );
      })}
    </AnimatePresence>
  );
}
