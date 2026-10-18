const layer = (name: string) => cy.contains('[data-testid=layers-panel] [role=treeitem]', name);
const MOD = { metaKey: true, ctrlKey: true };

describe('Copy, cut and paste', () => {
  beforeEach(() => {
    cy.visitEmpty();
    cy.drawShape('rect', [100, 100], [200, 200]);
  });

  it('each paste lands 10px further from the last, and undo removes one paste', () => {
    cy.pressKey('c', { ...MOD, code: 'KeyC' });
    // Fired back-to-back on purpose: the second paste must not read stale state.
    cy.pressKey('v', { ...MOD, code: 'KeyV' });
    cy.pressKey('v', { ...MOD, code: 'KeyV' });
    cy.get('[data-node-type=rect]').should('have.length', 3);
    cy.prop('x').should('have.value', '120');
    cy.prop('y').should('have.value', '120');

    cy.pressKey('z', { ...MOD, code: 'KeyZ' });
    cy.get('[data-node-type=rect]').should('have.length', 2);
  });

  it('cut removes the layer as one undo step, and paste brings a copy back', () => {
    cy.pressKey('x', { ...MOD, code: 'KeyX' });
    cy.get('[data-node-type=rect]').should('not.exist');
    cy.pressKey('v', { ...MOD, code: 'KeyV' });
    cy.get('[data-node-type=rect]').should('have.length', 1);
    cy.prop('x').should('have.value', '110');

    cy.pressKey('z', { ...MOD, code: 'KeyZ' });
    cy.get('[data-node-type=rect]').should('not.exist');
    cy.pressKey('z', { ...MOD, code: 'KeyZ' });
    cy.get('[data-node-type=rect]').should('have.length', 1);
    cy.canvasClick([150, 150]);
    cy.prop('x').should('have.value', '100');
  });

  it('pasting a frame copies its children into the new frame', () => {
    cy.pressKey('Backspace');
    cy.drawShape('frame', [50, 50], [450, 350]);
    cy.drawShape('rect', [100, 100], [200, 200]);
    layer('Frame 1').click();
    cy.prop('name').should('have.value', 'Frame 1');

    cy.pressKey('c', { ...MOD, code: 'KeyC' });
    cy.pressKey('v', { ...MOD, code: 'KeyV' });
    cy.get('[data-node-type=frame]').should('have.length', 2);
    cy.get('[data-node-type=rect]').should('have.length', 2);
    // One child under each frame. Without id remapping both children would sit under the original: 1,2,2,1.
    cy.get('[data-testid=layers-panel] [role=treeitem]').should(($rows) => {
      expect([...$rows].map((r) => r.getAttribute('aria-level')).join(',')).to.equal('1,2,1,2');
    });
  });
});

export {};
