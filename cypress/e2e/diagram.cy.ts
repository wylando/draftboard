const layer = (name: string) => cy.contains('[data-testid=layers-panel] [role=treeitem]', name);
const MOD = { metaKey: true, ctrlKey: true };

describe('Align and distribute', () => {
  beforeEach(() => cy.visitEmpty());

  it('aligns the selection to its left edge with the shortcut', () => {
    cy.drawShape('rect', [100, 100], [200, 200]);
    cy.drawShape('rect', [300, 250], [340, 290]);
    cy.pressKey('a', { ...MOD, code: 'KeyA' });
    cy.get('[data-testid=properties-panel]').should('contain', '2 layers selected');
    cy.pressKey('a', { altKey: true, code: 'KeyA' });
    layer('Rectangle 2').click();
    cy.prop('x').should('have.value', '100');
    cy.prop('y').should('have.value', '250');
  });

  it('distributes three layers with equal gaps, leaving the outer two in place', () => {
    cy.drawShape('rect', [100, 100], [150, 150]);
    cy.drawShape('rect', [200, 100], [220, 120]);
    cy.drawShape('rect', [400, 100], [450, 150]);
    cy.pressKey('a', { ...MOD, code: 'KeyA' });
    cy.get('[data-testid=distribute-horizontal]').click();
    // Span 100–450 holds 120px of layers, so each of the two gaps is 115px.
    layer('Rectangle 2').click();
    cy.prop('x').should('have.value', '265');
    layer('Rectangle 3').click();
    cy.prop('x').should('have.value', '400');
  });
});

describe('Labels and sticky notes', () => {
  beforeEach(() => cy.visitEmpty());

  it('double-clicking a selected diamond edits its label, and the shape stays visible meanwhile', () => {
    cy.drawShape('diamond', [100, 100], [300, 200]);
    cy.canvasDblClick([200, 150]);
    cy.get('[data-testid=text-editor]').should('be.focused');
    cy.get('[data-node-type=diamond] polygon').should('be.visible');
    cy.get('[data-testid=text-editor]').type('Decision{enter}');
    cy.get('[data-testid=text-editor]').should('not.exist');
    cy.get('[data-node-type=diamond]').should('contain.text', 'Decision');
  });

  it('clicking with the sticky tool places a note and starts editing it', () => {
    cy.pressKey('n', { code: 'KeyN' });
    cy.get('[data-testid=canvas]').should('have.attr', 'data-tool', 'sticky');
    cy.canvasClick([200, 200]);
    cy.get('[data-testid=text-editor]').should('be.focused').type('Idea{enter}');
    cy.get('[data-node-type=sticky]').should('contain.text', 'Idea');
    cy.prop('w').should('have.value', '200');
  });
});

describe('Connectors', () => {
  beforeEach(() => {
    cy.visitEmpty();
    cy.drawShape('rect', [100, 100], [200, 200]);
    cy.drawShape('rect', [400, 100], [500, 200]);
    cy.drawShape('connector', [150, 150], [450, 150]);
  });

  it('runs edge to edge between two layers and follows when one moves', () => {
    layer('Connector 1').click();
    cy.prop('x').should('have.value', '200');
    cy.prop('w').should('have.value', '200');

    layer('Rectangle 2').click();
    cy.prop('x').clear().type('600{enter}');
    layer('Connector 1').click();
    cy.prop('w').should('have.value', '400');
  });

  it('a duplicated connector attaches to the duplicated layers', () => {
    cy.pressKey('a', { ...MOD, code: 'KeyA' });
    cy.pressKey('d', { ...MOD, code: 'KeyD' });
    cy.get('[data-node-type=connector]').should('have.length', 2);
    // Copies sit above their originals, so the first row of each name is the copy.
    cy.contains('[data-testid=layers-panel] [role=treeitem]', 'Rectangle 2').click();
    cy.prop('x').should('have.value', '410');
    cy.prop('x').clear().type('700{enter}');
    cy.contains('[data-testid=layers-panel] [role=treeitem]', 'Connector 1').click();
    cy.prop('x').should('have.value', '210');
    cy.prop('w').should('have.value', '490');
  });
});

export {};
