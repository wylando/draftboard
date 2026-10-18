describe('Properties panel', () => {
  beforeEach(() => {
    cy.visitEmpty();
    cy.drawShape('rect', [100, 100], [200, 200]);
  });

  it('changes fill color via hex input', () => {
    cy.prop('fill').clear().type('FF0000{enter}');
    cy.get('[data-node-type=rect] rect').should('have.attr', 'fill', '#ff0000');
  });

  it('moves a node by editing X and Y', () => {
    cy.prop('x').clear().type('250{enter}');
    cy.prop('y').clear().type('40{enter}');
    cy.get('[data-node-type=rect]').should('have.attr', 'transform').and('contain', 'translate(250 40)');
  });

  it('applies stroke and corner radius', () => {
    cy.prop('stroke-width').clear().type('4{enter}');
    cy.prop('radius').clear().type('12{enter}');
    cy.get('[data-node-type=rect] rect').should('have.attr', 'stroke-width', '4').and('have.attr', 'rx', '12');
  });

  it('rejects invalid numbers and keeps the previous value', () => {
    cy.prop('w').clear().type('abc{enter}');
    cy.prop('w').should('have.value', '100');
  });

  it('hides a layer from the layers panel', () => {
    cy.get('[data-testid=layers-panel] [aria-label="Hide layer"]').click({ force: true });
    cy.get('[data-node-type=rect]').should('not.exist');
  });
});

describe('Color edits and history', () => {
  it('one fill change is one undo step', () => {
    cy.visitEmpty();
    cy.drawShape('rect', [100, 100], [200, 200]);
    cy.prop('fill').clear().type('00FF00{enter}');
    cy.get('[data-node-type=rect] rect').should('have.attr', 'fill', '#00ff00');
    cy.pressKey('z', { metaKey: true });
    cy.get('[data-node-type=rect] rect').should('have.attr', 'fill', '#d9d9d9');
  });

  it('dragging the color picker only commits on change', () => {
    cy.visitEmpty();
    cy.drawShape('rect', [100, 100], [200, 200]);
    cy.get('[data-testid=prop-fill-swatch]').then(($el) => {
      const el = $el[0] as HTMLInputElement;
      const win = el.ownerDocument.defaultView!;
      // Simulate a picker drag: React-controlled value updates via the native setter + input events.
      const setValue = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value')!.set!;
      for (const color of ['#110000', '#220000', '#330000']) {
        setValue.call(el, color);
        el.dispatchEvent(new win.Event('input', { bubbles: true }));
      }
      el.dispatchEvent(new win.Event('change', { bubbles: true }));
    });
    cy.get('[data-node-type=rect] rect').should('have.attr', 'fill', '#330000');
    cy.pressKey('z', { metaKey: true });
    cy.get('[data-node-type=rect] rect').should('have.attr', 'fill', '#d9d9d9');
  });
});
