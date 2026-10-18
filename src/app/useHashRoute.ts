import { useCallback, useEffect, useState } from 'react';

export type Route = 'editor' | 'settings';

const routeFromHash = (hash: string): Route => (hash === '#/settings' ? 'settings' : 'editor');

/**
 * Minimal hash routing (no dependency): `#/settings` survives reloads and the
 * browser Back button returns to the canvas.
 */
export function useHashRoute() {
  const [route, setRoute] = useState<Route>(() => routeFromHash(window.location.hash));

  useEffect(() => {
    const onChange = () => setRoute(routeFromHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const navigate = useCallback((next: Route) => {
    window.location.hash = next === 'settings' ? '#/settings' : '';
  }, []);

  return { route, navigate };
}
