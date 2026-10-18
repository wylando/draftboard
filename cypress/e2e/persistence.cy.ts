describe('Local persistence', () => {
  it('keeps the document after a reload (offline, localStorage)', () => {
    cy.visitEmpty();
    cy.drawShape('rect', [100, 100], [200, 200]);
    cy.drawShape('ellipse', [300, 100], [400, 200]);
    // Saves are debounced; wait until the write has landed before reloading.
    cy.window().its('localStorage').invoke('getItem', 'draftboard:document:v1').should('contain', 'ellipse');

    cy.reload();
    cy.get('[data-node-type=rect]').should('have.length', 1);
    cy.get('[data-node-type=ellipse]').should('have.length', 1);
  });
});
