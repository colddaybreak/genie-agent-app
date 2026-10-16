import { useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'genie-agent-theme';

const listeners = new Set<() => void>();

function readStoredTheme(): Theme {
  const value = localStorage.getItem(STORAGE_KEY);
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
}

let currentTheme: Theme = readStoredTheme();

/**
 * Mirrors the appkit-ui stylesheet contract: `.dark` forces dark, `.light`
 * opts out of the media-query dark fallback, and no class follows the OS.
 */
function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.classList.toggle('light', theme === 'light');
}

function setTheme(next: Theme): void {
  currentTheme = next;
  localStorage.setItem(STORAGE_KEY, next);
  applyTheme(next);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTheme(): { theme: Theme; setTheme: (theme: Theme) => void } {
  const theme = useSyncExternalStore(subscribe, () => currentTheme);
  return { theme, setTheme };
}

applyTheme(currentTheme);
