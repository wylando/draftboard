import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button } from './Button';
import { Dialog, DialogClose, OpenDialogTracker } from './Dialog';

export interface AlertOptions {
  title: string;
  description?: string;
}

export interface ConfirmOptions extends AlertOptions {
  /** Label of the button that resolves `true`. Name the action ("Replace"), not "OK". */
  confirmLabel: string;
  cancelLabel?: string;
  /** Styles the confirm button as destructive: the action throws work away that undo can't bring back. */
  destructive?: boolean;
}

interface Request extends AlertOptions {
  kind: 'alert' | 'confirm';
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
  resolve: (confirmed: boolean) => void;
}

export interface DialogsApi {
  /** Shows a message with one OK button. Resolves when it closes. */
  alert: (options: AlertOptions) => Promise<void>;
  /** Asks a yes/no question. Resolves `true` only for the confirm button; Escape and Cancel give `false`. */
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  /** True while any `<Dialog>` is open. Window-level key handlers check this and stand down. */
  isOpen: boolean;
}

const DialogsContext = createContext<DialogsApi | null>(null);

/**
 * App-wide alert/confirm dialogs, replacing `window.alert` / `window.confirm`.
 * One dialog shows at a time; a new request cancels (resolves `false`) the open one.
 */
export function DialogProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<Request | null>(null);
  const [openCount, setOpenCount] = useState(0);
  const track = useCallback((delta: 1 | -1) => setOpenCount((n) => n + delta), []);
  // The open request's resolver, read by event handlers only (never during render).
  const pending = useRef<Request | null>(null);

  const show = useCallback(
    (r: Omit<Request, 'resolve'>) =>
      new Promise<boolean>((resolve) => {
        pending.current?.resolve(false);
        pending.current = { ...r, resolve };
        setRequest(pending.current);
      }),
    [],
  );

  const settle = (confirmed: boolean) => {
    pending.current?.resolve(confirmed);
    pending.current = null;
    setRequest(null);
  };

  const api = useMemo<DialogsApi>(
    () => ({
      alert: async (o) => {
        await show({ ...o, kind: 'alert', confirmLabel: 'OK', cancelLabel: '' });
      },
      confirm: (o) => show({ ...o, kind: 'confirm', cancelLabel: o.cancelLabel ?? 'Cancel' }),
      isOpen: openCount > 0,
    }),
    [show, openCount],
  );

  return (
    <DialogsContext.Provider value={api}>
      <OpenDialogTracker.Provider value={track}>
        {children}
        <Dialog
          open={request !== null}
          onOpenChange={(open) => !open && settle(false)}
          role="alertdialog"
          title={request?.title}
          description={request?.description}
          actions={
            request?.kind === 'confirm' ? (
              <>
                <DialogClose asChild>
                  <Button data-testid="dialog-cancel">{request.cancelLabel}</Button>
                </DialogClose>
                <Button variant={request.destructive ? 'danger' : 'primary'} data-testid="dialog-confirm" onClick={() => settle(true)}>
                  {request.confirmLabel}
                </Button>
              </>
            ) : (
              <DialogClose asChild>
                <Button variant="primary" data-testid="dialog-confirm">
                  OK
                </Button>
              </DialogClose>
            )
          }
        />
      </OpenDialogTracker.Provider>
    </DialogsContext.Provider>
  );
}

export function useDialogs(): DialogsApi {
  const api = useContext(DialogsContext);
  if (!api) throw new Error('useDialogs must be used inside <DialogProvider>');
  return api;
}
