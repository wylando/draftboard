/** Draws a table with the Table tool at canvas point `at`, then waits for the tool to fall back to Move. */
export const placeTable = (at: [number, number]) => {
  cy.pressKey('d', { code: 'KeyD' });
  cy.get('[data-testid=canvas]').should('have.attr', 'data-tool', 'table');
  cy.canvasClick(at);
  cy.get('[data-testid=canvas]').should('have.attr', 'data-tool', 'select');
};

export const undo = () => cy.pressKey('z', { code: 'KeyZ', metaKey: true });

/** A Layers-panel row, found by its layer name. */
export const layerRow = (name: string) => cy.contains('[data-testid=layers-panel] [role=treeitem]', name);

/** Modifier flags for "the platform's command key": Cypress runs on macOS and Linux, so both are set. */
export const MOD = { metaKey: true, ctrlKey: true };
