import type { HTMLAttributes } from 'react';
import { cx } from 'styled-system/css';
import { kbd } from 'styled-system/recipes';

export interface KbdProps extends HTMLAttributes<HTMLElement> {
  state?: 'default' | 'customized';
}

export function Kbd({ state, className, ...rest }: KbdProps) {
  return <kbd className={cx(kbd({ state }), className)} {...rest} />;
}
