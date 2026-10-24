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
    cy.get('[data-testid=open-settings]').click();
    cy.get('[data-testid=nav-canvas]').click();
    cy.get('[data-testid=relation-highlight]').clear().type('FF00AA{enter}');
    cy.get('[data-testid=relation-highlight]').should('have.value', 'FF00AA');
    cy.get('[data-testid=close-settings]').click();
    cy.canvasClick(A);
    relatedConnectors().should('have.attr', 'stroke', '#ff00aa');
    relatedTables().should('have.attr', 'stroke', '#ff00aa');

    cy.get('[data-testid=open-settings]').click();
    cy.get('[data-testid=nav-canvas]').click();
    cy.get('[data-testid=relation-highlight-reset]').click();
    cy.get('[data-testid=relation-highlight]').should('have.value', '80CAFF');
    cy.get('[data-testid=close-settings]').click();
    cy.canvasClick(A);
    relatedConnectors().should('have.attr', 'stroke', '#80caff');
  });
});
