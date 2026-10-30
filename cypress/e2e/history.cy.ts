describe('Undo, redo, duplicate, nudge', () => {
  beforeEach(() => {
    cy.visitEmpty();
    cy.drawShape('rect', [100, 100], [200, 200]);
  });

  it('the toolbar undo and redo buttons step through a move and a creation', () => {
    cy.canvasDrag([150, 150], [250, 150]);
    cy.prop('x').should('have.value', '200');

    cy.get('[data-testid=undo]').click();
    cy.prop('x').should('have.value', '100');
    cy.get('[data-testid=redo]').click();
    cy.prop('x').should('have.value', '200');

    cy.get('[data-testid=undo]').click();
    cy.get('[data-testid=undo]').click();
    cy.get('[data-node-type=rect]').should('not.exist');
    cy.get('[data-testid=redo]').click();
    cy.get('[data-node-type=rect]').should('have.length', 1);
  });

  it('duplicates with Cmd+D, offset by 10px', () => {
    cy.pressKey('d', { code: 'KeyD', metaKey: true });
    cy.get('[data-node-type=rect]').should('have.length', 2);
    cy.prop('x').should('have.value', '110');
    cy.prop('name').should('have.value', 'Rectangle 2');
  });

  it('nudges with arrow keys', () => {
    // Fired back-to-back on purpose: nudges must not read stale state.
    cy.pressKey('ArrowRight', { code: 'ArrowRight' });
    cy.pressKey('ArrowDown', { code: 'ArrowDown', shiftKey: true });
    cy.prop('x').should('have.value', '101');
    cy.prop('y').should('have.value', '110');
    cy.pressKey('z', { code: 'KeyZ', metaKey: true });
    cy.prop('x').should('have.value', '101');
    cy.prop('y').should('have.value', '100');
  });
});
