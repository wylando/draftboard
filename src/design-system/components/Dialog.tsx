import { Dialog as ArkDialog } from '@ark-ui/react/dialog';
import { Portal } from '@ark-ui/react/portal';
import { createContext, useContext, useEffect, type Key, type ReactNode } from 'react';
import { dialog } from 'styled-system/recipes';

const classes = dialog();

/** Every open `<Dialog>` counts itself with DialogProvider, so `useDialogs().isOpen` covers custom dialogs too. */
export const OpenDialogTracker = createContext<((delta: 1 | -1) => void) | null>(null);

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  /**
   * `alertdialog` for confirmations: an outside click doesn't close it, and
   * focus starts on the `DialogClose` button (the safe choice).
   */
  role?: 'dialog' | 'alertdialog';
  /** Body content between the description and the actions. */
  children?: ReactNode;
  /** Changing it starts the body at the top, so a dialog that swaps steps doesn't keep the old scroll position. */
  bodyKey?: Key;
  /** Buttons along the bottom. Wrap the dismissing one in `<DialogClose asChild>`. */
  actions?: ReactNode;
}

/**
 * Modal dialog on Ark UI. Escape and the close button call
 * `onOpenChange(false)`; focus is trapped inside and returns to where it was.
 * For a plain alert or yes/no question, use `useDialogs()` instead.
 */
export function Dialog({ open, onOpenChange, title, description, role = 'dialog', children, bodyKey, actions }: DialogProps) {
  const track = useContext(OpenDialogTracker);
  useEffect(() => {
    if (!open || !track) return;
    track(1);
    return () => track(-1);
  }, [open, track]);

  return (
    // Keep the root mounted (Ark's guidance); lazyMount/unmountOnExit drop the content while closed.
    <ArkDialog.Root open={open} onOpenChange={(e) => onOpenChange(e.open)} role={role} lazyMount unmountOnExit>
      <Portal>
        <ArkDialog.Backdrop className={classes.backdrop} />
        <ArkDialog.Positioner className={classes.positioner}>
          <ArkDialog.Content className={classes.content} data-testid="dialog">
            <ArkDialog.Title className={classes.title}>{title}</ArkDialog.Title>
            {description !== undefined && (
              <ArkDialog.Description className={classes.description}>{description}</ArkDialog.Description>
            )}
            {children !== undefined && <div key={bodyKey} className={classes.body} data-testid="dialog-body">{children}</div>}
            {actions !== undefined && <div className={classes.actions}>{actions}</div>}
          </ArkDialog.Content>
        </ArkDialog.Positioner>
      </Portal>
    </ArkDialog.Root>
  );
}

/** Closes the surrounding Dialog. Use `asChild` to render it as a `<Button>`. */
export const DialogClose = ArkDialog.CloseTrigger;
