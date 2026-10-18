import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from 'styled-system/css';
import { panel, section } from 'styled-system/recipes';

export function Panel({ className, ...rest }: HTMLAttributes<HTMLElement>) {
  return <aside className={cx(panel(), className)} {...rest} />;
}

export interface SectionProps {
  title?: ReactNode;
  children: ReactNode;
  testId?: string;
}

export function Section({ title, children, testId }: SectionProps) {
  const classes = section();
  return (
    <section className={classes.root} data-testid={testId}>
      {title !== undefined && <h2 className={classes.title}>{title}</h2>}
      <div className={classes.body}>{children}</div>
    </section>
  );
}
