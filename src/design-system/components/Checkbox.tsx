import { Checkbox as ArkCheckbox } from '@ark-ui/react/checkbox';
import type { ReactNode } from 'react';
import { checkbox } from 'styled-system/recipes';
import { icons } from '../icons';

const classes = checkbox();

export interface CheckboxProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** The label; it is the checkbox's accessible name. */
  children: ReactNode;
  disabled?: boolean;
  /** For native form submission via the hidden input. */
  name?: string;
  value?: string;
  'data-testid'?: string;
}

/** Two-state checkbox on Ark UI; a hidden input carries the form and keyboard semantics (Space toggles). */
export function Checkbox({ checked, onCheckedChange, children, disabled, name, value, 'data-testid': testId }: CheckboxProps) {
  return (
    <ArkCheckbox.Root
      className={classes.root}
      checked={checked}
      disabled={disabled}
      name={name}
      value={value}
      onCheckedChange={(e) => onCheckedChange(e.checked === true)}
      data-testid={testId}
    >
      <ArkCheckbox.Control className={classes.control}>
        <ArkCheckbox.Indicator className={classes.indicator}>{icons.check()}</ArkCheckbox.Indicator>
      </ArkCheckbox.Control>
      <ArkCheckbox.Label className={classes.label}>{children}</ArkCheckbox.Label>
      <ArkCheckbox.HiddenInput />
    </ArkCheckbox.Root>
  );
}
