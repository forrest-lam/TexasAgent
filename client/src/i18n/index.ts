import { create } from 'zustand';
import { Locale, locales, handRankNames, actionNames } from './locales';

interface I18nStore {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  tHand: (handName: string) => string;
  tAction: (action: string) => string;
}

function getStoredLocale(): Locale {
  try {
    const stored = localStorage.getItem('texas-agent-locale');
    if (stored === 'zh' || stored === 'en') return stored;
  } catch {}
  // Auto-detect from browser language
  const lang = navigator.language.toLowerCase();
  return lang.startsWith('zh') ? 'zh' : 'en';
}

export const useI18n = create<I18nStore>((set, get) => ({
  locale: getStoredLocale(),

  setLocale: (locale: Locale) => {
    try { localStorage.setItem('texas-agent-locale', locale); } catch {}
    set({ locale });
  },

  t: (key: string, params?: Record<string, string | number>) => {
    const { locale } = get();
    let text = locales[locale]?.[key] || locales['en']?.[key] || key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replace(`{${k}}`, String(v));
      }
    }
    return text;
  },

  tHand: (handName: string) => {
    const { locale } = get();
    return handRankNames[locale]?.[handName] || handName;
  },

  tAction: (action: string) => {
    const { locale } = get();
    return actionNames[locale]?.[action] || action;
  },
}));

// Alias for convenience — subscribes to locale changes for reactivity
export function useTranslation() {
  return useI18n(s => s.t);
}
