import { useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { isSoundEnabled, setSoundEnabled, playSound } from '../../services/sound-service';

export default function SoundToggle() {
  const [on, setOn] = useState(isSoundEnabled());

  const toggle = () => {
    const next = !on;
    setOn(next);
    setSoundEnabled(next);
    if (next) playSound('notify');
  };

  return (
    <button
      onClick={toggle}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg
        bg-casino-card/80 border border-casino-border/50 text-gray-300 hover:text-white
        transition-colors backdrop-blur-sm cursor-pointer text-xs font-medium"
      title={on ? 'Mute sounds' : 'Enable sounds'}
    >
      {on ? <Volume2 size={14} /> : <VolumeX size={14} />}
    </button>
  );
}
