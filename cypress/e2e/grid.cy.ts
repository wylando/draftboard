const openCanvasSettings = () => {
  cy.get('[data-testid=app-menu]').click();
  cy.get('[data-testid=open-settings]').click();
  cy.get('[data-testid=nav-canvas]').click();
  cy.get('[data-testid=canvas-section]').should('be.visible');
};

describe('Canvas grid', () => {
  beforeEach(() => cy.visitEmpty());

  it('shows a dot grid by default', () => {
    cy.get('[data-testid=canvas]').should('have.attr', 'data-grid', 'dots');
    cy.get('[data-testid=canvas] pattern circle').should('exist');
  });

  it('switches to lines in Settings and keeps the choice after a reload', () => {
    openCanvasSettings();
    cy.get('[data-testid=grid-style-lines]').click();
    cy.get('[data-testid=grid-style-lines]').should('have.attr', 'data-state', 'checked');
    cy.get('[data-testid=grid-style-dots]').should('have.attr', 'data-state', 'unchecked');
    cy.get('[data-testid=close-settings]').click();
    cy.get('[data-testid=canvas]').should('have.attr', 'data-grid', 'lines');
    cy.get('[data-testid=canvas] pattern path').should('exist');

    cy.window().its('localStorage').invoke('getItem', 'draftboard:preferences:v1').should('contain', 'lines');
    cy.reload();
    cy.get('[data-testid=canvas]').should('have.attr', 'data-grid', 'lines');
  });

  it('can be turned off', () => {
    openCanvasSettings();
    cy.get('[data-testid=grid-style-none]').click();
    cy.get('[data-testid=close-settings]').click();
    cy.get('[data-testid=canvas]').should('have.attr', 'data-grid', 'none');
    cy.get('[data-testid=canvas-grid]').should('not.exist');
  });

  it('does not get in the way of drawing or box-selecting', () => {
    cy.drawShape('rect', [100, 100], [200, 200]);
    cy.canvasClick([600, 400]);
    cy.get('[data-testid=properties-panel]').should('contain', 'Select a layer');
    cy.canvasDrag([50, 50], [250, 250]);
    cy.prop('name').should('have.value', 'Rectangle 1');
  });
});
