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

  it('is a light surface in the default theme, and the page opts in to light and dark native controls', () => {
    // Relative luminance of a computed `rgb(r, g, b)` background, WCAG weights.
    const luminance = (rgb: string) => {
      const [r, g, b] = (rgb.match(/\d+/g) ?? []).slice(0, 3).map((c) => {
        const v = Number(c) / 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      }) as [number, number, number];
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    cy.get('[data-testid=toolbar]').should(($bar) => {
      expect(luminance(getComputedStyle($bar[0]!).backgroundColor), 'top bar luminance').to.be.greaterThan(0.8);
    });
    cy.document().its('documentElement').should('have.css', 'color-scheme', 'light dark');
    cy.get('meta[name=color-scheme]').should('have.attr', 'content', 'light dark');
  });

  it('follows the OS dark preference with a dark top bar', () => {
    cy.colorScheme('dark');
    cy.get('[data-testid=toolbar]').should(($bar) => {
      const [r] = (getComputedStyle($bar[0]!).backgroundColor.match(/\d+/g) ?? []).map(Number);
      expect(r, 'top bar red channel').to.be.lessThan(80);
    });
  });

  it('keeps file actions and Settings in the app menu', () => {
    cy.get('[data-testid=app-menu]').click();
    for (const id of ['import-board', 'export-board', 'import-schema', 'export-schema']) {
      cy.get(`[data-testid=${id}]`).should('be.visible');
    }
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
