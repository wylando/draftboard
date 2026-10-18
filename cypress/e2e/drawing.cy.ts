describe('Drawing shapes', () => {
  beforeEach(() => cy.visitEmpty());

  it('draws a rectangle by dragging and selects it', () => {
    cy.drawShape('rect', [100, 100], [300, 200]);

    cy.get('[data-node-type=rect]').should('have.length', 1);
    cy.prop('x').should('have.value', '100');
    cy.prop('y').should('have.value', '100');
    cy.prop('w').should('have.value', '200');
    cy.prop('h').should('have.value', '100');
    cy.get('[data-testid=layers-panel]').should('contain', 'Rectangle 1');
  });

  it('returns to the move tool after creating a shape', () => {
    cy.drawShape('ellipse', [50, 50], [150, 150]);
    cy.get('[data-testid=canvas]').should('have.attr', 'data-tool', 'select');
    cy.get('[data-testid=tool-select]').should('have.attr', 'aria-pressed', 'true');
  });

  it('places a default-size shape on click using a keyboard shortcut', () => {
    cy.pressKey('o');
    cy.get('[data-testid=canvas]').should('have.attr', 'data-tool', 'ellipse');
    cy.canvasPointer('pointerdown', [200, 200]);
    cy.canvasPointer('pointerup', [200, 200]);

    cy.get('[data-node-type=ellipse]').should('have.length', 1);
    cy.prop('w').should('have.value', '100');
    cy.prop('h').should('have.value', '100');
  });

  it('draws frames, lines and auto-numbers layers', () => {
    cy.drawShape('frame', [40, 40], [400, 300]);
    cy.drawShape('line', [450, 50], [600, 150]);
    cy.drawShape('rect', [500, 300], [550, 350]);
    cy.drawShape('rect', [600, 300], [650, 350]);

    cy.get('[data-node-type=frame]').should('have.length', 1);
    cy.get('[data-node-type=line]').should('have.length', 1);
    cy.get('[data-testid=layers-panel]').should('contain', 'Frame 1').and('contain', 'Rectangle 2');
  });

  it('creates and edits text', () => {
    cy.pressKey('t');
    cy.get('[data-testid=canvas]').should('have.attr', 'data-tool', 'text');
    cy.canvasPointer('pointerdown', [120, 120]);
    cy.canvasPointer('pointerup', [120, 120]);

    cy.get('[data-testid=text-editor]').should('be.focused').type('Hello canvas{enter}');
    cy.get('[data-testid=text-editor]').should('not.exist');
    cy.get('[data-node-type=text]').should('contain.text', 'Hello canvas');
  });
});
