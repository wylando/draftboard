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
      for (const id of ['app-menu', 'board-new', 'zoom-level']) {
        // Within a pixel: layout lands on sub-pixel positions that differ between platforms.
        cy.get(`[data-testid=${id}]`).should(($el) => expect(centerY($el[0]!)).to.be.closeTo(row, 1));
      }
    });
  });

  it('keeps file actions and Settings in the app menu', () => {
    cy.get('[data-testid=app-menu]').click();
    for (const id of ['import-board', 'export-board', 'import-schema', 'export-schema']) {
      cy.get(`[data-testid=${id}]`).should('be.visible');
    }
    cy.get('[data-testid=open-settings]').click();
    cy.get('[data-testid=settings-page]').should('be.visible');
  });

  it('zooms from the zoom menu, which shows each shortcut', () => {
    cy.get('[data-testid=zoom-level]').should('have.text', '100%').click();
    cy.get('[data-testid=zoom-in] [data-binding="Mod+="]').should('exist');
    cy.get('[data-testid=zoom-in]').click();
    cy.get('[data-testid=zoom-level]').should('have.text', '200%');
    cy.get('[data-testid=zoom-level]').click();
    cy.get('[data-testid=zoom-100]').click();
    cy.get('[data-testid=zoom-level]').should('have.text', '100%');
    cy.get('[data-testid=zoom-level]').click();
    cy.get('[data-testid=zoom-out]').click();
    cy.get('[data-testid=zoom-level]').should('have.text', '50%');
  });
});
