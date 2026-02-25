import { useState } from 'react';
import { Volume2, VolumeX, Music, Music2 } from 'lucide-react';
import { isSoundEnabled, setSoundEnabled, playSound, isBGMEnabled, setBGMEnabled, startBGM, stopBGM, isBGMPlaying } from '../../services/sound-service';

export default function SoundToggle() {
  const [soundOn, setSoundOn] = useState(isSoundEnabled());
  const [bgmOn, setBgmOn] = useState(isBGMEnabled());

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    setSoundEnabled(next);
    if (next) playSound('notify');
  };

  const toggleBGM = () => {
    const next = !bgmOn;
    setBgmOn(next);
    setBGMEnabled(next);
    if (next) {
      startBGM();
    } else {
      stopBGM();
    }
  };

  return (
    <div className="flex items-center gap-0.5">
      <button
        onClick={toggleBGM}
        className="flex items-center gap-1 sm:gap-1.5 px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-l-lg
          bg-casino-card/80 border border-casino-border/50 text-gray-300 hover:text-white
          transition-colors backdrop-blur-sm cursor-pointer text-[10px] sm:text-xs font-medium"
        title={bgmOn ? 'Mute BGM' : 'Enable BGM'}
      >
        {bgmOn ? <Music size={12} className="sm:w-3.5 sm:h-3.5 text-gold-400" /> : <Music2 size={12} className="sm:w-3.5 sm:h-3.5 opacity-50" />}
      </button>
      <button
        onClick={toggleSound}
        className="flex items-center gap-1 sm:gap-1.5 px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-r-lg
          bg-casino-card/80 border border-casino-border/50 text-gray-300 hover:text-white
          transition-colors backdrop-blur-sm cursor-pointer text-[10px] sm:text-xs font-medium border-l-0"
        title={soundOn ? 'Mute sounds' : 'Enable sounds'}
      >
        {soundOn ? <Volume2 size={12} className="sm:w-3.5 sm:h-3.5" /> : <VolumeX size={12} className="sm:w-3.5 sm:h-3.5" />}
      </button>
    </div>
  );
}
