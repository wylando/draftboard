const STORAGE_KEY = 'draftboard:preferences:v1';

export type GridStyle = 'none' | 'dots' | 'lines';

export const GRID_STYLES: ReadonlyArray<{ id: GridStyle; label: string; description: string }> = [
  { id: 'dots', label: 'Dots', description: 'A dot at every grid intersection.' },
  { id: 'lines', label: 'Grid', description: 'Thin horizontal and vertical lines.' },
  { id: 'none', label: 'None', description: 'A plain canvas.' },
];

export interface Preferences {
  gridStyle: GridStyle;
}

export const DEFAULT_PREFERENCES: Preferences = { gridStyle: 'dots' };

const isGridStyle = (v: unknown): v is GridStyle => GRID_STYLES.some((g) => g.id === v);

/** Parses saved preferences, falling back to the default for anything missing or invalid. */
export function parsePreferences(raw: string | null): Preferences {
  if (!raw) return DEFAULT_PREFERENCES;
  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== 'object' || data === null || Array.isArray(data)) return DEFAULT_PREFERENCES;
    const { gridStyle } = data as Record<string, unknown>;
    return { gridStyle: isGridStyle(gridStyle) ? gridStyle : DEFAULT_PREFERENCES.gridStyle };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function loadPreferences(): Preferences {
  try {
    return parsePreferences(localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function savePreferences(prefs: Preferences): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Storage blocked: the preference still applies for this session.
  }
}
