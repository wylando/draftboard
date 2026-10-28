import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from 'react';

/**
 * The layer the pointer would act on, from either the canvas or the Layers panel. UI only: never in `EditorState`,
 * so it has no history. A store rather than context state so that a change re-renders only the rows and outline
 * that read the id they care about, not every layer row.
 */
interface HoverStore {
  get: () => string | null;
  set: (id: string | null) => void;
  subscribe: (listener: () => void) => () => void;
}

function createHoverStore(): HoverStore {
  let current: string | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set: (id) => {
      if (id === current) return;
      current = id;
      listeners.forEach((l) => l());
    },
    subscribe: (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

const HoverContext = createContext<HoverStore>(createHoverStore());

export function HoverProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createHoverStore);
  return <HoverContext.Provider value={store}>{children}</HoverContext.Provider>;
}

export function useHoveredId(): string | null {
  const store = useContext(HoverContext);
  return useSyncExternalStore(store.subscribe, store.get);
}

/** Whether `id` is the hovered layer; re-renders its caller only when that answer changes. */
export function useIsHovered(id: string): boolean {
  const store = useContext(HoverContext);
  return useSyncExternalStore(store.subscribe, () => store.get() === id);
}

export function useSetHovered(): (id: string | null) => void {
  return useContext(HoverContext).set;
}
