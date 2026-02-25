import { useState } from 'react';
import { GameState, PlayerAction } from '@texas-agent/shared';
import { isLLMConfigured, getAdvice } from '../../services/llm-advisor';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, X, Loader2, Play } from 'lucide-react';
import { useI18n } from '../../i18n';
import { useGameStore } from '../../stores/game-store';

interface LLMAdvisorProps {
  gameState: GameState;
  myPlayerId: string;
  isMyTurn: boolean;
  onAction?: (action: PlayerAction) => void;
}

/**
 * Parse the LLM advice text to extract a recommended PlayerAction.
 * Handles both English and Chinese formats from the prompt template.
 */
function parseRecommendedAction(advice: string, gameState: GameState, myPlayerId: string): PlayerAction | null {
  const text = advice.toUpperCase();

  // Try to find the recommendation line (EN: **Recommendation**: ... / ZH: **建议操作**：...)
  const recMatch = advice.match(/\*\*(?:Recommendation|建议操作)\*\*[：:]\s*(.+)/i);
  const recLine = recMatch ? recMatch[1].toUpperCase() : text;

  const player = gameState.players.find(p => p.id === myPlayerId);
  if (!player) return null;

  // ALL-IN check first (before other patterns)
  if (/ALL[\s-]?IN|全[下押]/.test(recLine)) {
    return { type: 'all-in' };
  }

  // RAISE $X — extract amount
  const raiseMatch = recLine.match(/(?:RAISE|加注)[^$\d]*\$?\s*(\d[\d,]*)/);
  if (raiseMatch) {
    const amount = parseInt(raiseMatch[1].replace(/,/g, ''), 10);
    if (!isNaN(amount) && amount > 0) {
      // If the raise amount would be all-in
      if (amount >= player.chips + player.currentBet) {
        return { type: 'all-in' };
      }
      return { type: 'raise', amount };
    }
  }

  // Simple RAISE without amount — use min raise
  if (/RAISE|加注/.test(recLine)) {
    return { type: 'raise', amount: gameState.minRaise };
  }

  // CALL
  if (/\bCALL\b|跟注/.test(recLine)) {
    return { type: 'call' };
  }

  // CHECK
  if (/\bCHECK\b|过牌/.test(recLine)) {
    return { type: 'check' };
  }

  // FOLD
  if (/\bFOLD\b|弃牌/.test(recLine)) {
    return { type: 'fold' };
  }

  return null;
}

/** Get a short label for the parsed action */
function getActionLabel(action: PlayerAction, t: (key: string) => string): string {
  switch (action.type) {
    case 'fold': return t('action.fold');
    case 'check': return t('action.check');
    case 'call': return t('action.call');
    case 'raise': return `${t('action.raise')} $${action.amount ?? ''}`;
    case 'all-in': return t('action.allIn');
  }
}

export default function LLMAdvisor({ gameState, myPlayerId, isMyTurn, onAction }: LLMAdvisorProps) {
  const [advice, setAdvice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const { t } = useI18n();
  const handActions = useGameStore(s => s.handActions);

  const configured = isLLMConfigured();

  const handleGetAdvice = async () => {
    if (!configured || loading) return;
    setLoading(true);
    setError(null);
    setAdvice(null);
    setExpanded(true);
    try {
      const result = await getAdvice(gameState, myPlayerId, handActions);
      setAdvice(result);
    } catch (e: any) {
      setError(e.message || t('advisor.error'));
    } finally {
      setLoading(false);
    }
  };

  // Don't show if not configured
  if (!configured) return null;

  return (
    <div className="fixed left-2 top-14 sm:left-4 sm:top-16 z-50">
      {/* Toggle button */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={expanded ? () => setExpanded(false) : handleGetAdvice}
        disabled={loading}
        className={`flex items-center gap-1.5 sm:gap-2 px-2 py-1.5 sm:px-3 sm:py-2 rounded-xl shadow-lg backdrop-blur-md
          transition-all cursor-pointer border
          ${isMyTurn 
            ? 'bg-purple-600/80 border-purple-400/50 text-white hover:bg-purple-600' 
            : 'bg-casino-card/80 border-casino-border/50 text-gray-400 hover:text-white'
          }
          ${loading ? 'animate-pulse' : ''}
          disabled:opacity-50`}
      >
        {loading ? <Loader2 size={14} className="animate-spin sm:w-4 sm:h-4" /> : <Brain size={14} className="sm:w-4 sm:h-4" />}
        <span className="text-[10px] sm:text-xs font-medium">{t('advisor.title')}</span>
      </motion.button>

      {/* Advice panel */}
      <AnimatePresence>
        {expanded && (advice || loading || error) && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute top-10 sm:top-12 left-0 w-64 sm:w-80 max-h-48 sm:max-h-60 overflow-y-auto rounded-xl 
              bg-casino-card/95 border border-purple-500/30 backdrop-blur-md shadow-xl p-2 sm:p-3"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Brain size={14} className="text-purple-400" />
                <span className="text-xs font-semibold text-purple-300">{t('advisor.title')}</span>
              </div>
              <button 
                onClick={() => setExpanded(false)} 
                className="text-gray-500 hover:text-white cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>

            {loading && (
              <div className="flex items-center gap-2 text-gray-400 text-xs py-2">
                <Loader2 size={12} className="animate-spin" />
                {t('advisor.thinking')}
              </div>
            )}

            {error && (
              <p className="text-red-400 text-xs">{error}</p>
            )}

            {advice && (
              <>
                <div className="text-xs text-gray-200 leading-relaxed whitespace-pre-wrap">
                  {advice}
                </div>

                {/* Follow advice button */}
                {isMyTurn && onAction && (() => {
                  const parsed = parseRecommendedAction(advice, gameState, myPlayerId);
                  if (!parsed) return null;
                  return (
                    <button
                      onClick={() => {
                        onAction(parsed);
                        setExpanded(false);
                      }}
                      className="mt-2 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg
                        bg-purple-600/80 hover:bg-purple-600 text-white text-xs font-semibold
                        transition-colors cursor-pointer border border-purple-400/30"
                    >
                      <Play size={12} />
                      {t('advisor.follow')}: {getActionLabel(parsed, t)}
                    </button>
                  );
                })()}
              </>
            )}

            {/* Refresh button */}
            {!loading && (advice || error) && isMyTurn && (
              <button
                onClick={handleGetAdvice}
                className="mt-2 text-[10px] text-purple-400 hover:text-purple-300 underline cursor-pointer"
              >
                {t('advisor.suggest')}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
