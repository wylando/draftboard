const zoomLabel = () => cy.get('[data-testid=zoom-level]');

describe('Viewport: zoom and pan', () => {
  beforeEach(() => cy.visitEmpty());

  it('zooms in and out with toolbar buttons', () => {
    zoomLabel().should('have.text', '100%');
    cy.get('[data-testid=zoom-level]').click();
    cy.get('[data-testid=zoom-in]').click();
    zoomLabel().should('have.text', '200%');
    cy.get('[data-testid=zoom-level]').click();
    cy.get('[data-testid=zoom-out]').click();
    cy.get('[data-testid=zoom-level]').click();
    cy.get('[data-testid=zoom-out]').click();
    zoomLabel().should('have.text', '50%');
  });

  it('resets to 100% with Shift+0', () => {
    cy.get('[data-testid=zoom-level]').click();
    cy.get('[data-testid=zoom-in]').click();
    zoomLabel().should('have.text', '200%');
    cy.pressKey(')', { code: 'Digit0', shiftKey: true });
    zoomLabel().should('have.text', '100%');
  });

  it('zooms with ctrl + wheel', () => {
    cy.get('[data-testid=canvas]').then(($c) => {
      const win = $c[0]!.ownerDocument.defaultView!;
      $c[0]!.dispatchEvent(new win.WheelEvent('wheel', { deltaY: -100, ctrlKey: true, clientX: 500, clientY: 400, bubbles: true, cancelable: true }));
    });
    zoomLabel().should(($el) => expect(parseInt($el.text(), 10)).to.be.greaterThan(100));
  });

  it('pans with the hand tool without moving shapes', () => {
    cy.drawShape('rect', [100, 100], [200, 200]);
    cy.pressKey('h');
    cy.get('[data-testid=canvas]').should('have.attr', 'data-tool', 'hand');
    cy.canvasDrag([500, 400], [560, 430]);
    cy.get('[data-testid=world]').should('have.attr', 'transform').and('contain', 'translate(60 30)');
    cy.pressKey('v');
    cy.get('[data-testid=layers-panel]').contains('Rectangle 1').click();
    cy.prop('x').should('have.value', '100');
  });

  it('draws in world coordinates when zoomed', () => {
    cy.get('[data-testid=zoom-level]').click();
    cy.get('[data-testid=zoom-in]').click(); // 200% around canvas center
    zoomLabel().should('have.text', '200%');
    cy.get('[data-testid=canvas]').then(($c) => {
      const { width, height } = $c[0]!.getBoundingClientRect();
      // Screen = world * 2 + (center - center * 2) => world = (screen + center) / 2
      const cx = width / 2;
      const cy0 = height / 2;
      const toScreen = (wx: number, wy: number): [number, number] => [wx * 2 - cx, wy * 2 - cy0];
      cy.drawShape('rect', toScreen(cx, cy0), toScreen(cx + 50, cy0 + 25));
      cy.prop('w').should('have.value', '50');
      cy.prop('h').should('have.value', '25');
    });
  });
});
