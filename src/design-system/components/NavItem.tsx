import type { ButtonHTMLAttributes } from 'react';
import { cx } from 'styled-system/css';
import { navItem } from 'styled-system/recipes';

export interface NavItemProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  current?: boolean;
}

export function NavItem({ current, className, type = 'button', ...rest }: NavItemProps) {
  return (
    <button type={type} aria-current={current ? 'page' : undefined} className={cx(navItem(), className)} {...rest} />
  );
}
