export type Theme = 'light' | 'dark';

const preferenceKey = 'urban-connect-theme';

export function readTheme(): Theme {
  try { return localStorage.getItem(preferenceKey) === 'dark' ? 'dark' : 'light'; }
  catch { return 'light'; }
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#111c2b' : '#196b56');
}

export function saveTheme(theme: Theme) {
  applyTheme(theme);
  try { localStorage.setItem(preferenceKey, theme); } catch { /* The current tab still keeps the theme. */ }
}
