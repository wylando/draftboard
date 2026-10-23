import { Switch } from '@ark-ui/react/switch';
import { ToggleGroup } from '@ark-ui/react/toggle-group';
import { useId, useRef } from 'react';
import { Button, Section } from '../../design-system';
import { useEditor } from '../EditorContext';
import { typeMismatch } from '../model/connector';
import { byIdOf } from '../model/tree';
import type { Anchor, ConnectorNode, DesignNode } from '../model/types';
import { css } from 'styled-system/css';
import { chipGroup, toggleSwitch } from 'styled-system/recipes';

const chips = chipGroup();
const switchClasses = toggleSwitch();
const warningClass = css({ margin: '0', paddingBlock: '1', paddingInline: '2', borderRadius: 'small', bg: 'warning.bg', color: 'warning.ink' });
const endsClass = css({ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: '2', rowGap: '1', margin: '0' });
const termClass = css({ margin: '0', color: 'text.secondary' });
const valueClass = css({ margin: '0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' });

const ROUTINGS: Array<{ id: ConnectorNode['routing']; label: string }> = [
  { id: 'orthogonal', label: 'Right angles' },
  { id: 'straight', label: 'Straight' },
];

/** What an end is attached to, in words: "users · id", a layer's name, or why it is loose. */
function describe(anchor: Anchor, nodes: DesignNode[]): string {
  if (anchor.kind === 'point') return anchor.broken ? 'Loose (what it was attached to is gone)' : 'Loose';
  const node = nodes.find((n) => n.id === (anchor.kind === 'column' ? anchor.tableId : anchor.nodeId));
  if (!node) return 'Loose';
  if (anchor.kind === 'node' || node.type !== 'table') return node.name;
  return `${node.name} · ${node.columns.find((c) => c.id === anchor.columnId)?.name ?? '?'}`;
}

const columnType = (a: Anchor, nodes: DesignNode[]) => {
  if (a.kind !== 'column') return '';
  const table = nodes.find((n) => n.id === a.tableId);
  return table?.type === 'table' ? (table.columns.find((c) => c.id === a.columnId)?.dataType ?? '') : '';
};

/**
 * The connector's ends, routing and, between two columns, whether it is a
 * foreign key. Re-attach an end by dragging its handle on the canvas; click an
 * end's marker there to change its cardinality.
 */
export function ConnectorProperties({ connector }: { connector: ConnectorNode }) {
  const { state, dispatch } = useEditor();
  const routingLabel = useId();
  const routingGroup = useRef<HTMLDivElement>(null);
  const betweenColumns = connector.from.kind === 'column' && connector.to.kind === 'column';
  const mismatch = typeMismatch(connector, byIdOf(state.nodes));
  return (
    <Section title="Connector" testId="section-connector">
      <dl className={endsClass}>
        <dt className={termClass}>From</dt>
        <dd className={valueClass} data-testid="connector-from">
          {describe(connector.from, state.nodes)}
        </dd>
        <dt className={termClass}>To</dt>
        <dd className={valueClass} data-testid="connector-to">
          {describe(connector.to, state.nodes)}
        </dd>
      </dl>
      <p className={termClass} id={routingLabel}>
        Routing
      </p>
      <ToggleGroup.Root
        ref={routingGroup}
        className={chips.root}
        aria-labelledby={routingLabel}
        value={[connector.routing]}
        deselectable={false}
        onValueChange={({ value }) => {
          const routing = value[0] as ConnectorNode['routing'] | undefined;
          if (routing) dispatch({ type: 'editConnector', id: connector.id, patch: { routing } });
        }}
      >
        {ROUTINGS.map((r) => (
          <ToggleGroup.Item key={r.id} value={r.id} className={chips.item} data-testid={`routing-${r.id}`}>
            {r.label}
          </ToggleGroup.Item>
        ))}
      </ToggleGroup.Root>
      <Button
        data-testid="connector-reset-route"
        // A straight connector can still remember bends, and this is the only way to forget them.
        disabled={(connector.bends ?? []).length === 0}
        onClick={() => {
          dispatch({ type: 'editConnector', id: connector.id, patch: { bends: undefined } });
          // The button disables itself once the route is automatic, which would drop keyboard focus to the page.
          routingGroup.current?.querySelector<HTMLElement>('[data-state=on]')?.focus();
        }}
      >
        Reset route
      </Button>
      {betweenColumns && (
        <Switch.Root
          className={switchClasses.root}
          checked={connector.isForeignKey}
          onCheckedChange={({ checked }) => dispatch({ type: 'editConnector', id: connector.id, patch: { isForeignKey: checked } })}
          data-testid="connector-fk"
        >
          <Switch.Control className={switchClasses.control}>
            <Switch.Thumb className={switchClasses.thumb} />
          </Switch.Control>
          <Switch.Label className={switchClasses.label}>Foreign key</Switch.Label>
          <Switch.HiddenInput />
        </Switch.Root>
      )}
      {mismatch && (
        <p className={warningClass} role="note" data-testid="connector-type-warning">
          The columns’ types differ: {columnType(connector.from, state.nodes)} → {columnType(connector.to, state.nodes)}.
        </p>
      )}
    </Section>
  );
}
