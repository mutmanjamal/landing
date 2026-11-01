// ui.ts — site text is stored as JSON (src/data/en.json, ar.json) so the
// admin panel can edit every section without touching TypeScript.
// Components pick the language from the URL (/ar/ prefix = Arabic).

import en from '../data/en.json';
import ar from '../data/ar.json';

export type Lang = 'en' | 'ar';

export function getLang(pathname: string): Lang {
  return pathname === '/ar/' || pathname.startsWith('/ar/') ? 'ar' : 'en';
}

export const ui = { en, ar } as const;
