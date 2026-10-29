describe('Selecting, moving and resizing', () => {
  beforeEach(() => {
    cy.visitEmpty();
    cy.drawShape('rect', [100, 100], [200, 200]);
    cy.drawShape('rect', [300, 100], [400, 200]);
  });

  it('clicking empty canvas clears the selection', () => {
    cy.get('[data-testid=prop-x]').should('exist');
    cy.canvasClick([700, 500]);
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

  it('rotates by dragging just outside a corner, as one undo step', () => {
    // The selected rect is centered at (350, 150); its NE rotate zone sits just past (400, 100).
    cy.get('[data-testid=rotate-ne]').should('exist');
    cy.canvasDrag([410, 90], [410, 210]);
    cy.prop('rotation').should('have.value', '90');
    cy.get('[data-node-type=rect]').last().should('have.attr', 'transform').and('contain', 'rotate(90 ');
    cy.pressKey('z', { code: 'KeyZ', metaKey: true });
    cy.prop('rotation').should('have.value', '0');
  });

  it('Shift snaps a corner rotation to 15° steps', () => {
    // Unsnapped, this drag turns the rect about 52°.
    cy.canvasDrag([410, 90], [430, 160], { shiftKey: true });
    cy.prop('rotation').should('have.value', '45');
  });

  it('marquee-selects multiple shapes, and shift-click adds to the selection', () => {
    cy.canvasDrag([50, 50], [450, 250]);
    cy.get('[data-testid=properties-panel]').should('contain', '2 layers selected');

    cy.canvasClick([700, 500]);
    cy.get('[data-testid=properties-panel]').should('contain', 'Select a layer');
    cy.canvasClick([150, 150]);
    cy.prop('x').should('have.value', '100');
    cy.canvasClick([350, 150], { shiftKey: true });
    cy.get('[data-testid=properties-panel]').should('contain', '2 layers selected');
  });
});
