import { useLayoutEffect, useRef } from 'react';

/**
 * Ref that always holds the latest committed `value`, for reading inside
 * long-lived listeners without re-subscribing. Updated after commit (not
 * during render) so discarded renders can't leak values.
 */
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}
