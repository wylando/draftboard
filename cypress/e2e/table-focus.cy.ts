// A module, so its helpers don't clash with other specs' in the shared spec scope.
export {};

const placeTable = (at: [number, number]) => {
  cy.pressKey('d', { code: 'KeyD' });
  cy.get('[data-testid=canvas]').should('have.attr', 'data-tool', 'table');
  cy.canvasClick(at);
  cy.get('[data-testid=canvas]').should('have.attr', 'data-tool', 'select');
};

const overlay = () => cy.get('[data-testid=selection-overlay]');
const relatedConnectors = () => cy.get('[data-testid=related-connector]');
const relatedTables = () => cy.get('[data-testid=related-table]');
const layerRow = (name: string) => cy.contains('[data-testid=layers-panel] [role=treeitem]', name);
const nodeId = (type: string, index: number) =>
  cy.get(`[data-node-type=${type}]`).eq(index).invoke('attr', 'data-node-id');

// Table 1 at (100, 100) and Table 2 at (500, 300) are linked header to header;
// Table 3 at (100, 500) is unlinked. Each table's header is its first 36 px.
const A: [number, number] = [200, 118];
const B: [number, number] = [600, 318];
const EMPTY: [number, number] = [800, 650];

describe('Table focus highlight', () => {
  let a: string, b: string, c: string, link: string;

  beforeEach(() => {
    cy.visitEmpty();
    placeTable([100, 100]);
    placeTable([500, 300]);
    placeTable([100, 500]);
    cy.pressKey('c', { code: 'KeyC' });
    cy.get('[data-testid=canvas]').should('have.attr', 'data-tool', 'connector');
    cy.canvasDrag([550, 318], [200, 118]);
    cy.get('[data-testid=canvas]').should('have.attr', 'data-tool', 'select');
    cy.get('[data-node-type=connector]').should('have.length', 1);
    cy.canvasClick(EMPTY);
    relatedConnectors().should('not.exist');
    nodeId('table', 0).then((id) => (a = id!));
    nodeId('table', 1).then((id) => (b = id!));
    nodeId('table', 2).then((id) => (c = id!));
    nodeId('connector', 0).then((id) => (link = id!));
  });

  const expectFocusOnA = () => {
    overlay().find(`[data-testid=related-connector][data-related-id="${link}"]`).should('exist');
    overlay().find(`[data-testid=related-table][data-related-id="${b}"]`).should('exist');
    relatedConnectors().should('have.length', 1);
    relatedTables().should('have.length', 1);
    cy.get('[data-testid=route-popup]').should('not.exist');
    overlay().find(`[data-testid=related-table][data-related-id="${a}"]`).should('not.exist');
    overlay().find(`[data-testid=related-table][data-related-id="${c}"]`).should('not.exist');
  };

  it('clicking a table on the canvas highlights its connectors and the tables one hop away', () => {
    cy.canvasClick(A);
    cy.prop('name').should('have.value', 'Table 1');
    expectFocusOnA();
  });

  it('selecting a table in the Layers panel highlights the same things', () => {
    layerRow('Table 1').click();
    cy.prop('name').should('have.value', 'Table 1');
    expectFocusOnA();
  });

  it('highlights nothing for two unlinked tables and says there is no route', () => {
    layerRow('Table 1').click();
    expectFocusOnA();
    layerRow('Table 3').click({ shiftKey: true });
    cy.get('[data-testid=layers-panel] [role=treeitem][aria-selected=true]').should('have.length', 2);
    relatedConnectors().should('not.exist');
    relatedTables().should('not.exist');
    cy.get('[data-testid=route-popup]').should('contain', 'Estimated fastest route');
    cy.get('[data-testid=join-route-none]').should('have.text', 'No route between these tables.');
    cy.get('[data-testid=join-route-step]').should('not.exist');
    cy.get('[data-testid=properties-panel]').should('not.contain', 'route');
  });

  const selectAB = () => {
    layerRow('Table 1').click();
    layerRow('Table 2').click({ shiftKey: true });
    cy.get('[data-testid=layers-panel] [role=treeitem][aria-selected=true]').should('have.length', 2);
  };
  const rectOf = (el: Element) => el.getBoundingClientRect();
  const overlaps = (p: DOMRect, q: DOMRect) => p.left < q.right && q.left < p.right && p.top < q.bottom && q.top < p.bottom;

  it('shows the route in a popup over the canvas that covers neither table nor their link', () => {
    selectAB();
    cy.get('[data-testid=route-popup]').should('contain', 'Estimated fastest route');
    cy.get('[data-testid=join-route-step]').should('have.length', 2);
    cy.get('[data-testid=properties-panel]').should('not.contain', 'route');
    cy.get('[data-testid=route-popup]').should(($popup) => {
      const popup = rectOf($popup[0]!);
      const doc = $popup[0]!.ownerDocument;
      const blockers = [`[data-node-id="${a}"]`, `[data-node-id="${b}"]`, `[data-related-id="${link}"]`].map((q) => doc.querySelector(q)!);
      for (const el of blockers) expect(overlaps(popup, rectOf(el)), el.outerHTML.slice(0, 60)).to.equal(false);
    });
  });

  it('closes on its close button, keeping the selection, until the selection changes', () => {
    selectAB();
    cy.get('[data-testid=route-popup-close]').click();
    cy.get('[data-testid=route-popup]').should('not.exist');
    cy.get('[data-testid=layers-panel] [role=treeitem][aria-selected=true]').should('have.length', 2);
    overlay().find(`[data-testid=related-connector][data-related-id="${link}"]`).should('exist');
    // Undo rebuilds the selection without changing it, which must not count as a new one.
    cy.pressKey('ArrowRight', { code: 'ArrowRight' });
    cy.get('[data-testid=undo]').click();
    cy.get('[data-testid=redo]').should('not.be.disabled');
    cy.get('[data-testid=layers-panel] [role=treeitem][aria-selected=true]').should('have.length', 2);
    cy.get('[data-testid=route-popup]').should('not.exist');
    layerRow('Table 1').click();
    cy.get('[data-testid=layers-panel] [role=treeitem][aria-selected=true]').should('have.length', 1);
    layerRow('Table 2').click({ shiftKey: true });
    cy.get('[data-testid=route-popup]').should('exist');
  });

  it('hides while the tables are dragged and comes back where it fits after the drop', () => {
    selectAB();
    cy.get('[data-testid=route-popup]').should('exist');
    cy.canvasPointer('pointerdown', A);
    cy.canvasPointer('pointermove', [A[0] + 20, A[1] + 20]);
    cy.get('[data-testid=route-popup]').should('not.exist');
    cy.canvasPointer('pointermove', [A[0] + 40, A[1] + 40]);
    cy.canvasPointer('pointerup', [A[0] + 40, A[1] + 40]);
    cy.get('[data-testid=route-popup]').should('exist');
    cy.get(`[data-node-id="${a}"]`).should(($a) => {
      const popup = rectOf($a[0]!.ownerDocument.querySelector('[data-testid=route-popup]')!);
      expect(overlaps(popup, rectOf($a[0]!))).to.equal(false);
    });
  });

  it('keeps the highlight while a cell of the table is being edited', () => {
    cy.canvasClick(A);
    expectFocusOnA();
    cy.canvasDblClick([150, 100 + 36 + 14]);
    cy.get('[data-testid=table-cell-editor]').should('have.attr', 'data-field', 'column-name');
    expectFocusOnA();
  });

  it('clears when the selection is cleared by Escape or a click on empty canvas', () => {
    cy.canvasClick(A);
    expectFocusOnA();
    cy.pressKey('Escape', { code: 'Escape' });
    relatedConnectors().should('not.exist');
    relatedTables().should('not.exist');

    cy.canvasClick(A);
    expectFocusOnA();
    cy.canvasClick(EMPTY);
    relatedConnectors().should('not.exist');
    relatedTables().should('not.exist');
  });

  it('a highlighted related table can still be pressed, and the focus moves to it', () => {
    cy.canvasClick(A);
    overlay().find(`[data-testid=related-table][data-related-id="${b}"]`).should('exist');
    // On Table 2's top edge, where its outline is drawn: an unfilled outline only takes presses on its stroke.
    cy.canvasClick([B[0], 300]);
    cy.prop('name').should('have.value', 'Table 2');
    overlay().find(`[data-testid=related-table][data-related-id="${a}"]`).should('exist');
    overlay().find(`[data-testid=related-table][data-related-id="${b}"]`).should('not.exist');
    overlay().find(`[data-testid=related-connector][data-related-id="${link}"]`).should('exist');
  });

  it('draws the highlight in the colour chosen in Settings, until it is reset', () => {
    cy.get('[data-testid=app-menu]').click();
    cy.get('[data-testid=open-settings]').click();
    cy.get('[data-testid=nav-canvas]').click();
    cy.get('[data-testid=relation-highlight]').clear().type('FF00AA{enter}');
    cy.get('[data-testid=relation-highlight]').should('have.value', '#FF00AA');
    cy.get('[data-testid=close-settings]').click();
    cy.canvasClick(A);
    relatedConnectors().should('have.attr', 'stroke', '#ff00aa');
    relatedTables().should('have.attr', 'stroke', '#ff00aa');

    cy.get('[data-testid=app-menu]').click();
    cy.get('[data-testid=open-settings]').click();
    cy.get('[data-testid=nav-canvas]').click();
    cy.get('[data-testid=relation-highlight-reset]').click();
    cy.get('[data-testid=relation-highlight]').should('have.value', '#8B5CF6');
    cy.get('[data-testid=close-settings]').click();
    cy.canvasClick(A);
    relatedConnectors().should('have.attr', 'stroke', '#8b5cf6');
  });
});

// accounts -> orders is linked directly (into the unindexed orders.account_id) and also through owners (into the
// unique owners.account_id, then orders' primary key), so the cheaper path depends on which table is picked first.
describe('Table focus highlight for two selected tables', () => {
  const SQL = [
    'CREATE TABLE accounts (id int PRIMARY KEY);',
    'CREATE TABLE orders (id int PRIMARY KEY, account_id int REFERENCES accounts(id));',
    'CREATE TABLE owners (id int PRIMARY KEY, account_id int UNIQUE REFERENCES accounts(id), order_id int REFERENCES orders(id));',
  ].join('\n');
  type Saved = { id: string; type: string; name: string; from?: { tableId: string }; to?: { tableId: string } };
  let ids: Record<string, string>;
  let saved: Saved[];
  const link = (x: string, y: string) => {
    const found = saved.find((c) => [c.from?.tableId, c.to?.tableId].sort().join() === [ids[x], ids[y]].sort().join());
    expect(found, `connector ${x}-${y}`).to.not.equal(undefined);
    return (found as Saved).id;
  };

  beforeEach(() => {
    cy.visitEmpty();
    cy.get('[data-testid=import-menu]').click();
    cy.get('[data-testid=import-schema]').click();
    cy.get('[data-testid=schema-source]').should('be.visible').type(SQL, { delay: 0, parseSpecialCharSequences: false });
    cy.contains('button', 'Preview').click();
    cy.get('[data-testid=import-summary]').should('contain', '3 tables').and('contain', '3 relationships');
    cy.get('[data-testid=import-submit]').click();
    cy.get('[data-testid=dialog]').should('not.exist');
    cy.get('[data-node-type=connector]').should('have.length', 3);
    cy.window().should((win) => {
      const nodes = (JSON.parse(win.localStorage.getItem('draftboard:workspace:v1') ?? '{"boards":[{"nodes":[]}]}') as { boards: Array<{ nodes: Saved[] }> }).boards[0]!.nodes;
      const tables = nodes.filter((n) => n.type === 'table');
      const connectors = nodes.filter((n) => n.type === 'connector');
      expect(tables).to.have.length(3);
      expect(connectors).to.have.length(3);
      ids = Object.fromEntries(tables.map((t) => [t.name, t.id]));
      saved = connectors;
    });
  });

  const pick = (first: string, second: string) => {
    layerRow(first).click().should('have.attr', 'aria-selected', 'true');
    layerRow(second).click({ shiftKey: true });
    cy.get('[data-testid=layers-panel] [role=treeitem][aria-selected=true]').should('have.length', 2);
  };
  const expectRelated = (connectors: string[], tables: string[]) => {
    relatedConnectors().should('have.length', connectors.length);
    relatedTables().should('have.length', tables.length);
    for (const id of connectors) overlay().find(`[data-testid=related-connector][data-related-id="${id}"]`).should('exist');
    for (const id of tables) overlay().find(`[data-testid=related-table][data-related-id="${id}"]`).should('exist');
  };

  // Each step's whole visible text, so a swapped "index lookup" / "scan" label fails too.
  const expectRoute = (steps: string[]) => {
    cy.get('[data-testid=route-popup]').should('contain', 'Estimated fastest route');
    cy.get('[data-testid=join-route-step]').should('have.length', steps.length);
    steps.forEach((text, i) => cy.get('[data-testid=join-route-step]').eq(i).should('have.text', text));
  };

  const expectGuaranteed = (steps: string[]) => {
    cy.get('[data-testid=route-popup-guaranteed]').should('contain', 'Guaranteed route');
    cy.get('[data-testid=guaranteed-route-step]').should('have.length', steps.length);
    steps.forEach((text, i) => cy.get('[data-testid=guaranteed-route-step]').eq(i).should('have.text', text));
  };

  it('highlights the cheaper path through an indexed column, not the direct link', () => {
    pick('accounts', 'orders');
    expectRoute(['accounts', '→ owners · index lookup', '→ orders · index lookup']);
    // Imported foreign keys are many to one, so entering orders or owners from accounts may find no row.
    cy.get('[data-testid=route-popup-guaranteed]').should('not.exist');
    expectRelated([link('accounts', 'owners'), link('owners', 'orders')], [ids.owners]);
  });

  it('follows the selection order: the other way round the direct link enters a primary key', () => {
    pick('orders', 'accounts');
    expectRoute(['orders', '→ accounts · index lookup']);
    // Guaranteed because the marker at accounts' end is `one`; the guarantee follows markers, not column nullability.
    cy.get('[data-testid=route-popup-guaranteed]').should('not.exist');
    expectRelated([link('accounts', 'orders')], []);
  });

  it('lists a guaranteed route beneath the fastest one when a mandatory end makes it differ', () => {
    // The direct link's end at orders (the foreign key side, `from`) goes many -> one or many.
    cy.get(`[data-node-id="${link('accounts', 'orders')}"] [data-cardinality-end=from]`)
      .should('have.attr', 'data-cardinality', 'many')
      .click();
    cy.get(`[data-node-id="${link('accounts', 'orders')}"] [data-cardinality-end=from]`).should('have.attr', 'data-cardinality', 'oneOrMany');
    pick('accounts', 'orders');
    expectRoute(['accounts', '→ owners · index lookup', '→ orders · index lookup']);
    expectGuaranteed(['accounts', '→ orders · scan']);
  });
});
