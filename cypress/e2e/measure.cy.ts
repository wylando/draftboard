// Real pointer events report whether Alt is down, and the canvas trusts them, so hovers must agree.
let altDown = false;

const holdAlt = (down: boolean) => {
  // Set while the command queue is built, which is when `hover` reads it.
  altDown = down;
  return cy.window().then((win) => {
    win.document.body.dispatchEvent(
      new win.KeyboardEvent(down ? 'keydown' : 'keyup', { key: 'Alt', code: 'AltLeft', altKey: down, bubbles: true }),
    );
  });
};

const hover = (at: [number, number]) => cy.canvasPointer('pointermove', at, { buttons: 0, altKey: altDown });

const measure = (axis: 'x' | 'y', distance: number) =>
  cy.get(`[data-testid=distance-measure][data-axis=${axis}][data-distance="${distance}"]`);

// Which distances and leaders are drawn is pinned by the measureBetween unit tests in geometry.test.ts.
describe('Measuring distances with Alt', () => {
  beforeEach(() => {
    altDown = false;
    cy.visitEmpty();
    cy.drawShape('rect', [100, 100], [200, 200]);
    // Selected after drawing: 300..400 × 100..200.
    cy.drawShape('rect', [300, 100], [400, 200]);
  });

  it('shows the gap to the hovered layer while Alt is held, and outlines that layer', () => {
    // The pointer rests on rect 1 before Alt goes down.
    hover([150, 150]);
    holdAlt(true);
    measure('x', 100).should('exist');
    cy.get('[data-testid=distance-measure]').should('have.length', 1);
    cy.get('[data-testid=measure-target]').should('exist');

    holdAlt(false);
    cy.get('[data-testid=distance-measure]').should('not.exist');
    // Leaving the window with Alt down never delivers its keyup.
    holdAlt(true);
    measure('x', 100).should('exist');
    cy.window().then((win) => win.dispatchEvent(new win.Event('blur')));
    cy.get('[data-testid=distance-measure]').should('not.exist');
  });

  it('shows nothing over the selection itself, or after the canvas moves under a still pointer', () => {
    holdAlt(true);
    hover([350, 150]);
    cy.get('[data-testid=measure-target]').should('not.exist');
    hover([150, 150]);
    measure('x', 100).should('exist');
    cy.get('[data-testid=canvas]').then(($c) => {
      const win = $c[0]!.ownerDocument.defaultView!;
      $c[0]!.dispatchEvent(new win.WheelEvent('wheel', { deltaX: 0, deltaY: 400, bubbles: true, cancelable: true }));
    });
    // Rect 1 has scrolled away from the pointer.
    cy.get('[data-testid=distance-measure]').should('not.exist');
  });
});
