import { useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, ChevronDown, ChevronUp } from 'lucide-react';
import { useI18n } from '../../i18n';
import { LogEntry } from '../../stores/game-store';

interface GameLogProps {
  logs: LogEntry[];
}

function LogMessage({ entry }: { entry: LogEntry }) {
  const { t, tAction, tHand } = useI18n();

  // For action logs, translate the action type and hand name
  if (entry.key === 'log.action' && entry.params) {
    const actionLabel = tAction(String(entry.params.action));
    const amt = entry.params.amount ? ` $${entry.params.amount}` : '';
    return <>{entry.params.name}: {actionLabel}{amt}</>;
  }
  if (entry.key === 'log.wins' && entry.params) {
    const handLabel = tHand(String(entry.params.hand));
    return <>{t('log.wins', { ...entry.params, hand: handLabel })}</>;
  }

  return <>{t(entry.key, entry.params)}</>;
}

export default function GameLog({ logs }: GameLogProps) {
  const [expanded, setExpanded] = useState(false);
  const { t } = useI18n();

  return (
    <div className="fixed right-4 top-14 z-40">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-casino-card/90 border border-casino-border/50
          text-gray-300 hover:text-white transition-colors backdrop-blur-sm cursor-pointer"
      >
        <MessageSquare size={16} />
        <span className="text-xs font-medium">{t('game.log')}</span>
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, y: -10, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -10, height: 0 }}
            className="mt-2 w-72 rounded-xl bg-casino-card/95 border border-casino-border/50 backdrop-blur-md overflow-hidden"
          >
            <ScrollArea className="h-64 p-3">
              <div className="space-y-1">
                {logs.length === 0 && (
                  <p className="text-xs text-gray-500 italic">{t('game.noActions')}</p>
                )}
                {logs.map((entry, i) => (
                  <motion.p
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="text-xs text-gray-300 py-0.5 border-b border-white/5 last:border-0"
                  >
                    <LogMessage entry={entry} />
                  </motion.p>
                ))}
              </div>
            </ScrollArea>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
