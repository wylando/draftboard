describe('Local persistence', () => {
  it('keeps the document after a reload (offline, localStorage)', () => {
    cy.visitEmpty();
    cy.drawShape('rect', [100, 100], [200, 200]);
    cy.drawShape('star', [300, 100], [400, 200]);
    cy.drawShape('pencil', [450, 100], [550, 200]);
    cy.drawShape('connector', [150, 150], [350, 150]);
    cy.canvasClick([150, 150]);
    cy.prop('name').should('have.value', 'Rectangle 1');
    cy.canvasDblClick([150, 150]);
    cy.get('[data-testid=text-editor]').type('Hi{enter}');
    // Saves are debounced; wait until the write has landed before reloading.
    cy.window().its('localStorage').invoke('getItem', 'draftboard:document:v1').should('contain', '"label": "Hi"');

    cy.reload();
    cy.get('[data-node-type=rect]').should('have.length', 1);
    // Types with extra fields (star points, path points, connector ends, labels) must pass load validation.
    cy.get('[data-node-type=star]').should('have.length', 1);
    cy.get('[data-node-type=path]').should('have.length', 1);
    cy.get('[data-node-type=connector]').should('have.length', 1);
    cy.get('[data-node-type=rect]').should('contain.text', 'Hi');
  });
});
