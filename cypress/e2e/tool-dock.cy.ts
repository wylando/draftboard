describe('Tool dock', () => {
  beforeEach(() => cy.visitEmpty());

  it('floats at the bottom centre of the canvas', () => {
    cy.get('[data-testid=tool-dock]').should('be.visible');
    cy.get('[data-testid=canvas]').then(($canvas) => {
      cy.get('[data-testid=tool-dock]').should(($dock) => {
        const c = $canvas[0].getBoundingClientRect();
        const d = $dock[0].getBoundingClientRect();
        expect(Math.abs(d.left + d.width / 2 - (c.left + c.width / 2)), 'horizontal centre offset').to.be.lessThan(2);
        expect(c.bottom - d.bottom, 'gap above canvas bottom').to.be.within(4, 40);
      });
    });
  });

  it('switches tool without dropping the selection', () => {
    cy.drawShape('rect', [100, 100], [300, 200]);
    cy.get('[data-testid=layers-panel] [aria-selected=true]').should('contain', 'Rectangle 1');
    cy.get('[data-testid=tool-ellipse]').click();
    cy.get('[data-testid=canvas]').should('have.attr', 'data-tool', 'ellipse');
    cy.get('[data-testid=layers-panel] [aria-selected=true]').should('contain', 'Rectangle 1');
  });

  it('keeps the table-cell notice clear of the dock', () => {
    cy.pressKey('d', { code: 'KeyD' });
    cy.get('[data-testid=canvas]').should('have.attr', 'data-tool', 'table');
    cy.canvasClick([200, 200]);
    cy.get('[data-testid=canvas]').should('have.attr', 'data-tool', 'select');
    cy.get('[data-testid=add-column]').click();
    cy.get('[data-node-type=table] [data-testid=table-column]').should('have.length', 2);
    cy.canvasDblClick([250, 278]);
    cy.get('[data-testid=table-cell-editor]').should('have.value', 'column_1').clear().type('ID');
    // Taking focus elsewhere commits the duplicate name, which raises the notice.
    cy.get('[data-testid=prop-w]').click();
    cy.get('[data-testid=table-cell-notice]').should('be.visible');
    cy.get('[data-testid=table-cell-notice]').should(($notice) => {
      const n = $notice[0].getBoundingClientRect();
      const d = $notice[0].ownerDocument.querySelector('[data-testid=tool-dock]')!.getBoundingClientRect();
      expect(n.bottom, 'notice bottom above dock top').to.be.lessThan(d.top);
    });
  });
});
