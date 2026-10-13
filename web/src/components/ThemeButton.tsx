import { useEffect, useState } from 'react';
import { useI18n } from '../lib/i18n';
import { saveTheme, storedTheme, systemTheme, type Theme } from '../lib/theme';

/** Dil düğmesinin yanında: 🌙 karanlık moda geç / ☀️ aydınlık moda geç. */
export function ThemeButton() {
  const { t } = useI18n();
  const [theme, setTheme] = useState<Theme>(() => storedTheme() ?? systemTheme());

  // Kullanıcı seçim yapmadıysa cihaz teması değişince düğme de güncellensin
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const onChange = () => !storedTheme() && setTheme(systemTheme());
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const next: Theme = theme === 'dark' ? 'light' : 'dark';
  const label = next === 'dark' ? t.themeDark : t.themeLight;
  return (
    <button
      className="ghost small theme-toggle"
      onClick={() => {
        saveTheme(next);
        setTheme(next);
      }}
      aria-label={label}
      title={label}
    >
      {next === 'dark' ? '🌙' : '☀️'}
    </button>
  );
}
