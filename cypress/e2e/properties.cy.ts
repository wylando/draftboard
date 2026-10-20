const propLabel = (name: string) => cy.prop(name).siblings('[data-scrub]');

describe('Properties panel', () => {
  beforeEach(() => {
    cy.visitEmpty();
    cy.drawShape('rect', [100, 100], [200, 200]);
  });

  it('changes fill via hex input as one undo step', () => {
    cy.prop('fill').clear().type('00FF00{enter}');
    cy.get('[data-node-type=rect] rect').should('have.attr', 'fill', '#00ff00');
    cy.pressKey('z', { metaKey: true });
    cy.get('[data-node-type=rect] rect').should('have.attr', 'fill', '#d9d9d9');
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

  it('dragging the color picker only commits on change', () => {
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

  it('scrubbing a label changes the value live, as one undo step', () => {
    propLabel('w').pointer('pointerdown').pointer('pointermove', [10, 0]).pointer('pointermove', [20, 0]).pointer('pointermove', [30, 0]);
    cy.prop('w').should('have.value', '130');
    cy.get('[data-node-type=rect] rect').first().should('have.attr', 'width', '130');
    // A browser follows the release with a click on the label; it must not focus the input.
    propLabel('w').pointer('pointerup', [30, 0]).trigger('click', { eventConstructor: 'MouseEvent' });
    cy.prop('w').should('not.have.focus');

    cy.pressKey('z', { metaKey: true });
    cy.prop('w').should('have.value', '100');
    cy.get('[data-node-type=rect] rect').first().should('have.attr', 'width', '100');
  });

  it('a scrub starts from a typed value that the press commits', () => {
    cy.prop('w').clear().type('250');
    propLabel('w').pointer('pointerdown');
    // Stands in for the focus change a real press on the label causes.
    cy.prop('w').blur();
    cy.get('[data-node-type=rect] rect').first().should('have.attr', 'width', '250');
    propLabel('w').pointer('pointermove', [30, 0]).pointer('pointerup', [30, 0]);
    cy.prop('w').should('have.value', '280');
  });

  it('a plain click on a label focuses its input without changing the value', () => {
    propLabel('w').click();
    cy.prop('w').should('have.focus').and('have.value', '100').blur();
    // The only undo step left is the shape's creation: the click recorded nothing.
    cy.pressKey('z', { metaKey: true });
    cy.get('[data-node-type=rect]').should('not.exist');
  });

  it('scrubbing clamps at the minimum', () => {
    propLabel('opacity')
      .pointer('pointerdown')
      .pointer('pointermove', [-10, 0], { shiftKey: true })
      .pointer('pointermove', [-20, 0], { shiftKey: true })
      .pointer('pointerup', [-20, 0], { shiftKey: true });
    cy.prop('opacity').should('have.value', '0');
    cy.get('[data-node-type=rect]').should('have.attr', 'opacity', '0');
  });
});
