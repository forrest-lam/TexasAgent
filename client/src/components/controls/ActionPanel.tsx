import { useState, useEffect, useRef } from 'react';
import { GameState, PlayerAction } from '@texas-agent/shared';
import { formatChips } from '@texas-agent/shared';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { motion, AnimatePresence } from 'framer-motion';
import { useI18n } from '../../i18n';
import { useGameStore } from '../../stores/game-store';

interface ActionPanelProps {
  gameState: GameState;
  myPlayerId: string;
  isMyTurn: boolean;
  onAction: (action: PlayerAction) => void;
  isLocal?: boolean;
}

export default function ActionPanel({ gameState, myPlayerId, isMyTurn, onAction, isLocal }: ActionPanelProps) {
  const [raiseAmount, setRaiseAmount] = useState(0);
  const [showRaise, setShowRaise] = useState(false);
  const { t } = useI18n();
  const timeLimit = useGameStore(s => s.timeLimit);

  // Countdown timer
  const [timeLeft, setTimeLeft] = useState(timeLimit);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoFoldRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Clear any existing auto-fold timer
    if (autoFoldRef.current) {
      clearTimeout(autoFoldRef.current);
      autoFoldRef.current = null;
    }

    if (isMyTurn && !isLocal) {
      setTimeLeft(timeLimit);
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => {
          const next = prev - 100;
          return next <= 0 ? 0 : next;
        });
      }, 100);
      // Client-side safety net: auto-fold 2s after server timeout
      // to prevent stuck game if server fold is not received
      autoFoldRef.current = setTimeout(() => {
        const callAmt = gameState.currentBet - (gameState.players.find(p => p.id === myPlayerId)?.currentBet ?? 0);
        if (callAmt === 0) {
          onAction({ type: 'check' });
        } else {
          onAction({ type: 'fold' });
        }
      }, timeLimit + 2000);
    } else if (isMyTurn && isLocal) {
      setTimeLeft(timeLimit);
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => {
          const next = prev - 100;
          return next <= 0 ? 0 : next;
        });
      }, 100);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (autoFoldRef.current) {
        clearTimeout(autoFoldRef.current);
        autoFoldRef.current = null;
      }
    };
  }, [isMyTurn, timeLimit]);

  const player = gameState.players.find(p => p.id === myPlayerId);
  if (!player || player.isFolded || !player.isActive) return null;

  const callAmount = gameState.currentBet - player.currentBet;
  const canCheck = callAmount === 0;
  const minRaise = gameState.minRaise;
  const maxRaise = player.chips + player.currentBet;

  const handleFold = () => onAction({ type: 'fold' });
  const handleCheck = () => onAction({ type: 'check' });
  const handleCall = () => onAction({ type: 'call' });
  const handleRaise = () => {
    if (raiseAmount >= maxRaise) {
      onAction({ type: 'all-in' });
    } else {
      onAction({ type: 'raise', amount: raiseAmount });
    }
    setShowRaise(false);
  };

  const quickBets = [
    { label: t('action.halfPot'), amount: Math.max(minRaise, Math.floor(gameState.pot / 2) + player.currentBet) },
    { label: t('action.threeFourPot'), amount: Math.max(minRaise, Math.floor(gameState.pot * 0.75) + player.currentBet) },
    { label: t('action.pot'), amount: Math.max(minRaise, gameState.pot + player.currentBet) },
  ].filter(b => b.amount <= maxRaise);

  return (
    <AnimatePresence>
      {isMyTurn && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="fixed bottom-0 left-0 right-0 p-1.5 sm:p-3 bg-gradient-to-t from-black/95 via-black/80 to-transparent backdrop-blur-md z-50"
        >
          <div className="max-w-2xl mx-auto space-y-1 sm:space-y-2">
            {/* Countdown timer bar — only in multiplayer mode */}
            {!isLocal && (
              <div className="flex items-center gap-2">
                <div className="relative flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                  <motion.div
                    className={`absolute left-0 top-0 h-full rounded-full ${
                      timeLeft / timeLimit > 0.3 ? 'bg-gold-500' : timeLeft / timeLimit > 0.1 ? 'bg-orange-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${(timeLeft / timeLimit) * 100}%` }}
                    transition={{ duration: 0.1 }}
                  />
                </div>
                <span className={`text-[10px] font-mono tabular-nums ${
                  timeLeft / timeLimit > 0.3 ? 'text-gray-400' : timeLeft / timeLimit > 0.1 ? 'text-orange-400' : 'text-red-400'
                }`}>
                  {Math.ceil(timeLeft / 1000)}s
                </span>
              </div>
            )}
            {/* Raise slider panel */}
            <AnimatePresence>
              {showRaise && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="bg-casino-card/90 rounded-xl p-2 sm:p-3 border border-casino-border/50 space-y-1.5 sm:space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-400">{t('action.raiseTo')}:</span>
                      <span className="text-gold-400 font-bold text-base sm:text-lg">${formatChips(raiseAmount)}</span>
                    </div>
                    <Slider
                      value={[raiseAmount]}
                      min={minRaise}
                      max={maxRaise}
                      step={gameState.bigBlind}
                      onValueChange={([v]) => setRaiseAmount(v)}
                      className="py-2"
                    />
                    <div className="flex gap-2">
                      {quickBets.map((qb) => (
                        <button
                          key={qb.label}
                          onClick={() => setRaiseAmount(qb.amount)}
                          className="flex-1 px-2 py-1.5 text-xs font-medium rounded-lg
                            bg-white/5 border border-white/10 text-gray-300
                            hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
                        >
                          {qb.label}
                        </button>
                      ))}
                      <button
                        onClick={() => setRaiseAmount(maxRaise)}
                        className="flex-1 px-2 py-1.5 text-xs font-medium rounded-lg
                          bg-red-600/20 border border-red-500/30 text-red-400
                          hover:bg-red-600/30 hover:text-red-300 transition-colors cursor-pointer"
                      >
                        {t('action.allIn')}
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => setShowRaise(false)}
                        variant="outline"
                        className="flex-1 border-gray-600 text-gray-300 hover:bg-gray-800 cursor-pointer"
                      >
                        {t('action.cancel')}
                      </Button>
                      <Button
                        onClick={handleRaise}
                        className="flex-1 bg-gold-500 text-black hover:bg-gold-400 font-bold cursor-pointer"
                      >
                        {raiseAmount >= maxRaise ? `${t('action.allIn')}!` : `${t('action.raiseTo')} $${formatChips(raiseAmount)}`}
                      </Button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Main action buttons */}
            {!showRaise && (
              <div className="flex gap-2 sm:gap-3">
                <Button
                  onClick={handleFold}
                  className="flex-1 h-9 sm:h-11 bg-red-600/80 hover:bg-red-600 text-white font-bold text-sm sm:text-base cursor-pointer"
                >
                  {t('action.fold')}
                </Button>

                {canCheck ? (
                  <Button
                    onClick={handleCheck}
                    className="flex-1 h-9 sm:h-11 bg-blue-600/80 hover:bg-blue-600 text-white font-bold text-sm sm:text-base cursor-pointer"
                  >
                    {t('action.check')}
                  </Button>
                ) : (
                  <Button
                    onClick={handleCall}
                    disabled={player.chips < callAmount}
                    className="flex-1 h-9 sm:h-11 bg-blue-600/80 hover:bg-blue-600 text-white font-bold text-sm sm:text-base
                      disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {t('action.call')} ${formatChips(callAmount)}
                  </Button>
                )}

                <Button
                  onClick={() => {
                    setRaiseAmount(minRaise);
                    setShowRaise(true);
                  }}
                  disabled={player.chips <= 0}
                  className="flex-1 h-9 sm:h-11 bg-gold-500/90 hover:bg-gold-500 text-black font-bold text-sm sm:text-base
                    disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {t('action.raise')}
                </Button>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
