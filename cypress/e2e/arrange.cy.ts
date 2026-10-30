const leftOf = (type: string) => (document: Document) => document.querySelector(`[data-node-type=${type}]`)!.getBoundingClientRect().left;

describe('Multi-selection panel', () => {
  beforeEach(() => {
    cy.visitEmpty();
    cy.drawShape('rect', [100, 100], [200, 200]);
    cy.prop('fill').clear().type('00FF00{enter}');
    cy.drawShape('ellipse', [300, 150], [450, 250]);
    cy.canvasDrag([50, 50], [500, 300]);
    cy.get('[data-testid=properties-panel]').should('contain', '2 layers selected');
  });

  // The maths and its undo step are pinned in align.test.ts; this only checks the button is wired up.
  it('the Align left button aligns the selection', () => {
    cy.get('[data-testid=align-left]').click();
    cy.document().should((doc) => expect(leftOf('ellipse')(doc)).to.be.closeTo(leftOf('rect')(doc), 1));
  });

  it('enables Distribute only for three or more layers', () => {
    cy.get('[data-testid=distribute-h]').should('be.disabled');
    cy.get('[data-testid=align-left]').should('be.enabled');
  });

  it('shows Mixed where values differ and applies an edit to every layer as one undo step', () => {
    cy.prop('fill').should('have.value', '').and('have.attr', 'placeholder', 'Mixed');
    cy.prop('opacity').should('have.value', '100');
    cy.prop('fill').type('0000FF{enter}');
    cy.get('[data-node-type=rect] rect').should('have.attr', 'fill', '#0000ff');
    cy.get('[data-node-type=ellipse] ellipse').should('have.attr', 'fill', '#0000ff');
    cy.prop('fill').should('have.value', '#0000FF');

    cy.prop('opacity').clear().type('50{enter}');
    cy.get('[data-node-type=rect]').should('have.attr', 'opacity', '0.5');
    cy.get('[data-node-type=ellipse]').should('have.attr', 'opacity', '0.5');

    cy.pressKey('z', { code: 'KeyZ', metaKey: true });
    cy.get('[data-node-type=rect]').should('have.attr', 'opacity', '1');
    cy.pressKey('z', { code: 'KeyZ', metaKey: true });
    cy.get('[data-node-type=rect] rect').should('have.attr', 'fill', '#00ff00');
    cy.get('[data-node-type=ellipse] ellipse').should('have.attr', 'fill', '#d9d9d9');
  });

  it('leaves a Mixed field alone when it is not edited', () => {
    cy.prop('fill').focus().blur();
    cy.get('[data-node-type=rect] rect').should('have.attr', 'fill', '#00ff00');
    cy.prop('fill').should('have.attr', 'placeholder', 'Mixed');
  });
});

describe('Mixed number field', () => {
  it('commits nothing when left untouched', () => {
    cy.visitEmpty();
    cy.drawShape('rect', [100, 100], [200, 200]);
    cy.prop('opacity').clear().type('50{enter}');
    cy.drawShape('ellipse', [300, 150], [450, 250]);
    cy.canvasDrag([50, 50], [500, 300]);
    cy.prop('opacity').should('have.value', '').and('have.attr', 'placeholder', 'Mixed').focus().blur();
    cy.get('[data-node-type=rect]').should('have.attr', 'opacity', '0.5');
    cy.get('[data-node-type=ellipse]').should('have.attr', 'opacity', '1');
  });
});

describe('Opacity of a selected group and its child', () => {
  it('is set once, on the group', () => {
    cy.visitEmpty();
    cy.drawShape('rect', [100, 100], [200, 200]);
    cy.drawShape('rect', [300, 100], [400, 200]);
    cy.canvasDrag([50, 50], [500, 300]);
    cy.get('[data-testid=group-selection]').click();
    // Containers start expanded, so the child's row is already listed.
    cy.contains('[data-testid=layers-panel] [role=treeitem]', 'Rectangle 1').click({ shiftKey: true });
    cy.get('[data-testid=properties-panel]').should('contain', '2 layers selected');
    cy.prop('opacity').clear().type('50{enter}');
    // A container's opacity sits on its subtree wrapper; the child keeps its own, or the two would compound.
    cy.get('[data-node-type=group]').parent().should('have.attr', 'opacity', '0.5');
    cy.get('[data-node-type=rect]').first().should('have.attr', 'opacity', '1');
  });
});

describe('Distribute', () => {
  it('gives three layers equal gaps', () => {
    cy.visitEmpty();
    cy.drawShape('rect', [50, 50], [100, 100]);
    cy.drawShape('rect', [110, 50], [160, 100]);
    cy.drawShape('rect', [350, 50], [400, 100]);
    cy.canvasDrag([20, 20], [450, 140]);
    cy.get('[data-testid=properties-panel]').should('contain', '3 layers selected');
    cy.get('[data-testid=distribute-h]').should('be.enabled').click();
    const edges = () =>
      cy.get('[data-node-type=rect]').then(($els) => [...$els].map((el) => el.getBoundingClientRect()));
    edges().should((r) => {
      expect(r[1]!.left - r[0]!.right).to.be.closeTo(r[2]!.left - r[1]!.right, 1);
    });
  });
});

describe('Arrange section', () => {
  beforeEach(() => {
    cy.visitEmpty();
    cy.drawShape('rect', [100, 100], [200, 200]);
    cy.drawShape('rect', [150, 150], [250, 250]);
  });

  it('sends the selection to the back and brings it to the front', () => {
    cy.get('[data-node-type=rect]').last().invoke('attr', 'data-node-id').then((id) => {
      cy.get('[data-testid=send-to-back]').click();
      cy.get('[data-node-type=rect]').first().should('have.attr', 'data-node-id', id);
      cy.get('[data-testid=bring-to-front]').click();
      cy.get('[data-node-type=rect]').last().should('have.attr', 'data-node-id', id);
    });
  });

  it('duplicates, groups, ungroups and deletes', () => {
    cy.get('[data-testid=duplicate-selection]').click();
    cy.get('[data-node-type=rect]').should('have.length', 3);
    cy.get('[data-testid=ungroup-selection]').should('be.disabled');
    cy.get('[data-testid=group-selection]').click();
    cy.get('[data-node-type=group]').should('have.length', 1);
    cy.get('[data-testid=ungroup-selection]').should('be.enabled').click();
    cy.get('[data-node-type=group]').should('not.exist');
    cy.get('[data-testid=delete-selection]').click();
    cy.get('[data-node-type=rect]').should('have.length', 2);
  });

  it('names its buttons and takes shortcut text from the registry', () => {
    cy.get('[data-testid=send-to-back]').should('have.attr', 'aria-label').and('match', /^Send to back/);
    cy.contains('[data-testid=properties-panel] button', 'Zoom to selection').should('exist');
    cy.get('[data-testid=properties-panel]').should('not.contain', 'Drag to move them together');
  });
});
