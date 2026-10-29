import { useCallback, useEffect, useState } from 'react';

export type Route = 'editor' | 'settings';

interface Location {
  route: Route;
  /** The Settings section slug after `#/settings/`, if any. */
  section: string | null;
}

const SETTINGS = '#/settings';

const fromHash = (hash: string): Location => {
  if (hash === SETTINGS) return { route: 'settings', section: null };
  if (hash.startsWith(`${SETTINGS}/`)) return { route: 'settings', section: hash.slice(SETTINGS.length + 1) || null };
  return { route: 'editor', section: null };
};

/**
 * Minimal hash routing (no dependency): `#/settings` survives reloads and the
 * browser Back button returns to the canvas. `#/settings/<section>` opens a Settings section.
 */
export function useHashRoute() {
  const [location, setLocation] = useState<Location>(() => fromHash(window.location.hash));

  useEffect(() => {
    const onChange = () => setLocation(fromHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const navigate = useCallback((next: Route, section?: string) => {
    window.location.hash = next === 'settings' ? (section ? `${SETTINGS}/${section}` : SETTINGS) : '';
  }, []);

  return { ...location, navigate };
}
