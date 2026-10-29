/** Draws a table with the Table tool at canvas point `at`, then waits for the tool to fall back to Move. */
export const placeTable = (at: [number, number]) => {
  cy.pressKey('d', { code: 'KeyD' });
  cy.get('[data-testid=canvas]').should('have.attr', 'data-tool', 'table');
  cy.canvasClick(at);
  cy.get('[data-testid=canvas]').should('have.attr', 'data-tool', 'select');
};

export const undo = () => cy.pressKey('z', { code: 'KeyZ', metaKey: true });
