// Açık / koyu tema. Seçim tarayıcıda saklanır; ilk açılışta sistem tercihi kullanılır.
export type Theme = 'light' | 'dark';

const KEY = 'yuzbir.theme';

export function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // depolama kapalıysa sistem tercihine düş
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // yok say
  }
}
