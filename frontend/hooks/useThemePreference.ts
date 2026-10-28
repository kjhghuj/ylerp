import { useEffect, useState } from 'react';

/** Login and authenticated shell share the established preference and root class. */
export function useThemePreference() {
  const [darkMode, setDarkMode] = useState(() => {
    try { return localStorage.getItem('yl-dark-mode') === 'true'; } catch { return false; }
  });
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    try { localStorage.setItem('yl-dark-mode', String(darkMode)); } catch { /* storage may be unavailable */ }
  }, [darkMode]);
  return [darkMode, setDarkMode] as const;
}
