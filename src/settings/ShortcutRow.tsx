import { css } from 'styled-system/css';
import { Button, IconButton, icons, Kbd } from '../design-system';
import { COMMANDS, type CommandId } from './keybindings/commands';
import { formatBinding, formatBindingText, type Binding } from './keybindings/keys';
import { useKeybindings } from './keybindings/KeybindingsContext';

const rowClass = css({
  display: 'grid',
  gridTemplateColumns: '1fr auto',
  alignItems: 'center',
  gap: '4',
  paddingBlock: '2',
  borderBottomWidth: '1px',
  borderBottomStyle: 'solid',
  borderBottomColor: 'border',
});
const labelClass = css({ textStyle: 'heading.section' });
const descriptionClass = css({ color: 'text.secondary' });
const controlsClass = css({ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap', gap: '1' });
const chipClass = css({ display: 'inline-flex', alignItems: 'center', gap: '1' });
const removeClass = css({ width: 'kbd', height: 'kbd' });
const hintClass = css({ color: 'text.secondary' });
const noticeClass = css({
  gridColumn: '1 / -1',
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: '2',
  padding: '2',
  borderRadius: 'medium',
  bg: 'bg.secondary',
});
const errorClass = css({ gridColumn: '1 / -1', color: 'text.danger' });

export type RowStatus =
  | { kind: 'idle' }
  | { kind: 'recording' }
  | { kind: 'conflict'; binding: Binding; owner: CommandId }
  | { kind: 'error'; message: string };

interface Props {
  id: CommandId;
  status: RowStatus;
  onRecord: () => void;
  onCancel: () => void;
  onConfirmReplace: () => void;
}

function KeyCombo({ binding }: { binding: Binding }) {
  return (
    <>
      {formatBinding(binding).map((part, i) => (
        <span key={i}>{part}</span>
      ))}
    </>
  );
}

export function ShortcutRow({ id, status, onRecord, onCancel, onConfirmReplace }: Props) {
  const { bindings, setBindings, reset, isCustomized } = useKeybindings();
  const command = COMMANDS[id];
  const list = bindings[id];
  const customized = isCustomized(id);

  return (
    <div className={rowClass} data-testid={`shortcut-row-${id}`} data-customized={customized}>
      <div>
        <div className={labelClass}>{command.label}</div>
        <div className={descriptionClass}>{command.description}</div>
      </div>

      <div className={controlsClass}>
        {status.kind === 'recording' ? (
          <>
            <span className={hintClass} data-testid="recording-hint">
              Press a key combination… (Esc to cancel)
            </span>
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          </>
        ) : (
          <>
            {list.length === 0 && <span className={hintClass}>Not assigned</span>}
            {list.map((b) => (
              <span key={b} className={chipClass}>
                <Kbd state={customized ? 'customized' : 'default'} data-binding={b}>
                  <KeyCombo binding={b} />
                </Kbd>
                <IconButton
                  className={removeClass}
                  label={`Remove ${formatBindingText(b)} from ${command.label}`}
                  data-testid={`remove-binding`}
                  icon={<icons.close />}
                  onClick={() => setBindings(id, list.filter((x) => x !== b))}
                />
              </span>
            ))}
            <IconButton
              label={`Add shortcut for ${command.label}`}
              data-testid={`record-${id}`}
              icon={<icons.plus />}
              onClick={onRecord}
            />
            {customized && (
              <Button variant="ghost" data-testid={`reset-${id}`} onClick={() => reset(id)}>
                Reset
              </Button>
            )}
          </>
        )}
      </div>

      {status.kind === 'conflict' && (
        <div className={noticeClass} role="alert" data-testid="conflict-notice">
          <span>
            <Kbd>
              <KeyCombo binding={status.binding} />
            </Kbd>{' '}
            is already used by <strong>{COMMANDS[status.owner].label}</strong>.
          </span>
          <Button variant="primary" data-testid="confirm-replace" onClick={onConfirmReplace}>
            Use for {command.label}
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      )}
      {status.kind === 'error' && (
        <div className={errorClass} role="alert" data-testid="binding-error">
          {status.message}
        </div>
      )}
    </div>
  );
}
