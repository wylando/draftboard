import { Collapsible } from '@ark-ui/react/collapsible';
import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from 'styled-system/css';
import { panel, section } from 'styled-system/recipes';
import { icons } from '../icons';

export function Panel({ className, ...rest }: HTMLAttributes<HTMLElement>) {
  return <aside className={cx(panel(), className)} {...rest} />;
}

export interface SectionProps {
  title?: ReactNode;
  children: ReactNode;
  testId?: string;
  /** With `onOpenChange` and a title, the title becomes a button that folds the section. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  toggleTestId?: string;
}

export function Section({ title, children, testId, open, onOpenChange, toggleTestId }: SectionProps) {
  const classes = section();
  if (title === undefined || onOpenChange === undefined) {
    return (
      <section className={classes.root} data-testid={testId}>
        {title !== undefined && <h2 className={classes.title}>{title}</h2>}
        <div className={classes.body}>{children}</div>
      </section>
    );
  }
  return (
    // Folded controls unmount, so tests and Tab never reach them.
    <Collapsible.Root asChild open={open} onOpenChange={(e) => onOpenChange(e.open)} lazyMount unmountOnExit>
      <section className={classes.root} data-testid={testId}>
        <h2 className={classes.title}>
          <Collapsible.Trigger className={classes.trigger} data-testid={toggleTestId}>
            {title}
            <Collapsible.Indicator className={classes.indicator}>
              <icons.chevronRight />
            </Collapsible.Indicator>
          </Collapsible.Trigger>
        </h2>
        <Collapsible.Content className={classes.body}>{children}</Collapsible.Content>
      </section>
    </Collapsible.Root>
  );
}
