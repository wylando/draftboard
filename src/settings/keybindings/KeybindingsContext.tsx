import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { COMMANDS, type CommandId } from './commands';
import type { Binding } from './keys';
import { loadOverrides, resolveBindings, saveOverrides, type BindingOverrides } from './storage';

interface KeybindingsValue {
  /** Effective bindings for every command. */
  bindings: Record<CommandId, Binding[]>;
  /** Reverse index for dispatch: binding → command. */
  commandFor: (binding: Binding) => CommandId | undefined;
  setBindings: (id: CommandId, bindings: Binding[]) => void;
  /** Assign `binding` to `id`, removing it from any other command first. */
  assign: (id: CommandId, binding: Binding) => void;
  reset: (id: CommandId) => void;
  resetAll: () => void;
  isCustomized: (id: CommandId) => boolean;
}

const KeybindingsContext = createContext<KeybindingsValue | null>(null);

const sameList = (a: readonly Binding[], b: readonly Binding[]) => a.length === b.length && a.every((x, i) => x === b[i]);

export function KeybindingsProvider({ children }: { children: ReactNode }) {
  const [overrides, setOverrides] = useState<BindingOverrides>(loadOverrides);

  useEffect(() => saveOverrides(overrides), [overrides]);

  const bindings = useMemo(() => resolveBindings(overrides), [overrides]);

  const index = useMemo(() => {
    const map = new Map<Binding, CommandId>();
    for (const [id, list] of Object.entries(bindings) as Array<[CommandId, Binding[]]>) {
      for (const b of list) map.set(b, id);
    }
    return map;
  }, [bindings]);

  const update = useCallback((changes: Partial<Record<CommandId, Binding[]>>) => {
    setOverrides((prev) => {
      const next = { ...prev };
      for (const [id, list] of Object.entries(changes) as Array<[CommandId, Binding[]]>) {
        // Matching the defaults again means "not customized": drop the override.
        if (sameList(list, COMMANDS[id].defaults)) delete next[id];
        else next[id] = list;
      }
      return next;
    });
  }, []);

  const value = useMemo<KeybindingsValue>(
    () => ({
      bindings,
      commandFor: (b) => index.get(b),
      setBindings: (id, list) => update({ [id]: list }),
      assign: (id, binding) => {
        const owner = index.get(binding);
        const changes: Partial<Record<CommandId, Binding[]>> = {};
        if (owner && owner !== id) changes[owner] = bindings[owner].filter((b) => b !== binding);
        if (!bindings[id].includes(binding)) changes[id] = [...bindings[id], binding];
        update(changes);
      },
      reset: (id) => {
        // Reclaim default keys that were since given to other commands.
        const changes: Partial<Record<CommandId, Binding[]>> = { [id]: [...COMMANDS[id].defaults] };
        for (const b of COMMANDS[id].defaults) {
          const owner = index.get(b);
          if (owner && owner !== id) changes[owner] = bindings[owner].filter((x) => x !== b);
        }
        update(changes);
      },
      resetAll: () => setOverrides({}),
      isCustomized: (id) => overrides[id] !== undefined,
    }),
    [bindings, index, overrides, update],
  );

  return <KeybindingsContext.Provider value={value}>{children}</KeybindingsContext.Provider>;
}

export function useKeybindings(): KeybindingsValue {
  const ctx = useContext(KeybindingsContext);
  if (!ctx) throw new Error('useKeybindings must be used inside <KeybindingsProvider>');
  return ctx;
}
