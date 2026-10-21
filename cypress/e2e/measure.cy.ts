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

  it('measures to each side of a layer that encloses the selection', () => {
    cy.drawShape('frame', [50, 50], [450, 260]);
    cy.get('[data-testid=layers-panel]').contains('Rectangle 2').click();
    cy.prop('name').should('have.value', 'Rectangle 2');
    holdAlt(true);
    // Inside the frame but over neither rect.
    hover([250, 230]);
    measure('x', 250).should('exist');
    measure('x', 50).should('exist');
    measure('y', 50).should('exist');
    measure('y', 60).should('exist');
  });

  it('measures edge to edge for a layer that partly overlaps the selection', () => {
    cy.drawShape('rect', [150, 150], [250, 250]);
    holdAlt(true);
    // Over rect 1 only, outside the new rect.
    hover([120, 120]);
    cy.get('[data-testid=distance-measure][data-axis=x][data-distance="50"]').should('have.length', 2);
    cy.get('[data-testid=distance-measure][data-axis=y][data-distance="50"]').should('have.length', 2);
  });

  it('leads a dashed line to a layer that sits diagonally away', () => {
    cy.drawShape('rect', [500, 400], [560, 460]);
    holdAlt(true);
    hover([150, 150]);
    measure('x', 300).should('exist');
    measure('y', 200).should('exist');
    cy.get('[data-testid=measure-leader]').should('have.length', 2);
  });
});
