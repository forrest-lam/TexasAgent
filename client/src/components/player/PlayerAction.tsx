import { PlayerAction as PlayerActionType, ActionType } from '@texas-agent/shared';
import { formatChips } from '@texas-agent/shared';
import { motion, AnimatePresence } from 'framer-motion';

interface PlayerActionProps {
  action?: { playerId: string; action: PlayerActionType };
  playerId: string;
}

const ACTION_COLORS: Record<ActionType, string> = {
  fold: 'bg-red-600/80 text-red-100 border-red-500/50',
  check: 'bg-blue-600/60 text-blue-100 border-blue-500/50',
  call: 'bg-blue-600/80 text-blue-100 border-blue-500/50',
  raise: 'bg-gold-500/80 text-yellow-100 border-gold-400/50',
  'all-in': 'bg-red-700/90 text-white border-red-400/50',
};

const ACTION_LABELS: Record<ActionType, string> = {
  fold: 'Fold',
  check: 'Check',
  call: 'Call',
  raise: 'Raise',
  'all-in': 'ALL IN',
};

export default function PlayerAction({ action, playerId }: PlayerActionProps) {
  const showAction = action && action.playerId === playerId;

  return (
    <AnimatePresence>
      {showAction && (
        <motion.div
          initial={{ opacity: 0, y: 8, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.8 }}
          transition={{ duration: 0.3 }}
          className={`absolute -bottom-7 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full text-[10px] font-bold 
            border whitespace-nowrap shadow-lg ${ACTION_COLORS[action!.action.type]}`}
        >
          {ACTION_LABELS[action!.action.type]}
          {action!.action.amount && action!.action.type === 'raise' && (
            <span className="ml-1">${formatChips(action!.action.amount)}</span>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
