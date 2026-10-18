import { COMMANDS, isCommandId, type CommandId } from './commands';
import { isValidBinding, type Binding } from './keys';

const STORAGE_KEY = 'draftboard:keybindings:v1';

/**
 * Only changes from the defaults are stored. An empty array is a deliberate
 * "unbound", distinct from "no override" (which means use the defaults).
 */
export type BindingOverrides = Partial<Record<CommandId, Binding[]>>;

/** Parses saved overrides, dropping unknown commands and invalid bindings. */
export function parseOverrides(raw: string | null): BindingOverrides {
  if (!raw) return {};
  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== 'object' || data === null || Array.isArray(data)) return {};
    const result: BindingOverrides = {};
    for (const [id, value] of Object.entries(data)) {
      if (!isCommandId(id) || !Array.isArray(value)) continue;
      result[id] = Array.from(new Set(value.filter(isValidBinding)));
    }
    return result;
  } catch {
    return {};
  }
}

export function loadOverrides(): BindingOverrides {
  try {
    return parseOverrides(localStorage.getItem(STORAGE_KEY));
  } catch {
    return {};
  }
}

export function saveOverrides(overrides: BindingOverrides): void {
  try {
    if (Object.keys(overrides).length === 0) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    // Storage blocked: bindings still work for this session.
  }
}

export function resolveBindings(overrides: BindingOverrides): Record<CommandId, Binding[]> {
  const result = {} as Record<CommandId, Binding[]>;
  for (const id of Object.keys(COMMANDS) as CommandId[]) {
    result[id] = overrides[id] ?? [...COMMANDS[id].defaults];
  }
  return result;
}
