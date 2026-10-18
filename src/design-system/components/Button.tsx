import type { ButtonHTMLAttributes } from 'react';
import { cx } from 'styled-system/css';
import { button, type ButtonVariantProps } from 'styled-system/recipes';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: NonNullable<ButtonVariantProps>['variant'];
}

export function Button({ variant, className, type = 'button', ...rest }: ButtonProps) {
  return <button type={type} className={cx(button({ variant }), className)} {...rest} />;
}
