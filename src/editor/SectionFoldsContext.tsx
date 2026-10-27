import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  foldAllSections,
  isSectionOpen,
  loadSectionFolds,
  saveSectionFolds,
  setSectionOpen,
  type SectionFolds,
} from './panelLayout';

interface SectionFoldsValue {
  folds: SectionFolds;
  setOpen: (id: string, open: boolean) => void;
  foldAll: (open: boolean) => void;
}

const SectionFoldsContext = createContext<SectionFoldsValue | null>(null);

// Above the Design panel, which remounts per board and per selected layer, and beside its header's buttons.
export function SectionFoldsProvider({ children }: { children: ReactNode }) {
  const [folds, setFolds] = useState<SectionFolds>(loadSectionFolds);

  useEffect(() => saveSectionFolds(folds), [folds]);

  const value = useMemo<SectionFoldsValue>(
    () => ({
      folds,
      setOpen: (id, open) => setFolds((prev) => setSectionOpen(prev, id, open)),
      foldAll: (open) => setFolds(foldAllSections(open)),
    }),
    [folds],
  );

  return <SectionFoldsContext.Provider value={value}>{children}</SectionFoldsContext.Provider>;
}

export function useSectionFolds(): SectionFoldsValue {
  const ctx = useContext(SectionFoldsContext);
  if (!ctx) throw new Error('useSectionFolds must be used inside <SectionFoldsProvider>');
  return ctx;
}

/** Gives the props that make a titled `Section` fold, by an id that stays fixed even where its title changes. */
export function useSectionFold() {
  const { folds, setOpen } = useSectionFolds();
  return (id: string) => ({
    open: isSectionOpen(folds, id),
    onOpenChange: (open: boolean) => setOpen(id, open),
    toggleTestId: `section-toggle-${id}`,
  });
}
