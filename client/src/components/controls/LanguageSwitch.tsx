import { useI18n } from '../../i18n';
import { Languages } from 'lucide-react';

export default function LanguageSwitch() {
  const { locale, setLocale } = useI18n();

  const toggle = () => {
    setLocale(locale === 'en' ? 'zh' : 'en');
  };

  return (
    <button
      onClick={toggle}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg
        bg-casino-card/80 border border-casino-border/50 text-gray-300 hover:text-white
        transition-colors backdrop-blur-sm cursor-pointer text-xs font-medium"
      title={locale === 'en' ? '切换到中文' : 'Switch to English'}
    >
      <Languages size={14} />
      <span>{locale === 'en' ? '中文' : 'EN'}</span>
    </button>
  );
}
