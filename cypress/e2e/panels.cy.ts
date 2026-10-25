const panelWidth = (testId: string) => cy.get(`[data-testid=${testId}]`).invoke('outerWidth');
// Ark lays panels out with flex-grow ratios, so a width lands within a pixel of its target.
const shouldBeWidth = (testId: string, px: number) => panelWidth(testId).should('be.closeTo', px, 1);
const savedLayout = () => cy.window().then((win) => JSON.parse(win.localStorage.getItem('draftboard:layout:v1') ?? 'null'));

/** Drags a resize handle sideways; Ark tracks the move on the document once the handle is pressed. */
function dragHandle(testId: string, dx: number) {
  cy.get(`[data-testid=${testId}]`).pointer('pointerdown').should('have.attr', 'data-dragging');
  cy.get(`[data-testid=${testId}]`).then(($h) => {
    const doc = $h[0]!.ownerDocument;
    const rect = $h[0]!.getBoundingClientRect();
    const at = (type: string, x: number, buttons: number) =>
      doc.dispatchEvent(
        new doc.defaultView!.PointerEvent(type, { bubbles: true, clientX: rect.left + x, clientY: rect.top + rect.height / 2, pointerId: 1, pointerType: 'mouse', isPrimary: true, buttons }),
      );
    at('pointermove', dx / 2, 1);
    at('pointermove', dx, 1);
    at('pointerup', dx, 0);
  });
  cy.get(`[data-testid=${testId}]`).should('not.have.attr', 'data-dragging');
}

describe('Side panels', () => {
  beforeEach(() => {
    cy.visitEmpty();
  });

  it('resizes a panel by its edge and keeps the width after a reload and a window resize', () => {
    shouldBeWidth('layers-panel', 240);
    shouldBeWidth('properties-panel', 240);
    dragHandle('resize-layers', 60);
    shouldBeWidth('layers-panel', 300);
    // The Design panel's handle is on its left edge, so dragging left widens it.
    dragHandle('resize-properties', -40);
    shouldBeWidth('properties-panel', 280);
    savedLayout().its('layers.width').should('equal', 300);

    cy.reload();
    shouldBeWidth('layers-panel', 300);
    shouldBeWidth('properties-panel', 280);
    // Only the canvas takes up a change in window width.
    cy.viewport(1400, 800);
    shouldBeWidth('layers-panel', 300);
    shouldBeWidth('properties-panel', 280);
  });

  it('stops a resize at the widest width, and collapses a panel dragged past its narrowest', () => {
    dragHandle('resize-layers', 600);
    shouldBeWidth('layers-panel', 480);
    dragHandle('resize-layers', -400);
    cy.get('[data-testid=toggle-layers-panel]').should('have.attr', 'aria-pressed', 'false');
    cy.get('[data-testid=layers-panel]').should('not.be.visible');
    // It reopens at the width it had before the drag.
    cy.get('[data-testid=toggle-layers-panel]').click();
    shouldBeWidth('layers-panel', 480);
  });

  it('collapses and reopens a panel from the top bar, and remembers it across a reload', () => {
    dragHandle('resize-layers', 40);
    shouldBeWidth('layers-panel', 280);
    // Read once: an invoked alias would be re-measured after the collapse.
    let canvasBefore = 0;
    cy.get('[data-testid=canvas]').invoke('outerWidth').then((w) => (canvasBefore = w ?? 0));

    cy.get('[data-testid=toggle-layers-panel]').should('have.attr', 'aria-pressed', 'true').click();
    cy.get('[data-testid=toggle-layers-panel]').should('have.attr', 'aria-pressed', 'false');
    cy.get('[data-testid=layers-panel]').should('not.be.visible');
    // Collapsed controls must not take keyboard focus.
    cy.get('[data-testid=layers-panel]').closest('[inert]').should('exist');
    cy.get('[data-testid=canvas]').invoke('outerWidth').should((w) => expect(w).to.be.closeTo(canvasBefore + 280, 1));

    cy.reload();
    cy.get('[data-testid=toggle-layers-panel]').should('have.attr', 'aria-pressed', 'false');
    cy.get('[data-testid=layers-panel]').should('not.be.visible');
    cy.get('[data-testid=toggle-layers-panel]').click();
    shouldBeWidth('layers-panel', 280);
    cy.get('[data-testid=layers-panel]').closest('[inert]').should('not.exist');

    cy.get('[data-testid=toggle-properties-panel]').click();
    cy.get('[data-testid=properties-panel]').should('not.be.visible');
    cy.get('[data-testid=toggle-properties-panel]').click();
    shouldBeWidth('properties-panel', 240);
  });

  it('resizes with the arrow keys on a focused handle without nudging the selection', () => {
    cy.drawShape('rect', [100, 100], [200, 200]);
    cy.prop('x').should('have.value', '100');
    cy.get('[data-testid=resize-layers]').focus().should('have.attr', 'role', 'separator');
    cy.get('[data-testid=resize-layers]').then(($h) => {
      const init = { key: 'ArrowRight', code: 'ArrowRight', bubbles: true, cancelable: true };
      $h[0]!.dispatchEvent(new $h[0]!.ownerDocument.defaultView!.KeyboardEvent('keydown', init));
    });
    panelWidth('layers-panel').should('be.greaterThan', 240);
    // A later key outside the handle that does nudge: once it shows, a nudge from the handle's key would have too.
    cy.pressKey('ArrowDown', { code: 'ArrowDown' });
    cy.prop('y').should('have.value', '101');
    cy.prop('x').should('have.value', '100');
  });

  it("fits the layers and a table's properties at the narrowest widths without scrolling sideways", () => {
    dragHandle('resize-layers', -100);
    // The Design panel's controls need its default width, so it only widens.
    dragHandle('resize-properties', 40);
    shouldBeWidth('layers-panel', 160);
    shouldBeWidth('properties-panel', 240);
    cy.get('[data-testid=tool-table]').click();
    cy.canvasClick([200, 200]);
    cy.get('[data-node-type=table]').should('have.length', 1);
    for (const panel of ['layers-panel', 'properties-panel']) {
      cy.get(`[data-testid=${panel}]`).should(($p) => expect($p[0]!.scrollWidth).to.equal($p[0]!.clientWidth));
    }
  });
});
