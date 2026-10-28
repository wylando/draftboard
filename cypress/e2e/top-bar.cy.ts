// A module, so its helpers don't clash with other specs' in the shared spec scope.
export {};

const centerY = (el: HTMLElement) => {
  const r = el.getBoundingClientRect();
  return r.top + r.height / 2;
};

describe('Top bar', () => {
  beforeEach(() => cy.visitEmpty());

  it('lines its controls up with the board tabs', () => {
    cy.get('[role=tab][aria-selected=true]').then(($tab) => {
      const row = centerY($tab[0]!);
      for (const id of ['app-menu', 'board-new', 'import-menu', 'export-menu', 'zoom-level']) {
        // Within a pixel: layout lands on sub-pixel positions that differ between platforms.
        cy.get(`[data-testid=${id}]`).should(($el) => expect(centerY($el[0]!)).to.be.closeTo(row, 1));
      }
    });
  });

  it('keeps Settings and Getting started in the app menu, with a hairline divider', () => {
    cy.get('[data-testid=app-menu]').click();
    cy.get('[data-testid=open-guide]').should('be.visible');
    cy.get('[data-testid=open-settings]').should('be.visible');
    // A 1px hairline in the border colour: the browser's own <hr> border once drew a heavy dark rule here.
    cy.get('[role=menu] [data-part=separator]').first().should(($hr) => {
      const style = getComputedStyle($hr[0]!);
      expect(style.borderTopStyle).to.equal('none');
      expect(style.height).to.equal('1px');
      expect(style.backgroundColor).to.equal('rgb(230, 230, 230)');
    });
    cy.get('[data-testid=open-settings]').click();
    cy.get('[data-testid=settings-page]').should('be.visible');
  });

  it('zooms from the zoom menu, which shows each shortcut', () => {
    cy.get('[data-testid=zoom-level]').should('have.text', '100%').click();
    cy.get('[data-testid=zoom-in] [data-binding="Mod+="]').should('exist');
    cy.get('[data-testid=zoom-in]').click();
    cy.get('[data-testid=zoom-level]').should('have.text', '200%');
    cy.zoomMenu('zoom-100');
    cy.get('[data-testid=zoom-level]').should('have.text', '100%');
    cy.zoomMenu('zoom-out');
    cy.get('[data-testid=zoom-level]').should('have.text', '50%');

    cy.drawShape('rect', [300, 300], [500, 400]);
    cy.zoomMenu('zoom-fit');
    cy.get('[data-testid=zoom-level]').should('not.have.text', '50%');
  });

  // The tabs' room mustn't shift with each zoom step.
  it('keeps the zoom button one width at any zoom', () => {
    cy.get('[data-testid=zoom-level]').invoke('outerWidth').then((width) => {
      for (let i = 0; i < 8; i++) cy.zoomMenu('zoom-in');
      cy.get('[data-testid=zoom-level]').should('have.text', '25600%').invoke('outerWidth').should('equal', width);
      for (let i = 0; i < 12; i++) cy.zoomMenu('zoom-out');
      cy.get('[data-testid=zoom-level]').should('have.text', '6%').invoke('outerWidth').should('equal', width);
    });
  });

  it('lets Space choose a menu item without arming canvas panning', () => {
    cy.get('[data-testid=zoom-level]').click();
    // No keyup follows: a canvas that took the keydown would stay in pan mode.
    // Ark keeps focus on the menu itself and only highlights items, so that's where keys land.
    cy.get('[role=menu]').should('have.focus').trigger('keydown', { key: ' ', code: 'Space' });
    cy.get('body').type('{esc}');
    cy.get('[data-testid=zoom-in]').should('not.exist');
    cy.get('[data-testid=canvas]').should('not.have.css', 'cursor', 'grab');
  });
});
