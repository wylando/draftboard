import { useMemo, useState } from 'react';
import { css } from 'styled-system/css';
import { Button, Kbd, SearchInput, useDialogs } from '../design-system';
import { CATEGORY_LABELS, COMMAND_IDS, COMMANDS, FIXED_INTERACTIONS, type CommandCategory, type CommandId } from './keybindings/commands';
import { formatBindingText, RESERVED_BINDINGS, type Binding } from './keybindings/keys';
import { useKeybindings } from './keybindings/KeybindingsContext';
import { ShortcutRow, type RowStatus } from './ShortcutRow';
import { useKeyRecorder } from './useKeyRecorder';

const toolbarClass = css({ display: 'flex', alignItems: 'center', gap: '3', marginBlock: '4' });
const searchClass = css({ flex: '1' });
const groupTitleClass = css({ margin: '0', marginTop: '6', marginBottom: '1', textStyle: 'body.largeStrong' });
const mutedClass = css({ margin: '0', color: 'text.secondary' });
const footnoteClass = css({ marginTop: '6', marginBottom: '0', color: 'text.secondary' });
const fixedRowClass = css({
  display: 'grid',
  gridTemplateColumns: '1fr auto',
  gap: '4',
  paddingBlock: '2',
  borderBottomWidth: '1px',
  borderBottomStyle: 'solid',
  borderBottomColor: 'border',
});

const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS) as CommandCategory[];

const IDLE: RowStatus = { kind: 'idle' };

export function ShortcutsSection() {
  const { bindings, commandFor, assign, resetAll, isCustomized } = useKeybindings();
  const dialogs = useDialogs();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState<{ id: CommandId; status: RowStatus } | null>(null);

  const recordingId = active?.status.kind === 'recording' ? active.id : null;

  const onRecorded = (binding: Binding) => {
    if (!recordingId) return;
    if (RESERVED_BINDINGS.has(binding)) {
      setActive({
        id: recordingId,
        status: { kind: 'error', message: `${formatBindingText(binding)} is usually reserved by the browser, so it can't be used.` },
      });
      return;
    }
    const owner = commandFor(binding);
    if (owner && owner !== recordingId) {
      setActive({ id: recordingId, status: { kind: 'conflict', binding, owner } });
      return;
    }
    assign(recordingId, binding);
    setActive(null);
  };

  useKeyRecorder(recordingId !== null, onRecorded, () => setActive(null));

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COMMAND_IDS;
    return COMMAND_IDS.filter((id) => {
      const c = COMMANDS[id];
      const keys = bindings[id].map(formatBindingText).join(' ');
      return `${c.label} ${c.description} ${CATEGORY_LABELS[c.category]} ${keys}`.toLowerCase().includes(q);
    });
  }, [query, bindings]);

  const anyCustomized = COMMAND_IDS.some(isCustomized);

  return (
    <section data-testid="shortcuts-section">
      <h1>Keyboard shortcuts</h1>
      <p className={mutedClass}>
        Click <strong>+</strong> next to a command, then press the keys you want. Changes save automatically and are
        kept the next time you open Draftboard in this browser.
      </p>

      <div className={toolbarClass}>
        <div className={searchClass}>
          <SearchInput
            label="Search shortcuts"
            placeholder="Search commands or keys"
            value={query}
            onChange={setQuery}
            testId="shortcut-search"
          />
        </div>
        <Button
          data-testid="reset-all"
          disabled={!anyCustomized}
          onClick={async () => {
            // A recording captures every key first, so stop it before the dialog needs the keyboard.
            setActive(null);
            const confirmed = await dialogs.confirm({
              title: 'Reset all shortcuts?',
              description: 'Every command goes back to its default keys. Your custom shortcuts are removed.',
              confirmLabel: 'Reset all',
              destructive: true,
            });
            if (confirmed) resetAll();
          }}
        >
          Reset all to defaults
        </Button>
      </div>

      {CATEGORY_ORDER.map((category) => {
        const ids = visible.filter((id) => COMMANDS[id].category === category);
        if (ids.length === 0) return null;
        return (
          <div key={category} data-testid={`category-${category}`}>
            <h2 className={groupTitleClass}>{CATEGORY_LABELS[category]}</h2>
            {ids.map((id) => (
              <ShortcutRow
                key={id}
                id={id}
                status={active?.id === id ? active.status : IDLE}
                onRecord={() => setActive({ id, status: { kind: 'recording' } })}
                onCancel={() => setActive(null)}
                onConfirmReplace={() => {
                  if (active?.status.kind === 'conflict') assign(id, active.status.binding);
                  setActive(null);
                }}
              />
            ))}
          </div>
        );
      })}
      {visible.length === 0 && (
        <p className={mutedClass} data-testid="no-results">
          No commands match “{query}”.
        </p>
      )}

      <h2 className={groupTitleClass}>Mouse and held keys</h2>
      <p className={mutedClass}>These depend on the pointer or a held key, so they aren't configurable.</p>
      {FIXED_INTERACTIONS.map((f) => (
        <div key={f.input} className={fixedRowClass}>
          <div>
            <strong>{f.label}</strong>
            <div className={mutedClass}>{f.description}</div>
          </div>
          <Kbd>{f.input}</Kbd>
        </div>
      ))}

      <p className={footnoteClass}>
        Shortcuts are stored in this browser for {window.location.origin}. Clearing site data, switching browsers, or
        opening Draftboard at a different address starts from the defaults.
      </p>
    </section>
  );
}
