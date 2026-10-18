/**
 * Canonical binding strings: modifiers in a fixed order, then one key.
 *   "Mod+Shift+Z", "Shift+0", "V", "Backspace", "Mod+Alt+]"
 * `Mod` is ⌘ on macOS and Ctrl elsewhere; either one matches at runtime.
 */
export type Binding = string;

const MODIFIERS = ['Mod', 'Alt', 'Shift'] as const;

/** Physical key codes for punctuation, so Shift/Alt can't change the result. */
const CODE_KEYS: Record<string, string> = {
  BracketLeft: '[',
  BracketRight: ']',
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  Space: 'Space',
};

const NAMED_KEYS = new Set([
  'Backspace',
  'Delete',
  'Escape',
  'Enter',
  'Tab',
  'Space',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
  'PageUp',
  'PageDown',
]);

const MODIFIER_KEYS = new Set(['Meta', 'Control', 'Alt', 'Shift', 'OS', 'AltGraph', 'CapsLock']);

/** The non-modifier part of a key event, or null for a bare modifier press. */
export function keyFromEvent(e: Pick<KeyboardEvent, 'key' | 'code'>): string | null {
  if (MODIFIER_KEYS.has(e.key)) return null;
  // Prefer the physical code: Shift/Alt rewrite `key` (Shift+0 → ")", Alt+] → "‘").
  const letter = /^Key([A-Z])$/.exec(e.code);
  if (letter?.[1]) return letter[1];
  const digit = /^Digit([0-9])$/.exec(e.code);
  if (digit?.[1]) return digit[1];
  const mapped = CODE_KEYS[e.code];
  if (mapped) return mapped;
  // No usable code (some synthetic events): fall back to `key`.
  if (e.key === ' ') return 'Space';
  if (NAMED_KEYS.has(e.key)) return e.key;
  if (e.key.length === 1) return e.key.toUpperCase();
  return null;
}

export function bindingFromEvent(
  e: Pick<KeyboardEvent, 'key' | 'code' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>,
): Binding | null {
  const key = keyFromEvent(e);
  if (!key) return null;
  const parts: string[] = [];
  if (e.metaKey || e.ctrlKey) parts.push('Mod');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  parts.push(key);
  return parts.join('+');
}

/** Validates a stored binding string (used when loading saved settings). */
export function isValidBinding(value: unknown): value is Binding {
  if (typeof value !== 'string' || value.length === 0) return false;
  const parts = value.split('+');
  // "+" is never a key here (Equal is "="), so splitting is unambiguous.
  const key = parts.pop();
  if (!key) return false;
  const mods = parts;
  const ordered = MODIFIERS.filter((m) => mods.includes(m));
  return (
    mods.length === ordered.length &&
    mods.every((m, i) => m === ordered[i]) &&
    (NAMED_KEYS.has(key) || /^[A-Z0-9]$/.test(key) || Object.values(CODE_KEYS).includes(key))
  );
}

/**
 * Combos browsers commonly handle before the page sees them (tab/window
 * management, quit, settings). Recording them would create a dead shortcut.
 */
export const RESERVED_BINDINGS: ReadonlySet<Binding> = new Set([
  'Mod+W',
  'Mod+T',
  'Mod+N',
  'Mod+Q',
  'Mod+Shift+W',
  'Mod+Shift+T',
  'Mod+Shift+N',
  'Mod+,',
]);

const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

const KEY_LABELS: Record<string, string> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Backspace: '⌫',
  Delete: 'Del',
  Escape: 'Esc',
  Enter: '↵',
};

/** Human-readable parts, e.g. ["⌘", "⇧", "Z"] on macOS or ["Ctrl", "Shift", "Z"]. */
export function formatBinding(binding: Binding): string[] {
  const mac = isMac();
  return binding.split('+').map((part, i, all) => {
    if (i < all.length - 1) {
      if (part === 'Mod') return mac ? '⌘' : 'Ctrl';
      if (part === 'Alt') return mac ? '⌥' : 'Alt';
      if (part === 'Shift') return mac ? '⇧' : 'Shift';
    }
    return KEY_LABELS[part] ?? part;
  });
}

export const formatBindingText = (binding: Binding) => formatBinding(binding).join(isMac() ? '' : '+');
