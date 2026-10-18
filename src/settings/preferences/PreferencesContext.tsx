import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { loadPreferences, savePreferences, type Preferences } from './storage';

interface PreferencesValue {
  preferences: Preferences;
  setPreference: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
}

const PreferencesContext = createContext<PreferencesValue | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<Preferences>(loadPreferences);

  useEffect(() => savePreferences(preferences), [preferences]);

  const value = useMemo<PreferencesValue>(
    () => ({
      preferences,
      setPreference: (key, v) => setPreferences((prev) => ({ ...prev, [key]: v })),
    }),
    [preferences],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesValue {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used inside <PreferencesProvider>');
  return ctx;
}
