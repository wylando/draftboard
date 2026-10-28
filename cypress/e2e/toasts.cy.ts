const MOD_KEYS = { metaKey: true, ctrlKey: true };
const toast = () => cy.get('[data-testid=toast]');

describe('Toasts', () => {
  beforeEach(() => {
    cy.visitEmpty();
  });

  it('confirms a copy and reports a paste with nothing to paste', () => {
    cy.pressKey('v', { ...MOD_KEYS, code: 'KeyV' });
    toast().should('contain', 'Nothing to paste');

    cy.drawShape('rect', [100, 100], [200, 200]);
    cy.pressKey('c', { ...MOD_KEYS, code: 'KeyC' });
    toast().should('contain', 'Copied 1 layer');
  });

  it('says nothing when the command does nothing', () => {
    cy.pressKey('c', { ...MOD_KEYS, code: 'KeyC' });
    cy.pressKey('d', { ...MOD_KEYS, code: 'KeyD' });
    cy.pressKey('Backspace');
    // A toast from any of the above would still be on screen next to this one.
    cy.drawShape('rect', [100, 100], [200, 200]);
    cy.pressKey('c', { ...MOD_KEYS, code: 'KeyC' });
    toast().should('have.length', 1).and('contain', 'Copied 1 layer');
  });

  it('pastes, duplicates and cuts with counts', () => {
    cy.drawShape('rect', [100, 100], [200, 200]);
    cy.pressKey('d', { ...MOD_KEYS, code: 'KeyD' });
    toast().should('contain', 'Duplicated 1 layer');
    cy.pressKey('x', { ...MOD_KEYS, code: 'KeyX' });
    toast().should('contain', 'Cut 1 layer');
    cy.pressKey('v', { ...MOD_KEYS, code: 'KeyV' });
    toast().should('contain', 'Pasted 1 layer');
  });

  it('offers Undo after a delete, and Undo restores the layer', () => {
    cy.drawShape('rect', [100, 100], [200, 200]);
    cy.pressKey('Backspace');
    cy.get('[data-node-type=rect]').should('not.exist');
    toast().should('contain', 'Deleted 1 layer');
    cy.get('[data-testid=toast-action]').click();
    cy.get('[data-node-type=rect]').should('have.length', 1);
  });

  it('is a polite live region that leaves focus alone and fades away by itself', () => {
    cy.drawShape('rect', [100, 100], [200, 200]);
    cy.pressKey('c', { ...MOD_KEYS, code: 'KeyC' });
    toast().should('be.visible');
    cy.get('[data-testid=toast-region]').should('have.attr', 'aria-live', 'polite');
    cy.focused().should('not.have.attr', 'data-testid', 'toast-action');
    cy.get('[data-testid=toast]', { timeout: 10000 }).should('not.exist');
  });

  it('does not block canvas clicks beside the toast', () => {
    cy.drawShape('rect', [100, 100], [200, 200]);
    cy.pressKey('c', { ...MOD_KEYS, code: 'KeyC' });
    toast().should('be.visible');
    // The region spans the canvas width at the bottom; a click there must still reach the canvas.
    cy.get('[data-testid=toast-region]').then(($r) => {
      const box = $r[0].getBoundingClientRect();
      cy.get('[data-testid=canvas]').then(($c) => {
        const c = $c[0].getBoundingClientRect();
        cy.document().then((doc) => {
          const el = doc.elementFromPoint(c.left + 20, box.bottom - 10);
          expect(el?.closest('[data-testid=toast-region]')).to.equal(null);
        });
      });
    });
    cy.canvasClick([150, 150]);
    cy.prop('name').should('have.value', 'Rectangle 1');
  });
});
