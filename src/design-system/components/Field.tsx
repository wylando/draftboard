import { Field } from '@ark-ui/react/field';
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { field } from 'styled-system/recipes';
import { useLatest } from '../../shared/useLatest';

const classes = field();

interface FieldShellProps {
  label?: ReactNode;
  /** Shown under the field; also marks the input invalid and describes it. */
  error?: ReactNode;
  children: ReactNode;
  /** Tooltip over the whole field, for fields whose visible label is only a letter or an icon. */
  title?: string;
  /** Makes the label a scrub handle (NumberInput). */
  onLabelPointerDown?: (e: ReactPointerEvent<HTMLSpanElement>) => void;
  onClick?: (e: MouseEvent<HTMLLabelElement>) => void;
}

/**
 * Ark's Field wires the label, aria-invalid and aria-describedby to the input.
 * The whole box is the label, so clicking anywhere in it focuses the input.
 */
function FieldShell({ label, error, children, title, onLabelPointerDown, onClick }: FieldShellProps) {
  const invalid = error !== undefined && error !== null;
  return (
    <Field.Root className={classes.root} invalid={invalid}>
      <Field.Label className={classes.control} title={title} onClick={onClick}>
        {label !== undefined && (
          <span className={classes.label} data-scrub={onLabelPointerDown ? '' : undefined} onPointerDown={onLabelPointerDown}>
            {label}
          </span>
        )}
        {children}
      </Field.Label>
      {/* role="alert" so the refusal is announced as soon as it appears. */}
      <Field.ErrorText className={classes.errorText} role="alert">
        {error}
      </Field.ErrorText>
    </Field.Root>
  );
}

/**
 * Fields keep a local draft and commit on Enter/blur, so a half-typed value
 * never reaches the document and each edit produces a single undo step.
 */
function useDraft<T>(value: T, format: (v: T) => string) {
  const [draft, setDraft] = useState(format(value));
  const formatRef = useLatest(format);
  // Re-sync only when the committed value changes, never on keystrokes.
  useEffect(() => setDraft(formatRef.current(value)), [value, formatRef]);
  return [draft, setDraft] as const;
}

function blurOnEnter(e: KeyboardEvent<HTMLInputElement>) {
  if (e.key === 'Enter') e.currentTarget.blur();
  if (e.key === 'Escape') e.currentTarget.blur();
}

const formatNumber = (v: number) => String(Math.round(v * 100) / 100);

export interface NumberInputProps {
  /** Visible prefix inside the field: a letter or an icon. */
  label?: ReactNode;
  /** Full name, for the accessible name and tooltip when `label` is only a glyph. */
  name?: string;
  value: number;
  /** The selected layers disagree: the field is empty with a "Mixed" placeholder, and any typed value applies to all. */
  mixed?: boolean;
  /** A typed edit, committed on Enter/blur. */
  onCommit: (value: number) => void;
  /**
   * Passing this makes the label scrubbable: dragging it sideways sends a value
   * on every tick. Callers apply these without a history checkpoint;
   * `onScrubStart` fires once, before the first of them, so a whole scrub is
   * one undo step.
   */
  onScrubChange?: (value: number) => void;
  onScrubStart?: () => void;
  min?: number;
  max?: number;
  testId?: string;
}

/** Pixels the pointer must travel before a press on the label becomes a scrub, so a click still focuses the input. */
const SCRUB_THRESHOLD = 3;

/** Design choice: 1 unit per pixel; Shift for coarse (×10), Alt for fine (×0.1) steps. */
function scrubStep(e: PointerEvent) {
  if (e.shiftKey) return 10;
  if (e.altKey) return 0.1;
  return 1;
}

interface Scrub {
  startX: number;
  lastX: number;
  /** Unrounded and clamped, so fine steps accumulate and reversing at a limit responds at once. */
  current: number;
  emitted: number;
  moved: boolean;
  started: boolean;
}

export function NumberInput({ label, name, value, mixed, onCommit, onScrubChange, onScrubStart, min, max, testId }: NumberInputProps) {
  const [draft, setDraft] = useDraft<number | null>(mixed ? null : value, (v) => (v === null ? '' : formatNumber(v)));
  const clamp = (v: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));

  const shown = mixed ? '' : formatNumber(value);
  const commit = () => {
    // An untouched Mixed field must not turn into a 0 for every layer.
    if (mixed && draft.trim() === '') return;
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(shown);
      return;
    }
    const clamped = clamp(parsed);
    if (mixed || clamped !== value) onCommit(clamped);
    else setDraft(shown);
  };

  const scrub = useRef<Scrub | null>(null);
  const suppressClick = useRef(false);

  const onLabelPointerDown = (e: ReactPointerEvent<HTMLSpanElement>) => {
    if (e.button !== 0 || !e.isPrimary) return;
    suppressClick.current = false;
    scrub.current = { startX: e.clientX, lastX: e.clientX, current: value, emitted: value, moved: false, started: false };
  };

  const valueRef = useLatest(value);
  const onMove = (e: PointerEvent) => {
    const s = scrub.current;
    if (!s) return;
    if (!s.moved) {
      if (Math.abs(e.clientX - s.startX) < SCRUB_THRESHOLD) return;
      // The press blurs this field's input, which may commit a typed draft after pointerdown; start from that.
      s.moved = true;
      s.current = s.emitted = valueRef.current;
    }
    const step = scrubStep(e);
    s.current = clamp(s.current + (e.clientX - s.lastX) * step);
    s.lastX = e.clientX;
    const next = step < 1 ? Math.round(s.current * 10) / 10 : Math.round(s.current);
    if (next === s.emitted) return;
    if (!s.started) {
      s.started = true;
      onScrubStart?.();
    }
    s.emitted = next;
    onScrubChange?.(next);
  };

  const onUp = () => {
    // The label wraps the input, so the click that ends a drag would otherwise focus it.
    if (scrub.current?.moved) suppressClick.current = true;
    scrub.current = null;
  };

  const moveRef = useLatest(onMove);
  const upRef = useLatest(onUp);
  const scrubbable = onScrubChange !== undefined;
  useEffect(() => {
    if (!scrubbable) return;
    const move = (e: PointerEvent) => moveRef.current(e);
    const up = () => upRef.current();
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [scrubbable, moveRef, upRef]);

  return (
    <FieldShell
      label={label}
      title={name}
      onLabelPointerDown={scrubbable ? onLabelPointerDown : undefined}
      onClick={(e) => {
        if (!suppressClick.current) return;
        suppressClick.current = false;
        e.preventDefault();
      }}
    >
      <Field.Input
        className={classes.input}
        inputMode="decimal"
        aria-label={name}
        placeholder={mixed ? 'Mixed' : undefined}
        value={draft}
        data-testid={testId}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={blurOnEnter}
      />
    </FieldShell>
  );
}

const identity = (v: string) => v;

export interface TextInputProps {
  label?: ReactNode;
  error?: ReactNode;
  value: string;
  onCommit: (value: string) => void;
  /** Id of a `<datalist>` whose options the browser suggests while typing. */
  list?: string;
  /** Focuses the input and selects its text when it mounts, for something just created that wants a name. */
  autoSelect?: boolean;
  /** Called once `autoSelect` has focused the input, so the caller can stop asking for it. */
  onAutoSelected?: () => void;
  testId?: string;
}

export function TextInput({ label, error, value, onCommit, list, autoSelect, onAutoSelected, testId }: TextInputProps) {
  const [draft, setDraft] = useDraft(value, identity);
  const input = useRef<HTMLInputElement>(null);
  // Kept from the first render: a later re-render must not pull focus back.
  const [selectOnMount] = useState(autoSelect);
  const selected = useLatest(onAutoSelected);
  useEffect(() => {
    if (!selectOnMount) return;
    input.current?.focus();
    input.current?.select();
    selected.current?.();
  }, [selectOnMount, selected]);
  return (
    <FieldShell label={label} error={error}>
      <Field.Input
        ref={input}
        className={classes.input}
        value={draft}
        list={list}
        data-testid={testId}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== value) onCommit(draft);
          // A rejected commit leaves `value` as it was, so show it again; an accepted one re-syncs via useDraft.
          setDraft(value);
        }}
        onKeyDown={blurOnEnter}
      />
    </FieldShell>
  );
}

const HEX = /^#?([0-9a-f]{6})$/i;

export interface ColorInputProps {
  value: string;
  onCommit: (value: string) => void;
  testId?: string;
  /** Accessible name and tooltip for the hex field; no visible label names it. */
  label?: string;
  /** The selected layers disagree: the hex field is empty with a "Mixed" placeholder, and any colour applies to all. */
  mixed?: boolean;
}

/**
 * Hex text field + native color picker (works offline, no dependency).
 * React's onChange fires on every `input` tick while the picker is dragged,
 * so the swatch keeps a local draft and commits once on the native `change`
 * event, giving one undo step per color pick.
 */
export function ColorInput({ value, onCommit, testId, label, mixed }: ColorInputProps) {
  const [draft, setDraft] = useDraft<string | null>(mixed ? null : value, (v) => (v === null ? '' : v.toUpperCase()));
  const [swatch, setSwatch] = useDraft(value, (v: string) => v);
  const swatchRef = useRef<HTMLInputElement>(null);
  const commitRef = useLatest(onCommit);
  const valueRef = useLatest(value);
  const mixedRef = useLatest(mixed);

  useEffect(() => {
    const el = swatchRef.current;
    if (!el) return;
    const onNativeChange = () => {
      if (mixedRef.current || el.value !== valueRef.current) commitRef.current(el.value);
    };
    el.addEventListener('change', onNativeChange);
    return () => el.removeEventListener('change', onNativeChange);
  }, [commitRef, valueRef, mixedRef]);

  const commitText = () => {
    const match = HEX.exec(draft.trim());
    if (match?.[1]) {
      const next = `#${match[1].toLowerCase()}`;
      if (mixed || next !== value) onCommit(next);
      else setDraft(value.toUpperCase());
    } else {
      setDraft(mixed ? '' : value.toUpperCase());
    }
  };

  return (
    <FieldShell title={label}>
      <input
        ref={swatchRef}
        type="color"
        className={classes.swatch}
        value={swatch}
        aria-label={label ? `${label} picker` : 'Pick color'}
        data-testid={testId && `${testId}-swatch`}
        onChange={(e) => setSwatch(e.target.value)}
      />
      <Field.Input
        className={classes.input}
        value={draft}
        aria-label={label}
        placeholder={mixed ? 'Mixed' : undefined}
        data-testid={testId}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitText}
        onKeyDown={blurOnEnter}
      />
    </FieldShell>
  );
}
