// Aydınlık/karanlık tema: seçim yoksa cihaz ayarı izlenir; seçim tarayıcıda hatırlanır.

export type Theme = 'light' | 'dark';
const KEY = 'cfp.theme';

export function storedTheme(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

export const systemTheme = (): Theme => (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

export function applyTheme(theme: Theme | null) {
  const root = document.documentElement;
  if (theme) root.dataset.theme = theme;
  else delete root.dataset.theme;
}

export function saveTheme(theme: Theme) {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // gizli pencere vb.: sadece bu oturumda geçerli
  }
  applyTheme(theme);
}
