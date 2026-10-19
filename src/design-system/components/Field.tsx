import { Field } from '@ark-ui/react/field';
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { field } from 'styled-system/recipes';
import { useLatest } from '../../shared/useLatest';

const classes = field();

interface FieldShellProps {
  label?: ReactNode;
  /** Shown under the field; also marks the input invalid and describes it. */
  error?: ReactNode;
  children: ReactNode;
}

/**
 * Ark's Field wires the label, aria-invalid and aria-describedby to the input.
 * The whole box is the label, so clicking anywhere in it focuses the input.
 */
function FieldShell({ label, error, children }: FieldShellProps) {
  const invalid = error !== undefined && error !== null;
  return (
    <Field.Root className={classes.root} invalid={invalid}>
      <Field.Label className={classes.control}>
        {label !== undefined && <span className={classes.label}>{label}</span>}
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
  label?: ReactNode;
  value: number;
  onCommit: (value: number) => void;
  min?: number;
  max?: number;
  testId?: string;
}

export function NumberInput({ label, value, onCommit, min, max, testId }: NumberInputProps) {
  const [draft, setDraft] = useDraft(value, formatNumber);

  const commit = () => {
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(formatNumber(value));
      return;
    }
    const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, parsed));
    if (clamped !== value) onCommit(clamped);
    else setDraft(formatNumber(value));
  };

  return (
    <FieldShell label={label}>
      <Field.Input
        className={classes.input}
        inputMode="decimal"
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
  testId?: string;
}

export function TextInput({ label, error, value, onCommit, testId }: TextInputProps) {
  const [draft, setDraft] = useDraft(value, identity);
  return (
    <FieldShell label={label} error={error}>
      <Field.Input
        className={classes.input}
        value={draft}
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
}

/**
 * Hex text field + native color picker (works offline, no dependency).
 * React's onChange fires on every `input` tick while the picker is dragged,
 * so the swatch keeps a local draft and commits once on the native `change`
 * event, giving one undo step per color pick.
 */
export function ColorInput({ value, onCommit, testId }: ColorInputProps) {
  const [draft, setDraft] = useDraft(value, (v: string) => v.replace('#', '').toUpperCase());
  const [swatch, setSwatch] = useDraft(value, (v: string) => v);
  const swatchRef = useRef<HTMLInputElement>(null);
  const commitRef = useLatest(onCommit);
  const valueRef = useLatest(value);

  useEffect(() => {
    const el = swatchRef.current;
    if (!el) return;
    const onNativeChange = () => {
      if (el.value !== valueRef.current) commitRef.current(el.value);
    };
    el.addEventListener('change', onNativeChange);
    return () => el.removeEventListener('change', onNativeChange);
  }, [commitRef, valueRef]);

  const commitText = () => {
    const match = HEX.exec(draft.trim());
    if (match?.[1]) {
      const next = `#${match[1].toLowerCase()}`;
      if (next !== value) onCommit(next);
    } else {
      setDraft(value.replace('#', '').toUpperCase());
    }
  };

  return (
    <FieldShell>
      <input
        ref={swatchRef}
        type="color"
        className={classes.swatch}
        value={swatch}
        aria-label="Pick color"
        data-testid={testId && `${testId}-swatch`}
        onChange={(e) => setSwatch(e.target.value)}
      />
      <Field.Input
        className={classes.input}
        value={draft}
        data-testid={testId}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitText}
        onKeyDown={blurOnEnter}
      />
    </FieldShell>
  );
}
