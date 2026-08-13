import { en } from './en.ts';
import { zh, type LocaleKey } from './zh.ts';

export type { LocaleKey };
export type Locale = 'zh' | 'en';

let currentLocale: Locale = detectLocale();

export function detectLocale(): Locale {
  if (typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('zh')) {
    return 'zh';
  }
  return 'en';
}

export function setLocale(locale: Locale): void {
  currentLocale = locale;
}

export function getLocale(): Locale {
  return currentLocale;
}

export function t(key: LocaleKey): string {
  const dict = currentLocale === 'zh' ? zh : en;
  return dict[key] ?? zh[key] ?? key;
}
