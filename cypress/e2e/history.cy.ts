describe('Undo, redo, delete, duplicate', () => {
  beforeEach(() => {
    cy.visitEmpty();
    cy.drawShape('rect', [100, 100], [200, 200]);
  });

  it('undoes and redoes a move', () => {
    cy.canvasDrag([150, 150], [250, 150]);
    cy.prop('x').should('have.value', '200');

    cy.pressKey('z', { metaKey: true });
    cy.prop('x').should('have.value', '100');

    cy.pressKey('z', { metaKey: true, shiftKey: true });
    cy.prop('x').should('have.value', '200');
  });

  it('undo removes a newly created shape', () => {
    cy.get('[data-testid=undo]').click();
    cy.get('[data-node-type=rect]').should('not.exist');
    cy.get('[data-testid=redo]').click();
    cy.get('[data-node-type=rect]').should('have.length', 1);
  });

  it('deletes the selection with Backspace and restores it with undo', () => {
    cy.pressKey('Backspace');
    cy.get('[data-node-type=rect]').should('not.exist');
    cy.pressKey('z', { metaKey: true });
    cy.get('[data-node-type=rect]').should('have.length', 1);
  });

  it('duplicates with Cmd+D, offset by 10px', () => {
    cy.pressKey('d', { metaKey: true });
    cy.get('[data-node-type=rect]').should('have.length', 2);
    cy.prop('x').should('have.value', '110');
  });

  it('nudges with arrow keys', () => {
    // Fired back-to-back on purpose: nudges must not read stale state.
    cy.pressKey('ArrowRight');
    cy.pressKey('ArrowDown', { shiftKey: true });
    cy.prop('x').should('have.value', '101');
    cy.prop('y').should('have.value', '110');
    cy.pressKey('z', { metaKey: true });
    cy.prop('x').should('have.value', '101');
    cy.prop('y').should('have.value', '100');
  });
});
