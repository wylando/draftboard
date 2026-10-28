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
    table().find('[data-testid=table-name]').should('have.text', 'Table 1');
    table().find('[data-testid=column-name]').should('not.exist');
    // Rows stay in the DOM so connectors and clicks still find them.
    table().find('[data-testid=table-column]').should('have.length', 1);

    cy.zoomMenu('zoom-100');
    cy.get('[data-testid=zoom-level]').should('have.text', '100%');
    table().should('have.attr', 'data-detail', 'full').find('[data-testid=column-type]').should('have.text', 'uuid');
  });
});
