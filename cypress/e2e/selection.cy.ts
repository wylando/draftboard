describe('Selecting, moving and resizing', () => {
  beforeEach(() => {
    cy.visitEmpty();
    cy.drawShape('rect', [100, 100], [200, 200]);
    cy.drawShape('rect', [300, 100], [400, 200]);
  });

  it('clicking empty canvas clears the selection', () => {
    cy.get('[data-testid=prop-x]').should('exist');
    cy.canvasPointer('pointerdown', [700, 500]);
    cy.canvasPointer('pointerup', [700, 500]);
    cy.get('[data-testid=prop-x]').should('not.exist');
    cy.get('[data-testid=properties-panel]').should('contain', 'Select a layer');
  });

  it('drags a shape to move it', () => {
    cy.canvasDrag([150, 150], [190, 210]);
    cy.prop('x').should('have.value', '140');
    cy.prop('y').should('have.value', '160');
  });

  it('resizes with the bottom-right handle', () => {
    // Second rect is selected after drawing; its SE handle sits at (400, 200).
    cy.canvasDrag([400, 200], [450, 260]);
    cy.prop('w').should('have.value', '150');
    cy.prop('h').should('have.value', '160');
    cy.prop('x').should('have.value', '300');
  });

  it('marquee-selects multiple shapes', () => {
    cy.canvasDrag([50, 50], [450, 250]);
    cy.get('[data-testid=properties-panel]').should('contain', '2 layers selected');
  });

  it('shift-click adds to the selection', () => {
    cy.canvasPointer('pointerdown', [150, 150], { shiftKey: true });
    cy.canvasPointer('pointerup', [150, 150], { shiftKey: true });
    cy.get('[data-testid=properties-panel]').should('contain', '2 layers selected');
  });

  it('selects a layer from the layers panel', () => {
    cy.get('[data-testid=layers-panel]').contains('Rectangle 1').click();
    cy.prop('name').should('have.value', 'Rectangle 1');
    cy.prop('x').should('have.value', '100');
  });
});
