const STORAGE_KEY = 'draftboard:layout:v1';

/** Matches the `sidebarWidth` token. */
export const PANEL_DEFAULT_WIDTH = 240;
export const PANEL_MAX_WIDTH = 480;

export type PanelId = 'layers' | 'properties';

/** The Design panel's two-column controls (Arrange buttons, stroke fields) need its default width. */
export const PANEL_MIN_WIDTH: Record<PanelId, number> = { layers: 160, properties: PANEL_DEFAULT_WIDTH };

export interface PanelState {
  /** Whole CSS px, within the panel's `PANEL_MIN_WIDTH`..`PANEL_MAX_WIDTH`. */
  width: number;
  collapsed: boolean;
}

export type PanelLayout = Record<PanelId, PanelState>;

export const DEFAULT_PANEL_LAYOUT: PanelLayout = {
  layers: { width: PANEL_DEFAULT_WIDTH, collapsed: false },
  properties: { width: PANEL_DEFAULT_WIDTH, collapsed: false },
};

export function clampPanelWidth(id: PanelId, width: number): number {
  return Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH[id], Math.round(width)));
}

function parsePanel(id: PanelId, value: unknown, fallback: PanelState): PanelState {
  if (typeof value !== 'object' || value === null) return fallback;
  const { width, collapsed } = value as Record<string, unknown>;
  return {
    width: typeof width === 'number' && Number.isFinite(width) ? clampPanelWidth(id, width) : fallback.width,
    collapsed: typeof collapsed === 'boolean' ? collapsed : fallback.collapsed,
  };
}

/** Parses a saved layout, falling back to the default for each panel and field that is missing or invalid. */
export function parsePanelLayout(raw: string | null): PanelLayout {
  if (!raw) return DEFAULT_PANEL_LAYOUT;
  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== 'object' || data === null || Array.isArray(data)) return DEFAULT_PANEL_LAYOUT;
    const { layers, properties } = data as Record<string, unknown>;
    return {
      layers: parsePanel('layers', layers, DEFAULT_PANEL_LAYOUT.layers),
      properties: parsePanel('properties', properties, DEFAULT_PANEL_LAYOUT.properties),
    };
  } catch {
    return DEFAULT_PANEL_LAYOUT;
  }
}

export function loadPanelLayout(): PanelLayout {
  try {
    return parsePanelLayout(localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_PANEL_LAYOUT;
  }
}

export function savePanelLayout(layout: PanelLayout): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // Storage blocked: the layout still applies for this session.
  }
}

const SECTIONS_KEY = 'draftboard:sections:v1';

/**
 * Which Design panel sections are open. `except` lists the section ids whose state is the opposite
 * of `open`, so collapse all and expand all also cover sections that aren't on screen yet.
 */
export interface SectionFolds {
  open: boolean;
  except: string[];
}

export const DEFAULT_SECTION_FOLDS: SectionFolds = { open: true, except: [] };

export function isSectionOpen(folds: SectionFolds, id: string): boolean {
  return folds.except.includes(id) !== folds.open;
}

export function setSectionOpen(folds: SectionFolds, id: string, open: boolean): SectionFolds {
  const except = folds.except.filter((other) => other !== id);
  return { open: folds.open, except: open === folds.open ? except : [...except, id] };
}

export function foldAllSections(open: boolean): SectionFolds {
  return { open, except: [] };
}

export function parseSectionFolds(raw: string | null): SectionFolds {
  if (!raw) return DEFAULT_SECTION_FOLDS;
  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return DEFAULT_SECTION_FOLDS;
    const { open, except } = data as Record<string, unknown>;
    if (typeof open !== 'boolean' || !Array.isArray(except) || !except.every((id) => typeof id === 'string')) {
      return DEFAULT_SECTION_FOLDS;
    }
    return { open, except: except as string[] };
  } catch {
    return DEFAULT_SECTION_FOLDS;
  }
}

export function loadSectionFolds(): SectionFolds {
  try {
    return parseSectionFolds(localStorage.getItem(SECTIONS_KEY));
  } catch {
    return DEFAULT_SECTION_FOLDS;
  }
}

export function saveSectionFolds(folds: SectionFolds): void {
  try {
    localStorage.setItem(SECTIONS_KEY, JSON.stringify(folds));
  } catch {
    // Storage blocked: the folds still apply for this session.
  }
}
