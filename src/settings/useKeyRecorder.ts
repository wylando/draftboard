import { useEffect } from 'react';
import { bindingFromEvent, type Binding } from './keybindings/keys';
import { useLatest } from '../shared/useLatest';

/**
 * While `active`, captures the next key combination before anything else sees
 * it. Escape cancels; lone modifier presses are ignored (waiting for the key).
 */
export function useKeyRecorder(active: boolean, onRecord: (binding: Binding) => void, onCancel: () => void) {
  const handlers = useLatest({ onRecord, onCancel });

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const plain = !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey;
      if (plain && e.key === 'Escape') return handlers.current.onCancel();
      const binding = bindingFromEvent(e);
      if (binding) handlers.current.onRecord(binding);
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [active, handlers]);
}
