import { isSqlDialect, type SqlDialect } from '../../editor/model/table';

const STORAGE_KEY = 'draftboard:preferences:v1';

export type GridStyle = 'none' | 'dots' | 'lines';

export const GRID_STYLES: ReadonlyArray<{ id: GridStyle; label: string; description: string }> = [
  { id: 'dots', label: 'Dots', description: 'A dot at every grid intersection.' },
  { id: 'lines', label: 'Grid', description: 'Thin horizontal and vertical lines.' },
  { id: 'none', label: 'None', description: 'A plain canvas.' },
];

export interface Preferences {
  gridStyle: GridStyle;
  /** Moving, resizing and drawing snap to other layers' edges and centers. */
  snapToLayers: boolean;
  /** Suggests column types and types a new table's `id`. */
  sqlDialect: SqlDialect;
  /** `#rrggbb` outline for the connectors and tables linked to the selected tables. */
  relationHighlight: string;
}

export const DEFAULT_PREFERENCES: Preferences = { gridStyle: 'dots', snapToLayers: true, sqlDialect: 'postgres', relationHighlight: '#7c3aed' };

/** The default before it was made distinct from the selection blue; saved copies of it follow the new default. */
const RETIRED_HIGHLIGHT = '#80caff';
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const isGridStyle = (v: unknown): v is GridStyle => GRID_STYLES.some((g) => g.id === v);

/** Parses saved preferences, falling back to the default for each field that is missing or invalid. */
export function parsePreferences(raw: string | null): Preferences {
  if (!raw) return DEFAULT_PREFERENCES;
  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== 'object' || data === null || Array.isArray(data)) return DEFAULT_PREFERENCES;
    const { gridStyle, snapToLayers, sqlDialect, relationHighlight } = data as Record<string, unknown>;
    return {
      gridStyle: isGridStyle(gridStyle) ? gridStyle : DEFAULT_PREFERENCES.gridStyle,
      snapToLayers: typeof snapToLayers === 'boolean' ? snapToLayers : DEFAULT_PREFERENCES.snapToLayers,
      sqlDialect: isSqlDialect(sqlDialect) ? sqlDialect : DEFAULT_PREFERENCES.sqlDialect,
      // It becomes an SVG stroke attribute, so only a plain colour is let through.
      relationHighlight:
        typeof relationHighlight === 'string' && HEX_COLOR.test(relationHighlight) && relationHighlight.toLowerCase() !== RETIRED_HIGHLIGHT
          ? relationHighlight.toLowerCase()
          : DEFAULT_PREFERENCES.relationHighlight,
    };
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
