import { createToaster, Toaster, Toast } from '@ark-ui/react/toast';
import { toast } from 'styled-system/recipes';

const toaster = createToaster({
  placement: 'bottom',
  // Short enough not to linger, long enough to read "Deleted 2 layers" and reach Undo.
  duration: 3000,
  max: 3,
  overlap: false,
  gap: 8,
  // Lifts the region above the floating tool dock (the `toolDockClearance` token's value).
  offsets: '4.5rem',
});

/** Shows a brief message over the canvas. `action` adds a button that also dismisses the toast. */
export function notify(message: string, action?: { label: string; onClick: () => void }) {
  toaster.create({ title: message, type: 'info', action });
}

/** One region per canvas: mount it inside the positioned canvas panel. */
export function ToastRegion() {
  const classes = toast();
  return (
    <Toaster
      toaster={toaster}
      label="Notifications"
      className={classes.group}
      data-testid="toast-region"
      // Ark fixes the region to the window; it belongs to the canvas panel and spans its width.
      style={{ position: 'absolute', insetInline: 0 }}
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
