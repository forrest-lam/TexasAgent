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
      const timer = setTimeout(() => setShow(false), 900);
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
            animate={{ scale: 3, opacity: 0 }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              width: 80,
              height: 80,
              left: '50%',
              top: '50%',
              border: `2px solid ${color}0.8)`,
              boxShadow: `0 0 20px ${color}0.4)`,
            }}
          />
          {/* Shockwave ring 2 (delayed) */}
          <motion.div
            key={`ring2-${key}`}
            initial={{ scale: 0.2, opacity: 0.7 }}
            animate={{ scale: 2.5, opacity: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut', delay: 0.1 }}
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              width: 60,
              height: 60,
              left: '50%',
              top: '50%',
              border: `3px solid ${color}0.6)`,
              boxShadow: `0 0 15px ${color}0.3)`,
            }}
          />
          {/* Center flash */}
          <motion.div
            key={`flash-${key}`}
            initial={{ scale: 0.5, opacity: 1 }}
            animate={{ scale: 2, opacity: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              width: 40,
              height: 40,
              left: '50%',
              top: '50%',
              background: `radial-gradient(circle, ${color}0.6) 0%, transparent 70%)`,
            }}
          />
          {/* Flying particles */}
          {Array.from({ length: 8 }).map((_, i) => {
            const angle = (i / 8) * Math.PI * 2;
            const dist = 50 + Math.random() * 30;
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
                transition={{ duration: 0.5 + Math.random() * 0.2, ease: 'easeOut' }}
                className="absolute rounded-full"
                style={{
                  width: 6,
                  height: 6,
                  left: '50%',
                  top: '50%',
                  marginLeft: -3,
                  marginTop: -3,
                  background: isAllIn
                    ? `hsl(${Math.random() * 20}, 90%, ${55 + Math.random() * 15}%)`
                    : `hsl(${40 + Math.random() * 10}, 80%, ${55 + Math.random() * 20}%)`,
                  boxShadow: `0 0 4px ${color}0.8)`,
                }}
              />
            );
          })}
        </div>
      )}
    </AnimatePresence>
  );
}
