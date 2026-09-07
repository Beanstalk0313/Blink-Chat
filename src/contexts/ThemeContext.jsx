import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { updateCommunity, updateUserProfile } from '../services/db';
import { useAuth } from './AuthContext';
import { readStoredValue, writeStoredValue } from '../services/utils';

const ThemeContext = createContext(null);

const themes = {
  default: { label: 'Blink', primary: '#adc6ff', secondary: '#e9b3ff', background: '#131315', surface: '#1f1f21' },
  ocean: { label: 'Ocean', primary: '#67e8f9', secondary: '#93c5fd', background: '#071a24', surface: '#0d2a38' },
  forest: { label: 'Forest', primary: '#86efac', secondary: '#facc15', background: '#101b16', surface: '#1b2d23' },
  sunset: { label: 'Sunset', primary: '#fdba74', secondary: '#fda4af', background: '#211416', surface: '#36201e' },
  monochrome: { label: 'Mono', primary: '#f4f4f5', secondary: '#a1a1aa', background: '#111113', surface: '#242428' }
};

export function ThemeProvider({ children }) {
  const { currentUser } = useAuth();
  const [globalTheme, setGlobalTheme] = useState(() => typeof window !== 'undefined' ? readStoredValue('blink-theme', 'default') : 'default');
  const [communityThemes, setCommunityThemes] = useState({});

  useEffect(() => {
    writeStoredValue('blink-theme', globalTheme);
  }, [globalTheme]);

  const applyTheme = useCallback((themeId) => {
    if (themes[themeId]) setGlobalTheme(themeId);
  }, []);

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

  const activeThemeId = globalTheme;
  const activeTheme = themes[activeThemeId] || themes.default;
  const style = useMemo(() => ({
    '--color-primary': activeTheme.primary,
    '--color-primary-container': activeTheme.primary,
    '--color-secondary': activeTheme.secondary,
    '--color-background': activeTheme.background,
    '--color-surface': activeTheme.background,
    '--color-surface-container': activeTheme.surface,
    '--color-surface-container-high': activeTheme.surface,
    '--color-surface-container-highest': activeTheme.surface,
    '--color-on-primary': activeTheme.background,
    '--color-on-background': '#f4f4f5',
    '--color-on-surface': '#f4f4f5'
  }), [activeTheme]);

  return (
    <ThemeContext.Provider value={{ themes, globalTheme, applyTheme, setTheme, communityThemes, setCommunityTheme }}>
      <div data-theme={activeThemeId} style={style}>{children}</div>
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
