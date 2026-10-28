import { createToaster, Toaster, Toast } from '@ark-ui/react/toast';
import { token } from 'styled-system/tokens';
import { toast } from 'styled-system/recipes';

const toaster = createToaster({
  placement: 'bottom',
  // Short enough not to linger, long enough to read "Deleted 2 layers" and reach Undo.
  duration: 3000,
  max: 3,
  overlap: false,
  gap: 8,
  offsets: token.var('spacing.toolDockClearance'),
  // Ark's default is Alt+T, which moves focus into the region. A key that no event carries turns it off
  // (an empty list would match every key).
  hotkey: ['NoHotkey'],
});

/**
 * Shows a brief message over the canvas. `action` adds a button that also dismisses the toast. A new `id`
 * replaces the toast that has it, so a held key updates one toast instead of stacking.
 */
export function notify(message: string, options: { id?: string; action?: { label: string; onClick: () => void } } = {}) {
  toaster.create({ title: message, type: 'info', ...options });
}

/** One region per canvas: mount it inside the positioned canvas panel. */
export function ToastRegion() {
  const classes = toast();
  return (
    <Toaster
      toaster={toaster}
      label="Notifications"
      // The label Ark builds would end with its hotkey.
      aria-label="Notifications"
      className={classes.group}
      data-testid="toast-region"
    >
      {(t) => (
        <Toast.Root key={t.id} className={classes.root} data-testid="toast">
          <Toast.Title className={classes.title}>{t.title}</Toast.Title>
          {t.action && (
            <Toast.ActionTrigger className={classes.actionTrigger} data-testid="toast-action">
              {t.action.label}
            </Toast.ActionTrigger>
          )}
        </Toast.Root>
      )}
    </Toaster>
  );
}
