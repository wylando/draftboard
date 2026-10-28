import type { ReactNode } from 'react';
import { css } from 'styled-system/css';
import { NodeView, RelationsContext, type Relations } from '../editor/components/NodeView';
import { RelatedOutlines } from '../editor/components/SelectionOverlay';
import { createConnector } from '../editor/model/connector';
import { createNode } from '../editor/model/nodes';
import { createColumn, tableHeight } from '../editor/model/table';
import type { Anchor, Cardinality, ConnectorNode, DesignNode, TableNode } from '../editor/model/types';
import { usePreferences } from './preferences/PreferencesContext';
import { Block, descClass, mutedClass, Terms, termClass } from './sectionParts';

// Every symbol is drawn by the canvas's own renderer (NodeView, SelectionOverlay) from small literal nodes,
// so this legend cannot drift from what the canvas shows.

const NO_MOUNTED: ReadonlySet<string> = new Set();
const NO_CHILDREN: ReadonlyMap<string | null, DesignNode[]> = new Map();
const NO_RELATIONS: Relations = { foreignKeys: new Map(), mismatched: new Set(), relationalEnds: new Set() };
const IDENTITY_VIEWPORT = { x: 0, y: 0, zoom: 1 };

const SAMPLE_WIDTH = 96;
const SAMPLE_HEIGHT = 20;
const attached: Anchor = { kind: 'node', nodeId: 'symbol-sample-layer' };
const loose: Anchor = { kind: 'point', x: SAMPLE_WIDTH, y: SAMPLE_HEIGHT / 2 };
const broken: Anchor = { kind: 'point', x: 0, y: SAMPLE_HEIGHT / 2, broken: true };

function sampleConnector(id: string, over: Partial<ConnectorNode>): ConnectorNode {
  return {
    ...createConnector(attached, attached, id, new Map()),
    id,
    x: 0,
    y: 0,
    width: SAMPLE_WIDTH,
    height: SAMPLE_HEIGHT,
    points: [
      { x: 0, y: SAMPLE_HEIGHT / 2 },
      { x: SAMPLE_WIDTH, y: SAMPLE_HEIGHT / 2 },
    ],
    ...over,
  };
}

const sampleTable = createNode('table', { x: 0, y: 0, width: 230, height: 1 }, []) as TableNode;
const [pk, uq, fk, pfk, ufk, idx] = [
  createColumn('id', 'int', true),
  { ...createColumn('email', 'text'), unique: true },
  createColumn('org_id', 'int'),
  createColumn('user_id', 'int', true),
  { ...createColumn('profile_id', 'int'), unique: true },
  { ...createColumn('slug', 'text'), nullable: true },
] as const;
const rowsTable: TableNode = {
  ...sampleTable,
  id: 'symbol-sample-table',
  name: 'accounts',
  columns: [pk, uq, fk, pfk, ufk, idx],
  // createNode sizes a table for its one default column; on the canvas normalizeTree does this.
  height: tableHeight(6),
  indexes: [{ id: 'symbol-sample-index', name: 'accounts_slug', columnIds: [idx.id], unique: false }],
};
const linkedTable: TableNode = {
  ...sampleTable,
  id: 'symbol-sample-linked',
  name: 'orders',
  width: SAMPLE_WIDTH,
  columns: [createColumn('id', 'int', true)],
  height: tableHeight(1),
  indexes: [],
};
const LINKED_VIEWBOX = `-4 -4 ${linkedTable.width + 8} ${linkedTable.height + 8}`;
const rowsRelations: Relations = {
  ...NO_RELATIONS,
  foreignKeys: new Map([[rowsTable.id, new Set([fk.id, pfk.id, ufk.id])]]),
};

const entryClass = css({ display: 'grid', gridTemplateColumns: '11rem 1fr', columnGap: '4', alignItems: 'center', paddingBlock: '1' });
const canvasClass = css({ bg: 'bg.canvas', borderRadius: 'medium', flex: 'none' });
const stackClass = css({ display: 'grid', gap: '1', justifyItems: 'start' });
const rowsLayoutClass = css({ display: 'flex', flexWrap: 'wrap', gap: '4', alignItems: 'flex-start' });
const rowsTermsClass = css({ flexGrow: '1', flexBasis: '[16rem]', minWidth: '0' });

function Sample({ nodes, viewBox, relations = NO_RELATIONS, overlay, scale = 1 }: { nodes: DesignNode[]; viewBox: string; relations?: Relations; overlay?: ReactNode; scale?: number }) {
  const [, , width, height] = viewBox.split(' ').map(Number);
  return (
    <svg className={canvasClass} aria-hidden="true" width={width! * scale} height={height! * scale} viewBox={viewBox}>
      <RelationsContext.Provider value={relations}>
        {nodes.map((n) => (
          <NodeView key={n.id} node={n} childrenOf={NO_CHILDREN} mounted={NO_MOUNTED} editingId={null} />
        ))}
      </RelationsContext.Provider>
      {overlay}
    </svg>
  );
}

function Entry({ testId, term, sample, children }: { testId: string; term: string; sample: ReactNode; children: ReactNode }) {
  return (
    <div className={entryClass} data-testid={testId}>
      {sample}
      <div>
        <div className={termClass}>{term}</div>
        <p className={descClass}>{children}</p>
      </div>
    </div>
  );
}

const LINE_VIEWBOX = `-8 0 ${SAMPLE_WIDTH + 16} ${SAMPLE_HEIGHT}`;

function Line({ id, over, relations, overlay }: { id: string; over?: Partial<ConnectorNode>; relations?: Relations; overlay?: (c: ConnectorNode) => ReactNode }) {
  const node = sampleConnector(id, over ?? {});
  // Enlarged: at canvas size a marker's few pixels merge with the end dot.
  return <Sample nodes={[node]} viewBox={LINE_VIEWBOX} relations={relations} overlay={overlay?.(node)} scale={1.5} />;
}

const CARDINALITIES: Array<{ kind: Cardinality; term: string; text: string }> = [
  { kind: 'one', term: 'One', text: 'Exactly one row matches.' },
  { kind: 'zeroOrOne', term: 'Zero or one', text: 'One row matches, or none.' },
  { kind: 'many', term: 'Many', text: 'Any number of rows match: none, one or several.' },
  { kind: 'oneOrMany', term: 'One or many', text: 'At least one row matches, possibly several.' },
  { kind: 'none', term: 'No marker', text: 'Says nothing about how rows match. A table’s end still offers a blank marker to click, so you can set one.' },
];

export function SymbolsSection() {
  const { preferences } = usePreferences();
  return (
    <section data-testid="symbols-section">
      <h1>Symbols</h1>
      <p className={mutedClass}>What the small marks on connectors and tables mean. Each drawing here is made by the canvas itself.</p>

      <Block title="Connector ends (cardinality)" testId="symbols-cardinality">
        <p className={mutedClass}>
          The marker at a table’s end says how many of that table’s rows match one row at the other end. Click a marker
          on the canvas to cycle it: one, zero or one, many, one or many, then no marker. A link between two columns
          starts as many at the foreign-key column’s table and one at the table it references; a link between two
          whole tables starts as one at the table you drew from and many at the other.
        </p>
        <p className={mutedClass} data-testid="symbols-many-to-many">
          Many-to-many: only links between whole tables can be many at both ends, so on a link between columns those
          steps are skipped. A column link is one column referring to another, and a single column can’t hold a
          many-to-many. Schema export writes a many-to-many as a junction table in SQL (both tables need a primary key)
          and as a &lt;&gt; ref in DBML.
        </p>
        {CARDINALITIES.map(({ kind, term, text }) => {
          const id = `symbol-sample-${kind}`;
          return (
            <Entry
              key={kind}
              testId={`symbol-cardinality-${kind}`}
              term={term}
              sample={<Line id={id} over={{ fromCardinality: kind }} relations={{ ...NO_RELATIONS, relationalEnds: new Set([`${id}:from`]) }} />}
            >
              {text}
            </Entry>
          );
        })}
      </Block>

      <Block title="Connector lines" testId="symbols-lines">
        <Entry testId="symbol-end-attached" term="Filled dot" sample={<Line id="symbol-sample-attached" />}>
          The end is attached to a layer or a table column, and follows it when it moves.
        </Entry>
        <Entry testId="symbol-end-loose" term="Hollow dot" sample={<Line id="symbol-sample-loose" over={{ to: loose }} />}>
          A loose end, sitting on the canvas instead of on a layer.
        </Entry>
        <Entry testId="symbol-end-broken" term="Dashed line" sample={<Line id="symbol-sample-broken" over={{ from: broken, to: loose }} />}>
          An end lost what it was attached to because that layer or column was deleted. The toolbar counts these.
        </Entry>
        <Entry
          testId="symbol-warning"
          term="Warning triangle"
          sample={<Line id="symbol-sample-warning" relations={{ ...NO_RELATIONS, mismatched: new Set(['symbol-sample-warning']) }} />}
        >
          The two columns of a foreign key have different types.
        </Entry>
        <Entry
          testId="symbol-highlight"
          term="Colored line or outline"
          sample={
            <div className={stackClass}>
              <Line
                id="symbol-sample-highlight"
                overlay={(c) => <RelatedOutlines related={[c]} viewport={IDENTITY_VIEWPORT} color={preferences.relationHighlight} />}
              />
              <Sample
                nodes={[linkedTable]}
                viewBox={LINKED_VIEWBOX}
                overlay={<RelatedOutlines related={[linkedTable]} viewport={IDENTITY_VIEWPORT} color={preferences.relationHighlight} />}
              />
            </div>
          }
        >
          The links of the selected tables are drawn over in the highlight color, and the tables they link to are
          outlined. With exactly two tables selected, only the estimated fastest route between them is shown. Pick
          the color under Settings → Canvas.
        </Entry>
      </Block>

      <Block title="Table rows" testId="symbols-rows">
        <div className={rowsLayoutClass}>
          <Sample nodes={[rowsTable]} viewBox={`-4 -4 ${rowsTable.width + 8} ${rowsTable.height + 8}`} relations={rowsRelations} />
          <div className={rowsTermsClass}>
            <Terms
              items={[
                ['PK', 'Primary key: identifies each row.'],
                ['UQ', 'Unique: no two rows share this value.'],
                ['FK', 'Foreign key: the column references another column, usually in another table.'],
                ['PFK, UFK', 'A primary-key or unique column that is also a foreign key.'],
                ['idx', 'The column is part of an index.'],
                ['? after a type', 'The column may hold NULL (no value).'],
              ]}
            />
          </div>
        </div>
      </Block>

      <Block title="Route terms" testId="symbols-routes">
        <p className={mutedClass}>Shown in a popup beside the route when exactly two tables are selected.</p>
        <Terms
          items={[
            ['Estimated fastest route', 'The cheapest chain of links from the first selected table to the second. It is an estimate: Draftboard has no row counts, so it assumes index lookups are cheap and scans are costly.'],
            ['index lookup', 'The join enters the table through an indexed column: the first primary-key column, a unique column, or the first column of an index.'],
            ['scan', 'Any other join, including a link to a whole table rather than one of its columns.'],
            ['Guaranteed route', 'A route where every join enters a one or one-or-many end, so the markers promise a matching row. Nullable columns are not checked. Shown only when such a route exists and the fastest route has a join that may find no row.'],
          ]}
        />
      </Block>
    </section>
  );
}
