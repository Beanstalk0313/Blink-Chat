import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { updateCommunity, updateUserProfile } from '../services/db';
import { useAuth } from './AuthContext';
import { readStoredValue, writeStoredValue } from '../services/utils';
import { THEMES, buildThemeTokens } from '../theme/palette';

const ThemeContext = createContext(null);

// Themes are palette specs (primary / accent / base), not stylesheets. See
// src/theme/palette.js: every surface, outline, tint, glow and shadow token is
// derived from those three colours, so any theme covers the whole app.
const themes = THEMES;

export function ThemeProvider({ children }) {
  const { currentUser } = useAuth();
  const [globalTheme, setGlobalTheme] = useState(() => typeof window !== 'undefined' ? readStoredValue('blink-theme', 'default') : 'default');
  const [communityThemes, setCommunityThemes] = useState({});

  // Accessibility preferences. Reduced motion defaults to the OS setting the
  // first time it is seen; after that the explicit choice wins everywhere.
  const [reducedMotion, setReducedMotionState] = useState(() => {
    if (typeof window === 'undefined') return false;
    const stored = readStoredValue('blink-reduced-motion', null);
    if (stored === 'true') return true;
    if (stored === 'false') return false;
    return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  });
  const [highContrast, setHighContrastState] = useState(() => readStoredValue('blink-contrast', null) === 'true');

  useEffect(() => {
    writeStoredValue('blink-theme', globalTheme);
  }, [globalTheme]);

  useEffect(() => {
    writeStoredValue('blink-reduced-motion', String(reducedMotion));
  }, [reducedMotion]);

  useEffect(() => {
    writeStoredValue('blink-contrast', String(highContrast));
  }, [highContrast]);

  const applyTheme = useCallback((themeId) => {
    if (themes[themeId]) setGlobalTheme(themeId);
  }, []);

  const setReducedMotion = async (value) => {
    setReducedMotionState(Boolean(value));
    if (currentUser?.uid) await updateUserProfile(currentUser.uid, { reducedMotion: Boolean(value) });
  };

  const setHighContrast = async (value) => {
    setHighContrastState(Boolean(value));
    if (currentUser?.uid) await updateUserProfile(currentUser.uid, { highContrast: Boolean(value) });
  };

  const activeThemeId = themes[globalTheme] ? globalTheme : 'default';
  const tokens = useMemo(
    () => buildThemeTokens(themes[activeThemeId], { highContrast }),
    [activeThemeId, highContrast]
  );

  // Tokens live on <html>, so every surface picks them up — the page
  // background gradient, portals (modals, popovers, context menus) and the
  // mobile browser chrome (theme-color). Previously only a wrapper div got a
  // handful of variables, which is why most themes looked half-applied.
  useLayoutEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.setAttribute('data-theme', activeThemeId);
    root.dataset.reducedMotion = reducedMotion ? 'true' : 'false';
    root.dataset.contrast = highContrast ? 'high' : 'normal';
    Object.entries(tokens).forEach(([name, value]) => root.style.setProperty(name, value));
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', tokens['--color-app-background'] || tokens['--color-background']);
  }, [tokens, activeThemeId, reducedMotion, highContrast]);

  const setTheme = async (themeId) => {
    applyTheme(themeId);
    if (themes[themeId] && currentUser?.uid) await updateUserProfile(currentUser.uid, { theme: themeId });
  };

  const setCommunityTheme = async (communityId, themeId) => {
    if (!themes[themeId]) return;
    setCommunityThemes(prev => ({ ...prev, [communityId]: themeId }));
    applyTheme(themeId);
    await updateCommunity(communityId, { theme: themeId });
  };

  const value = {
    themes,
    globalTheme: activeThemeId,
    applyTheme,
    setTheme,
    communityThemes,
    setCommunityTheme,
    reducedMotion,
    setReducedMotion,
    highContrast,
    setHighContrast
  };

  return (
    <ThemeContext.Provider value={value}>
      <div data-theme={activeThemeId}>{children}</div>
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
