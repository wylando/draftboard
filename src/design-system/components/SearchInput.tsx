import { field } from 'styled-system/recipes';
import { icons } from '../icons';

const classes = field();

export interface SearchInputProps {
  value: string;
  /** Fires on every keystroke (unlike TextInput, which commits on blur). */
  onChange: (value: string) => void;
  placeholder?: string;
  label: string;
  testId?: string;
}

export function SearchInput({ value, onChange, placeholder, label, testId }: SearchInputProps) {
  return (
    <label className={classes.root}>
      <span className={classes.label}>
        <icons.search />
      </span>
      <input
        type="search"
        className={classes.input}
        value={value}
        placeholder={placeholder}
        aria-label={label}
        data-testid={testId}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
