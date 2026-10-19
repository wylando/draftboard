import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from 'styled-system/css';
import { iconButton } from 'styled-system/recipes';

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Required: icon-only buttons need an accessible name. */
  label: string;
  icon: ReactNode;
  tone?: 'light' | 'dark';
}

export function IconButton({ label, icon, tone, className, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cx(iconButton({ tone }), className)}
      {...rest}
    >
      {icon}
    </button>
  );
}
