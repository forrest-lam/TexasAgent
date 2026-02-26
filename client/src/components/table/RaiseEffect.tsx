import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';

interface RaiseEffectProps {
  triggerKey: string | null;
  position: { x: string; y: string } | null;
  isAllIn?: boolean;
}

export default function RaiseEffect({ triggerKey, position, isAllIn }: RaiseEffectProps) {
  const [show, setShow] = useState(false);
  const [key, setKey] = useState('');

  useEffect(() => {
    if (triggerKey && position) {
      setKey(triggerKey);
      setShow(true);
      const timer = setTimeout(() => setShow(false), isAllIn ? 1500 : 900);
      return () => clearTimeout(timer);
    }
  }, [triggerKey]);

  if (!position) return null;

  const color = isAllIn ? 'rgba(220,38,38,' : 'rgba(212,175,55,';

  return (
    <AnimatePresence>
      {show && (
        <div
          className="absolute pointer-events-none"
          style={{ left: position.x, top: position.y, transform: 'translate(-50%, -50%)' }}
        >
          {/* Shockwave ring 1 */}
          <motion.div
            key={`ring1-${key}`}
            initial={{ scale: 0.2, opacity: 0.9 }}
            animate={{ scale: isAllIn ? 5 : 3, opacity: 0 }}
            transition={{ duration: isAllIn ? 1.0 : 0.7, ease: 'easeOut' }}
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              width: isAllIn ? 120 : 80,
              height: isAllIn ? 120 : 80,
              left: '50%',
              top: '50%',
              border: `${isAllIn ? 3 : 2}px solid ${color}0.8)`,
              boxShadow: `0 0 ${isAllIn ? 40 : 20}px ${color}0.4)`,
            }}
          />
          {/* Shockwave ring 2 (delayed) */}
          <motion.div
            key={`ring2-${key}`}
            initial={{ scale: 0.2, opacity: 0.7 }}
            animate={{ scale: isAllIn ? 4 : 2.5, opacity: 0 }}
            transition={{ duration: isAllIn ? 0.9 : 0.6, ease: 'easeOut', delay: 0.1 }}
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              width: isAllIn ? 100 : 60,
              height: isAllIn ? 100 : 60,
              left: '50%',
              top: '50%',
              border: `3px solid ${color}0.6)`,
              boxShadow: `0 0 ${isAllIn ? 30 : 15}px ${color}0.3)`,
            }}
          />
          {/* All-in: extra ring 3 */}
          {isAllIn && (
            <motion.div
              key={`ring3-${key}`}
              initial={{ scale: 0.3, opacity: 0.8 }}
              animate={{ scale: 6, opacity: 0 }}
              transition={{ duration: 1.2, ease: 'easeOut', delay: 0.2 }}
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                width: 80,
                height: 80,
                left: '50%',
                top: '50%',
                border: `2px solid rgba(255,100,50,0.5)`,
                boxShadow: `0 0 25px rgba(255,100,50,0.3)`,
              }}
            />
          )}
          {/* Center flash */}
          <motion.div
            key={`flash-${key}`}
            initial={{ scale: 0.5, opacity: 1 }}
            animate={{ scale: isAllIn ? 4 : 2, opacity: 0 }}
            transition={{ duration: isAllIn ? 0.6 : 0.4, ease: 'easeOut' }}
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              width: isAllIn ? 60 : 40,
              height: isAllIn ? 60 : 40,
              left: '50%',
              top: '50%',
              background: isAllIn
                ? `radial-gradient(circle, rgba(255,255,200,0.8) 0%, ${color}0.6) 40%, transparent 70%)`
                : `radial-gradient(circle, ${color}0.6) 0%, transparent 70%)`,
            }}
          />
          {/* ALL IN text badge */}
          {isAllIn && (
            <motion.div
              key={`text-${key}`}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: [0, 1.3, 1], opacity: [0, 1, 1, 0] }}
              transition={{ duration: 1.2, times: [0, 0.2, 0.5, 1] }}
              className="absolute -translate-x-1/2 -translate-y-1/2 z-10"
              style={{ left: '50%', top: '50%' }}
            >
              <span className="text-2xl sm:text-3xl font-black tracking-widest text-red-500 drop-shadow-[0_0_20px_rgba(220,38,38,0.8)] select-none"
                style={{ textShadow: '0 0 10px rgba(255,100,50,0.8), 0 0 30px rgba(220,38,38,0.6), 0 2px 4px rgba(0,0,0,0.8)' }}
              >
                ALL IN
              </span>
            </motion.div>
          )}
          {/* Flying particles — more and bigger for all-in */}
          {Array.from({ length: isAllIn ? 16 : 8 }).map((_, i) => {
            const angle = (i / (isAllIn ? 16 : 8)) * Math.PI * 2;
            const dist = (isAllIn ? 80 : 50) + Math.random() * (isAllIn ? 60 : 30);
            return (
              <motion.div
                key={`p-${key}-${i}`}
                initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                animate={{
                  x: Math.cos(angle) * dist,
                  y: Math.sin(angle) * dist,
                  opacity: 0,
                  scale: 0.3,
                }}
                transition={{ duration: (isAllIn ? 0.8 : 0.5) + Math.random() * 0.3, ease: 'easeOut' }}
                className="absolute rounded-full"
                style={{
                  width: isAllIn ? 8 : 6,
                  height: isAllIn ? 8 : 6,
                  left: '50%',
                  top: '50%',
                  marginLeft: isAllIn ? -4 : -3,
                  marginTop: isAllIn ? -4 : -3,
                  background: isAllIn
                    ? `hsl(${Math.random() * 30 + 5}, 100%, ${55 + Math.random() * 15}%)`
                    : `hsl(${40 + Math.random() * 10}, 80%, ${55 + Math.random() * 20}%)`,
                  boxShadow: isAllIn
                    ? `0 0 8px rgba(255,100,50,0.9)`
                    : `0 0 4px ${color}0.8)`,
                }}
              />
            );
          })}
          {/* All-in: extra ember/spark particles */}
          {isAllIn && Array.from({ length: 12 }).map((_, i) => {
            const angle = (i / 12) * Math.PI * 2 + Math.random() * 0.5;
            const dist = 30 + Math.random() * 100;
            return (
              <motion.div
                key={`ember-${key}-${i}`}
                initial={{ x: 0, y: 0, opacity: 1, scale: 0.5 }}
                animate={{
                  x: Math.cos(angle) * dist,
                  y: Math.sin(angle) * dist - 20 - Math.random() * 40,
                  opacity: 0,
                  scale: 0,
                }}
                transition={{ duration: 0.6 + Math.random() * 0.6, ease: 'easeOut', delay: 0.1 + Math.random() * 0.2 }}
                className="absolute rounded-full"
                style={{
                  width: 4,
                  height: 4,
                  left: '50%',
                  top: '50%',
                  marginLeft: -2,
                  marginTop: -2,
                  background: `hsl(${40 + Math.random() * 20}, 100%, ${70 + Math.random() * 20}%)`,
                  boxShadow: `0 0 6px rgba(255,200,50,0.9)`,
                }}
              />
            );
          })}
        </div>
      )}
    </AnimatePresence>
  );
}
