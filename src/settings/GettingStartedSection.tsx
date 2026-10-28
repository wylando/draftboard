import { css } from 'styled-system/css';
import { RelatedOutlines } from '../editor/components/SelectionOverlay';
import { createConnector } from '../editor/model/connector';
import { createNode } from '../editor/model/nodes';
import { createColumn, tableHeight } from '../editor/model/table';
import { normalizeTree } from '../editor/model/tree';
import type { DesignNode, TableNode } from '../editor/model/types';
import { Kbd } from '../design-system';
import { COMMAND_IDS, COMMANDS } from './keybindings/commands';
import { formatBinding } from './keybindings/keys';
import { useKeybindings } from './keybindings/KeybindingsContext';
import { usePreferences } from './preferences/PreferencesContext';
import { Block, mutedClass, Terms } from './sectionParts';
import { NO_RELATIONS, Sample } from './SymbolsSection';

const listClass = css({ margin: '0', paddingInlineStart: '4', display: 'grid', gap: '3' });
const stepClass = css({ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '3' });
const stepTextClass = css({ flex: '1', flexBasis: '[16rem]', minWidth: '0' });
const IDENTITY_VIEWPORT = { x: 0, y: 0, zoom: 1 };

/** Current shortcut for a command, reflecting the user's own bindings. */
function Shortcut({ binding }: { binding: string | undefined }) {
  if (!binding) return <span className={mutedClass}>no shortcut</span>;
  return (
    <Kbd>
      {formatBinding(binding).map((p, i) => (
        <span key={i}>{p}</span>
      ))}
    </Kbd>
  );
}

// The walkthrough's pictures are drawn by the canvas's own renderer from literal nodes, like the Symbols page.
const TABLE_WIDTH = 120;
const TABLE_GAP = 60;
function makeTable(index: number, name: string, columns: ReturnType<typeof createColumn>[]): TableNode {
  const base = createNode('table', { x: index * (TABLE_WIDTH + TABLE_GAP), y: 0, width: TABLE_WIDTH, height: 1 }, []) as TableNode;
  return { ...base, id: `guide-table-${index}`, name, columns, height: tableHeight(columns.length) };
}
const customerId = createColumn('id', 'int', true);
const orderId = createColumn('id', 'int', true);
const orderCustomer = createColumn('customer_id', 'int');
const itemOrder = createColumn('order_id', 'int');
const customers = makeTable(0, 'customers', [customerId, createColumn('name', 'text')]);
const orders = makeTable(1, 'orders', [orderId, orderCustomer, createColumn('placed_at', 'time')]);
const items = makeTable(2, 'order_items', [createColumn('id', 'int', true), itemOrder]);
const ordersToCustomers = createConnector(
  { kind: 'column', tableId: orders.id, columnId: orderCustomer.id },
  { kind: 'column', tableId: customers.id, columnId: customerId.id },
  'guide-link-1',
  new Map<string, DesignNode>([[orders.id, orders], [customers.id, customers]]),
);
const itemsToOrders = createConnector(
  { kind: 'column', tableId: items.id, columnId: itemOrder.id },
  { kind: 'column', tableId: orders.id, columnId: orderId.id },
  'guide-link-2',
  new Map<string, DesignNode>([[items.id, items], [orders.id, orders]]),
);
const foreignKeys = { ...NO_RELATIONS, foreignKeys: new Map([[orders.id, new Set([orderCustomer.id])], [items.id, new Set([itemOrder.id])]]) };
// Routed the way the canvas routes them, so the lines match what the reader will see.
const routed = (nodes: DesignNode[]) => normalizeTree(nodes);
const viewBoxFor = (nodes: DesignNode[]) => {
  const tables = nodes.filter((n) => n.type === 'table');
  const right = Math.max(...tables.map((t) => t.x + t.width));
  const height = Math.max(...tables.map((t) => t.height));
  return `-4 -4 ${right + 8} ${height + 8}`;
};

const linksAnd = (tableId: string) => (nodes: DesignNode[]) => nodes.filter((n) => n.type === 'connector' || n.id === tableId);

function Picture({ nodes, outline }: { nodes: DesignNode[]; outline?: (routedNodes: DesignNode[]) => DesignNode[] }) {
  const { preferences } = usePreferences();
  const drawn = routed(nodes);
  return (
    <Sample
      nodes={drawn}
      viewBox={viewBoxFor(drawn)}
      relations={foreignKeys}
      scale={0.75}
      overlay={outline && <RelatedOutlines related={outline(drawn)} viewport={IDENTITY_VIEWPORT} color={preferences.relationHighlight} />}
    />
  );
}

function Step({ children, picture }: { children: React.ReactNode; picture: React.ReactNode }) {
  return (
    <li>
      <div className={stepClass}>
        <div className={stepTextClass}>{children}</div>
        {picture}
      </div>
    </li>
  );
}

export function GettingStartedSection() {
  const { bindings } = useKeybindings();
  const toolIds = COMMAND_IDS.filter((id) => COMMANDS[id].category === 'tools');

  return (
    <section data-testid="getting-started-section">
      <h1>Getting started</h1>
      <p className={mutedClass}>
        Draftboard is a database schema canvas that runs entirely on your computer. Your boards save in this browser as you work.
      </p>

      <Block title="The screen" testId="guide-screen">
        <Terms
          items={[
            ['Top bar', 'The logo menu (this guide and Settings), your board tabs, then Import, Export and the zoom menu.'],
            ['Tool dock (bottom)', 'The floating tools, with undo and redo beside them.'],
            ['Layers (left)', 'Every layer as a tree. Click to select, Shift-click to add, double-click to rename, drag to reorder or nest. Connectors are links, so they get no row.'],
            ['Canvas (center)', 'Where you draw. Scroll to pan, ⌘/Ctrl + scroll to zoom.'],
            ['Design (right)', 'Properties of the selection: a table’s name and columns, a connector’s cardinality, a shape’s fill.'],
          ]}
        />
      </Block>

      <Block title="First schema" testId="guide-first-schema">
        <ol className={listClass}>
          <Step picture={<Picture nodes={[customers]} />}>
            Add a table: press <Shortcut binding={bindings['tool.table'][0]} /> and click the canvas, or import SQL, DBML or a SQLite file from the Import menu.
          </Step>
          <Step picture={<Picture nodes={[{ ...orders, x: 0 }]} />}>Select the table and edit its name, columns and indexes in the Design panel.</Step>
          <Step picture={<Picture nodes={[customers, orders, ordersToCustomers]} />}>
            Press <Shortcut binding={bindings['tool.connector'][0]} /> and drag from one column to another to link them.
          </Step>
          <Step picture={<Picture nodes={[customers, orders, ordersToCustomers]} outline={linksAnd(customers.id)} />}>
            Select one table to see its links outlined, along with the tables they reach.
          </Step>
          <Step picture={<Picture nodes={[customers, orders, items, ordersToCustomers, itemsToOrders]} outline={linksAnd(orders.id)} />}>
            Select two tables to see the estimated fastest route of joins between them.
          </Step>
        </ol>
      </Block>

      <Block title="Tools" testId="guide-tools">
        <Terms
          items={toolIds.map((id) => [
            <>
              {COMMANDS[id].label} <Shortcut binding={bindings[id][0]} />
            </>,
            COMMANDS[id].description,
          ])}
        />
      </Block>

      <Block title="Design panel options" testId="guide-options">
        <Terms
          items={[
            ['Layer', 'The layer name, as shown in the Layers panel; X and Y (top-left corner), W and H, rotation in degrees (°), and corner radius (R) for rectangles and frames.'],
            ['Text', 'For text layers: the content and font size.'],
            [
              'Appearance',
              'Fill color (click the swatch for a picker or type a 6-digit hex value); stroke color and width (0 means no outline; lines always have one); and opacity, 0–100% transparency for the whole layer.',
            ],
            ['Arrange', 'Bring to front, send to back, duplicate, zoom to the selection, group, ungroup, or delete. Ordering applies among layers in the same frame or group.'],
          ]}
        />
      </Block>

      <Block title="Frames and groups" testId="guide-nesting">
        <Terms
          items={[
            ['Frames', 'Shapes you draw or drop on a frame go inside it, and the frame hides anything outside its edges. Moving a frame moves its contents; resizing it does not.'],
            [
              <>
                Groups <Shortcut binding={bindings['arrange.group'][0]} />
              </>,
              'Group the selection to move and resize it as one. Clicking a grouped layer selects the whole group; double-click to select inside it, or ⌘/Ctrl-click to go straight to the layer.',
            ],
            [
              <>
                Ungroup <Shortcut binding={bindings['arrange.ungroup'][0]} />
              </>,
              'Removes the group and keeps its layers in place. A group with no layers left is removed automatically.',
            ],
          ]}
        />
      </Block>

      <Block title="Saving your work" testId="guide-saving">
        <Terms
          items={[
            ['Autosave', 'Your boards save in this browser as you work and reopen next time.'],
            ['Export', 'Downloads the board as a .json file, or exports its tables as SQL or DBML.'],
            ['Import', 'Opens a board .json file, replacing the current design (you are asked first if the board has layers), or adds tables from SQL, DBML or SQLite.'],
          ]}
        />
      </Block>

      <Block title="Coming from another design tool?">
        <p className={mutedClass}>
          Tool shortcuts follow common design-tool conventions, and you can change any of them under Keyboard
          shortcuts. Draftboard is intentionally small: there are no components, auto layout, constraints,
          prototyping, comments or multiplayer.
        </p>
      </Block>
    </section>
  );
}
