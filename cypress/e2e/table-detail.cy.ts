const table = () => cy.get('[data-node-type=table]');

describe('Tables: level of detail', () => {
  beforeEach(() => {
    cy.visitEmpty();
    cy.pressKey('d', { code: 'KeyD' });
    cy.get('[data-testid=canvas]').should('have.attr', 'data-tool', 'table');
    cy.canvasClick([200, 200]);
    table().should('have.length', 1);
  });

  it('simplifies as you zoom out and restores full detail at 100%', () => {
    table().should('have.attr', 'data-detail', 'full').find('[data-testid=column-type]').should('exist');

    cy.zoomMenu('zoom-out');
    cy.get('[data-testid=zoom-level]').should('have.text', '50%');
    table().should('have.attr', 'data-detail', 'compact');
    table().find('[data-testid=column-name]').should('contain', 'id');
    table().find('[data-testid=column-badge]').should('have.text', 'PK');
    table().find('[data-testid=column-type]').should('not.exist');

    cy.zoomMenu('zoom-out');
    cy.get('[data-testid=zoom-level]').should('have.text', '25%');
    table().should('have.attr', 'data-detail', 'overview');
    cy.get('[data-testid=overview-name] [data-testid=table-name]').should('have.text', 'Table 1');
    table().find('[data-testid=column-name]').should('not.exist');
    // Rows stay in the DOM so connectors and clicks still find them.
    table().find('[data-testid=table-column]').should('have.length', 1);

    cy.zoomMenu('zoom-100');
    cy.get('[data-testid=zoom-level]').should('have.text', '100%');
    table().should('have.attr', 'data-detail', 'full').find('[data-testid=column-type]').should('have.text', 'uuid');
  });

  it('draws overview names in front of every layer, connectors and the selection overlay included', () => {
    cy.zoomMenu('zoom-out');
    cy.zoomMenu('zoom-out');
    table().should('have.attr', 'data-detail', 'overview');
    cy.contains('[data-testid=layers-panel] [role=treeitem]', 'Table 1').click();
    cy.get('[data-testid=selection-overlay] polygon').should('exist');
    cy.get('[data-testid=overview-name]').should('contain', 'Table 1').then(($name) => {
      // SVG paints in document order, so after the world (tables, connectors) and the overlay means on top.
      for (const q of ['[data-testid=world]', '[data-testid=selection-overlay]']) {
        cy.get(q).should(($o) => expect($o[0]!.compareDocumentPosition($name[0]!) & Node.DOCUMENT_POSITION_FOLLOWING, q).to.be.greaterThan(0));
      }
    });
  });
});

describe('Tables: level of detail with long names', () => {
  const col = (id: string, name: string, primaryKey = false) => ({ id, name, dataType: 'varchar(255)', primaryKey, nullable: false, unique: false });
  const tableNode = {
    id: 'narrow',
    type: 'table',
    name: 'customer_orders_archive_2024',
    parentId: null,
    x: 200,
    y: 150,
    width: 120,
    height: 36 + 28 * 3,
    rotation: 0,
    fill: '#ffffff',
    stroke: '#d9d9d9',
    strokeWidth: 1,
    opacity: 1,
    visible: true,
    accent: '#80caff',
    indexes: [],
    columns: [col('c1', 'id', true), col('c2', 'a_remarkably_long_column_name'), col('c3', 'another_extremely_long_column_name')],
  };

  beforeEach(() => {
    const workspace = { version: 1, activeId: 'b1', boards: [{ id: 'b1', name: 'Board 1', nodes: [tableNode] }] };
    cy.visit('/', { onBeforeLoad: (win) => win.localStorage.setItem('draftboard:workspace:v1', JSON.stringify(workspace)) });
    cy.get('[data-testid=node-narrow]').should('have.attr', 'data-detail', 'full');
  });

  it('cuts long column names with an ellipsis inside a narrow compact table', () => {
    cy.zoomMenu('zoom-out');
    cy.get('[data-testid=node-narrow]').should('have.attr', 'data-detail', 'compact');
    cy.get('[data-testid=node-narrow] [data-testid=column-name]').should('have.length', 3).each(($t, i) => {
      const box = ($t[0] as unknown as SVGGraphicsElement).getBBox();
      expect(box.x + box.width, `row ${i} right edge`).to.be.at.most(120 - 12 + 1);
      if (i > 0) expect($t.text()).to.match(/…$/);
    });
  });

  it('labels a multi-column table with its whole name at overview', () => {
    cy.zoomMenu('zoom-out');
    cy.zoomMenu('zoom-out');
    cy.get('[data-testid=node-narrow]').should('have.attr', 'data-detail', 'overview');
    cy.get('[data-testid=node-narrow] [data-testid=column-name]').should('not.exist');
    cy.get('[data-testid=node-narrow] [data-testid=table-column]').should('have.length', 3);
    cy.get('[data-testid=overview-name][data-table-id=narrow] [data-testid=table-name-pill] title').should('have.text', 'customer_orders_archive_2024');
    cy.get('[data-testid=overview-name][data-table-id=narrow] [data-testid=table-name] tspan').should('have.length', 2);
  });
});
