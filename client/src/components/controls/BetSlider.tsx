import { useState } from 'react';
import { formatChips } from '@texas-agent/shared';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';

interface BetSliderProps {
  minRaise: number;
  maxRaise: number;
  pot: number;
  bigBlind: number;
  currentBet: number;
  onConfirm: (amount: number) => void;
  onCancel: () => void;
}

export default function BetSlider({ minRaise, maxRaise, pot, bigBlind, currentBet, onConfirm, onCancel }: BetSliderProps) {
  const [amount, setAmount] = useState(minRaise);

  const quickBets = [
    { label: '½ Pot', value: Math.max(minRaise, Math.floor(pot / 2) + currentBet) },
    { label: '¾ Pot', value: Math.max(minRaise, Math.floor(pot * 0.75) + currentBet) },
    { label: 'Pot', value: Math.max(minRaise, pot + currentBet) },
  ].filter(b => b.value <= maxRaise);

  const isAllIn = amount >= maxRaise;

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      className="overflow-hidden"
    >
      <div className="bg-casino-card/90 rounded-xl p-4 border border-casino-border/50 space-y-3">
        {/* Amount display */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-400">Raise to:</span>
          <span className="text-gold-400 font-bold text-lg">
            {isAllIn ? 'ALL IN' : `$${formatChips(amount)}`}
          </span>
        </div>

        {/* Slider */}
        <Slider
          value={[amount]}
          min={minRaise}
          max={maxRaise}
          step={bigBlind}
          onValueChange={([v]) => setAmount(v)}
          className="py-2"
        />

        {/* Quick bet buttons */}
        <div className="flex gap-2">
          {quickBets.map((qb) => (
            <button
              key={qb.label}
              onClick={() => setAmount(qb.value)}
              className="flex-1 px-2 py-1.5 text-xs font-medium rounded-lg
                bg-white/5 border border-white/10 text-gray-300
                hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
            >
              {qb.label}
            </button>
          ))}
          <button
            onClick={() => setAmount(maxRaise)}
            className="flex-1 px-2 py-1.5 text-xs font-medium rounded-lg
              bg-red-600/20 border border-red-500/30 text-red-400
              hover:bg-red-600/30 hover:text-red-300 transition-colors cursor-pointer"
          >
            All In
          </button>
        </div>

        {/* Confirm / Cancel */}
        <div className="flex gap-2">
          <Button
            onClick={onCancel}
            variant="outline"
            className="flex-1 border-gray-600 text-gray-300 hover:bg-gray-800 cursor-pointer"
          >
            Cancel
          </Button>
          <Button
            onClick={() => onConfirm(amount)}
            className="flex-1 bg-gold-500 text-black hover:bg-gold-400 font-bold cursor-pointer"
          >
            {isAllIn ? 'All In!' : `Raise to $${formatChips(amount)}`}
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
