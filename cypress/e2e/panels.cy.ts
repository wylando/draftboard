// Measured on the splitter panel, which holds the header bar and the scrolling panel below it.
const panelWidth = (testId: string) => cy.get(`[data-testid=${testId}]`).parent().invoke('outerWidth');
const rectOf = (testId: string) => cy.get(`[data-testid=${testId}]`).then(($el) => $el[0]!.getBoundingClientRect());
// Ark lays panels out with flex-grow percentages rounded to 3 significant digits, so a width lands
// within a couple of pixels of its target.
const TOLERANCE = 2;
const shouldBeWidth = (testId: string, px: number) => panelWidth(testId).should('be.closeTo', px, TOLERANCE);
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
    cy.get('[data-testid=layers-panel]').should('not.be.visible');
    // It reopens at the width it had before the drag.
    cy.get('[data-testid=show-layers-panel]').click();
    shouldBeWidth('layers-panel', 480);
  });

  it('collapses each panel into a button in its corner of the canvas and reopens it from there', () => {
    dragHandle('resize-layers', 40);
    shouldBeWidth('layers-panel', 280);
    // Read once: an invoked alias would be re-measured after the collapse.
    let canvasBefore = 0;
    cy.get('[data-testid=canvas]').invoke('outerWidth').then((w) => (canvasBefore = w ?? 0));

    // The Layers button sits at the right of its header, on the canvas side.
    rectOf('layers-panel').then((panel) =>
      rectOf('hide-layers-panel').should((b) => {
        expect(b.right).to.be.within(panel.right - 16, panel.right);
        expect(b.bottom).to.be.at.most(panel.top);
      }),
    );
    cy.get('[data-testid=hide-layers-panel]').should('have.attr', 'aria-expanded', 'true').click();
    cy.get('[data-testid=layers-panel]').should('not.be.visible');
    // Collapsed controls must not take keyboard focus; focus moves to the button that reopens it.
    cy.get('[data-testid=layers-panel]').closest('[inert]').should('exist');
    cy.get('[data-testid=show-layers-panel]').should('have.focus').and('have.attr', 'aria-expanded', 'false');
    cy.get('[data-testid=canvas]').invoke('outerWidth').should((w) => expect(w).to.be.closeTo(canvasBefore + 280, TOLERANCE));
    rectOf('canvas').then((canvas) =>
      rectOf('show-layers-panel').should((b) => {
        expect(b.left).to.be.within(canvas.left, canvas.left + 16);
        expect(b.top).to.be.within(canvas.top, canvas.top + 16);
      }),
    );
    // The morph: the panel's transition name moves to the button that replaces it.
    cy.get('[data-testid=show-layers-panel]').parent().should('have.css', 'view-transition-name', 'layers-panel');
    cy.get('[data-testid=layers-panel]').parent().should('have.css', 'view-transition-name', 'none');

    cy.reload();
    cy.get('[data-testid=layers-panel]').should('not.be.visible');
    cy.get('[data-testid=show-layers-panel]').click();
    shouldBeWidth('layers-panel', 280);
    cy.get('[data-testid=hide-layers-panel]').should('have.focus');
    cy.get('[data-testid=show-layers-panel]').should('not.exist');
    cy.get('[data-testid=layers-panel]').closest('[inert]').should('not.exist');

    // The Design panel mirrors it: its button is at the left of its header, and it collapses to the top right.
    rectOf('properties-panel').then((panel) =>
      rectOf('hide-properties-panel').should((b) => expect(b.left).to.be.within(panel.left, panel.left + 16)),
    );
    // Collapsed in a narrow window, reopened in a wider one: still its own width, not its old share of the window.
    cy.viewport(1000, 800);
    cy.get('[data-testid=hide-properties-panel]').click();
    cy.get('[data-testid=properties-panel]').should('not.be.visible');
    rectOf('canvas').then((canvas) =>
      rectOf('show-properties-panel').should((b) => {
        expect(b.right).to.be.within(canvas.right - 16, canvas.right);
        expect(b.top).to.be.within(canvas.top, canvas.top + 16);
      }),
    );
    cy.viewport(1400, 800);
    // Wait for the splitter to take in the new window width before reopening.
    cy.get('[data-testid=canvas]').invoke('outerWidth').should('be.closeTo', 1400 - 280, TOLERANCE);
    cy.get('[data-testid=show-properties-panel]').click();
    shouldBeWidth('properties-panel', 240);
    shouldBeWidth('layers-panel', 280);
  });

  it('leaves the canvas content where it is on screen while the Layers panel resizes, hides or shows', () => {
    cy.drawShape('rect', [100, 100], [200, 200]);
    cy.get('[data-node-type=rect]').then(($r) => {
      const left = $r[0]!.getBoundingClientRect().left;
      const stays = () => cy.get('[data-node-type=rect]').should(($n) => expect($n[0]!.getBoundingClientRect().left).to.be.closeTo(left, 0.5));
      dragHandle('resize-layers', 60);
      shouldBeWidth('layers-panel', 300);
      stays();
      cy.get('[data-testid=hide-layers-panel]').click();
      cy.get('[data-testid=show-layers-panel]').should('exist');
      stays();
      cy.get('[data-testid=show-layers-panel]').click();
      cy.get('[data-testid=hide-layers-panel]').should('have.focus');
      stays();
    });
  });

  it('keeps the tool dock in place while panels resize, hide and show', () => {
    let dockWidth = 0;
    rectOf('tool-dock').then((dock) => {
      dockWidth = dock.width;
      const stays = () => rectOf('tool-dock').its('left').should('be.closeTo', dock.left, 0.5);
      dragHandle('resize-layers', 60);
      shouldBeWidth('layers-panel', 300);
      stays();
      dragHandle('resize-properties', -100);
      shouldBeWidth('properties-panel', 340);
      stays();
      cy.get('[data-testid=hide-layers-panel]').click();
      cy.get('[data-testid=show-layers-panel]').should('have.focus');
      stays();
      cy.get('[data-testid=hide-properties-panel]').click();
      cy.get('[data-testid=show-properties-panel]').should('have.focus');
      stays();
      cy.get('[data-testid=show-layers-panel]').click();
      cy.get('[data-testid=hide-layers-panel]').should('have.focus');
      stays();
    });
    // Where the collapsed panels' room doesn't fit (480 + 240 px of an 800 px canvas), the dock still stays whole on the canvas.
    dragHandle('resize-layers', 600);
    shouldBeWidth('layers-panel', 480);
    cy.get('[data-testid=hide-layers-panel]').click();
    cy.get('[data-testid=show-layers-panel]').should('have.focus');
    cy.viewport(800, 800);
    cy.get('[data-testid=canvas]').invoke('outerWidth').should('be.closeTo', 800, TOLERANCE);
    rectOf('canvas').then((canvas) =>
      rectOf('tool-dock').should((dock) => {
        expect(dock.left).to.be.at.least(canvas.left);
        expect(dock.right).to.be.at.most(canvas.right);
        expect(dock.width).to.be.closeTo(dockWidth, 0.5);
      }),
    );
  });

  it('keeps the header bar in place while a long Layers list scrolls', () => {
    const rects = Array.from({ length: 60 }, (_, i) => ({
      id: `r${i}`, type: 'rect', name: `Rect ${i}`, parentId: null, x: i * 20, y: 100, width: 10, height: 10,
      rotation: 0, fill: '#cccccc', stroke: '#000000', strokeWidth: 1, opacity: 1, visible: true, cornerRadius: 0,
    }));
    const workspace = { version: 1, activeId: 'b1', boards: [{ id: 'b1', name: 'Board 1', nodes: rects }] };
    cy.visit('/', { onBeforeLoad: (win) => win.localStorage.setItem('draftboard:workspace:v1', JSON.stringify(workspace)) });
    cy.get('[data-testid=layers-panel] [role=treeitem]').should('have.length', 60);
    rectOf('hide-layers-panel').then((before) => {
      cy.get('[data-testid=layers-panel]').scrollTo('bottom');
      cy.get('[data-testid=layers-panel]').invoke('scrollTop').should('be.greaterThan', 0);
      rectOf('hide-layers-panel').its('top').should('equal', before.top);
    });
    cy.get('[data-testid=layers-panel] [role=treeitem]').first().should('not.be.visible');
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
