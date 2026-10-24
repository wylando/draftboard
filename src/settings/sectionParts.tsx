import type { ReactNode } from 'react';
import { css } from 'styled-system/css';

const blockClass = css({ marginTop: '6' });
const headingClass = css({ margin: '0', marginBottom: '2', textStyle: 'body.largeStrong' });
export const mutedClass = css({ margin: '0', color: 'text.secondary' });
const termGridClass = css({
  display: 'grid',
  gridTemplateColumns: 'auto 1fr',
  columnGap: '4',
  rowGap: '2',
  alignItems: 'baseline',
  margin: '0',
});
export const termClass = css({ textStyle: 'body.largeStrong' });
export const descClass = css({ margin: '0' });
const pairClass = css({ display: 'contents' });

export function Block({ title, children, testId }: { title: string; children: ReactNode; testId?: string }) {
  return (
    <div className={blockClass} data-testid={testId}>
      <h2 className={headingClass}>{title}</h2>
      {children}
    </div>
  );
}

export function Terms({ items }: { items: Array<[ReactNode, ReactNode]> }) {
  return (
    <dl className={termGridClass}>
      {items.map(([term, desc], i) => (
        <div key={i} className={pairClass}>
          <dt className={termClass}>{term}</dt>
          <dd className={descClass}>{desc}</dd>
        </div>
      ))}
    </dl>
  );
}
