import { useState } from 'react';
import { GameState, PlayerAction } from '@texas-agent/shared';
import { isLLMConfigured, hasLLMApiKey, getAdvice, AdvisorSuggestion } from '../../services/llm-advisor';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, X, Loader2, Play, Settings } from 'lucide-react';
import { useI18n } from '../../i18n';
import { useGameStore } from '../../stores/game-store';
import { useNavigate } from 'react-router-dom';

interface LLMAdvisorProps {
  gameState: GameState;
  myPlayerId: string;
  isMyTurn: boolean;
  onAction?: (action: PlayerAction) => void;
}

/**
 * Parse a raw action text from the LLM into a PlayerAction.
 * Handles both English and Chinese formats.
 */
function parseActionText(actionText: string, gameState: GameState, myPlayerId: string): PlayerAction | null {
  const text = actionText.toUpperCase();

  const player = gameState.players.find(p => p.id === myPlayerId);
  if (!player) return null;

  // ALL-IN check first
  if (/ALL[\s-]?IN|全[下押]/.test(text)) {
    return { type: 'all-in' };
  }

  // RAISE $X — extract amount
  const raiseMatch = text.match(/(?:RAISE|加注)[^$\d]*\$?\s*(\d[\d,]*)/);
  if (raiseMatch) {
    const amount = parseInt(raiseMatch[1].replace(/,/g, ''), 10);
    if (!isNaN(amount) && amount > 0) {
      if (amount >= player.chips + player.currentBet) {
        return { type: 'all-in' };
      }
      return { type: 'raise', amount };
    }
  }

  // Simple RAISE without amount — use min raise
  if (/RAISE|加注/.test(text)) {
    return { type: 'raise', amount: gameState.minRaise };
  }

  // CALL
  if (/\bCALL\b|跟注/.test(text)) {
    return { type: 'call' };
  }

  // CHECK
  if (/\bCHECK\b|过牌/.test(text)) {
    return { type: 'check' };
  }

  // FOLD
  if (/\bFOLD\b|弃牌/.test(text)) {
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

/** Color class for probability badge */
function getProbColor(prob: number): string {
  if (prob >= 60) return 'bg-green-600/80 text-green-100';
  if (prob >= 40) return 'bg-yellow-600/80 text-yellow-100';
  return 'bg-gray-600/80 text-gray-200';
}

export default function LLMAdvisor({ gameState, myPlayerId, isMyTurn, onAction }: LLMAdvisorProps) {
  const [suggestions, setSuggestions] = useState<AdvisorSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [showNoKey, setShowNoKey] = useState(false);
  const { t } = useI18n();
  const handActions = useGameStore(s => s.handActions);
  const navigate = useNavigate();

  const configured = isLLMConfigured();
  const hasKey = hasLLMApiKey();

  const handleGetAdvice = async () => {
    if (loading) return;
    // If no API key at all, show prompt to configure
    if (!hasKey) {
      setShowNoKey(true);
      setExpanded(true);
      return;
    }
    setShowNoKey(false);
    setLoading(true);
    setError(null);
    setSuggestions([]);
    setExpanded(true);
    try {
      const result = await getAdvice(gameState, myPlayerId, handActions);
      setSuggestions(result);
    } catch (e: any) {
      setError(e.message || t('advisor.error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed left-2 top-14 sm:left-4 sm:top-16 z-50">
      {/* Toggle button */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={expanded ? () => { setExpanded(false); setShowNoKey(false); } : handleGetAdvice}
        disabled={loading}
        className={`flex items-center gap-1.5 sm:gap-2 px-2 py-1.5 sm:px-3 sm:py-2 rounded-xl shadow-lg backdrop-blur-md
          transition-all cursor-pointer border
          ${isMyTurn && hasKey
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
        {expanded && (suggestions.length > 0 || loading || error || showNoKey) && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute top-10 sm:top-12 left-0 w-72 sm:w-[340px] max-h-64 sm:max-h-80 overflow-y-auto rounded-xl 
              bg-casino-card/95 border border-purple-500/30 backdrop-blur-md shadow-xl p-2.5 sm:p-3"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Brain size={14} className="text-purple-400" />
                <span className="text-xs font-semibold text-purple-300">{t('advisor.title')}</span>
              </div>
              <button 
                onClick={() => { setExpanded(false); setShowNoKey(false); }}
                className="text-gray-500 hover:text-white cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>

            {/* No API Key prompt */}
            {showNoKey && (
              <div className="text-center py-3 space-y-2">
                <p className="text-xs text-gray-400">{t('advisor.noKey')}</p>
                <button
                  onClick={() => navigate('/settings')}
                  className="flex items-center justify-center gap-1.5 mx-auto px-3 py-1.5 rounded-lg
                    bg-purple-600/60 hover:bg-purple-600/80 border border-purple-400/30
                    text-white text-xs font-medium transition-colors cursor-pointer"
                >
                  <Settings size={12} />
                  {t('advisor.goSettings')}
                </button>
              </div>
            )}

            {loading && (
              <div className="flex items-center gap-2 text-gray-400 text-xs py-2">
                <Loader2 size={12} className="animate-spin" />
                {t('advisor.thinking')}
              </div>
            )}

            {error && (
              <p className="text-red-400 text-xs">{error}</p>
            )}

            {suggestions.length > 0 && (
              <div className="space-y-2">
                {suggestions.map((suggestion, idx) => {
                  const parsed = parseActionText(suggestion.action, gameState, myPlayerId);
                  return (
                    <div
                      key={idx}
                      className={`rounded-lg border p-2 transition-colors ${
                        idx === 0
                          ? 'border-purple-500/40 bg-purple-900/20'
                          : 'border-casino-border/40 bg-casino-felt/20'
                      }`}
                    >
                      {/* Header: label + probability badge */}
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                          {idx === 0 ? t('advisor.primary') : t('advisor.alternative')}
                        </span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${getProbColor(suggestion.probability)}`}>
                          {suggestion.probability}%
                        </span>
                      </div>

                      {/* Action text */}
                      <div className="text-xs font-semibold text-white mb-1">
                        {suggestion.action}
                      </div>

                      {/* Reason */}
                      {suggestion.reason && (
                        <div className="text-[10px] sm:text-xs text-gray-300 leading-relaxed mb-1.5">
                          {suggestion.reason}
                        </div>
                      )}

                      {/* Follow button */}
                      {isMyTurn && onAction && parsed && (
                        <button
                          onClick={() => {
                            onAction(parsed);
                            setExpanded(false);
                          }}
                          className={`w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg
                            text-white text-[10px] sm:text-xs font-semibold
                            transition-colors cursor-pointer border ${
                              idx === 0
                                ? 'bg-purple-600/80 hover:bg-purple-600 border-purple-400/30'
                                : 'bg-gray-600/60 hover:bg-gray-600/80 border-gray-500/30'
                            }`}
                        >
                          <Play size={10} />
                          {t('advisor.follow')}: {getActionLabel(parsed, t)}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Refresh button */}
            {!loading && (suggestions.length > 0 || error) && isMyTurn && (
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
