// A module, so its helpers don't clash with other specs' in the shared spec scope.
export {};

const CARD = '[data-testid=empty-state]';
const TABLES = '[data-node-type=table]';

describe('First run: empty board', () => {
  beforeEach(() => cy.visitEmpty());

  it('shows a card on an empty board and lets drawing through around it', () => {
    cy.get(CARD).should('be.visible');
    cy.get(CARD).parent().should('have.css', 'pointer-events', 'none');
    cy.drawShape('rect', [100, 100], [200, 200]);
    cy.get(CARD).should('not.exist');
    cy.get('[data-testid=tool-dock]').should('be.visible');
  });

  it('adds a table at the view centre, selected, and returns when it is undone', () => {
    cy.get('[data-testid=empty-add-table]').click();
    cy.get(CARD).should('not.exist');
    cy.get(TABLES).should('have.length', 1);
    cy.get('[data-testid=prop-name]').should('have.value', 'Table 1');
    cy.get('[data-testid=canvas]').then(($c) => {
      const box = $c[0]!.getBoundingClientRect();
      cy.get(TABLES).first().should(($t) => {
        const r = $t[0]!.getBoundingClientRect();
        expect(r.left + r.width / 2).to.be.closeTo(box.left + box.width / 2, 2);
        expect(r.top + r.height / 2).to.be.closeTo(box.top + box.height / 2, 2);
      });
    });
    cy.pressKey('z', { code: 'KeyZ', metaKey: true });
    cy.get(TABLES).should('not.exist');
    cy.get(CARD).should('be.visible');
  });

  it('adds a sample schema as one undo step', () => {
    cy.get('[data-testid=empty-example]').click();
    cy.get(CARD).should('not.exist');
    cy.get(TABLES).should('have.length', 4);
    cy.get('[data-node-type=connector]').should('have.length', 3);
    // The view is fitted to the new tables.
    cy.get('[data-testid=canvas]').then(($c) => {
      const box = $c[0]!.getBoundingClientRect();
      cy.get(TABLES).should(($tables) => {
        for (const t of $tables.toArray()) {
          const r = t.getBoundingClientRect();
          expect(r.left).to.be.at.least(box.left - 1);
          expect(r.right).to.be.at.most(box.right + 1);
          expect(r.top).to.be.at.least(box.top - 1);
          expect(r.bottom).to.be.at.most(box.bottom + 1);
        }
      });
    });
    cy.pressKey('z', { code: 'KeyZ', metaKey: true });
    cy.get(TABLES).should('not.exist');
    cy.get(CARD).should('be.visible');
  });

  it('opens the schema import dialog', () => {
    cy.get('[data-testid=empty-import-schema]').click();
    cy.get('[data-testid=schema-source]').should('be.visible');
  });

  it('opens a board file, and comes back when the board is emptied', () => {
    const doc = JSON.stringify({ version: 1, nodes: [] });
    cy.get('[data-testid=import-file]').then(($input) => cy.stub($input[0]!, 'click').as('pick'));
    cy.get('[data-testid=empty-open-file]').click();
    cy.get('@pick').should('have.been.calledOnce');
    cy.get('[data-testid=import-file]').selectFile({ contents: Cypress.Buffer.from(doc), fileName: 'b.json' }, { force: true });
    cy.get(CARD).should('be.visible');
    cy.drawShape('rect', [100, 100], [200, 200]);
    cy.get(CARD).should('not.exist');
    cy.pressKey('Backspace');
    cy.get(CARD).should('be.visible');
  });

  it('links to Getting started', () => {
    cy.get('[data-testid=empty-guide]').click();
    cy.get('[data-testid=getting-started-section]').should('be.visible');
  });
});

describe('First run: Getting started entry points', () => {
  beforeEach(() => cy.visitEmpty());

  it('opens from the logo menu, which keeps Settings beside it', () => {
    cy.get('[data-testid=app-menu]').click();
    cy.get('[data-testid=open-settings]').should('be.visible');
    cy.get('[data-testid=import-schema]').should('not.exist');
    cy.get('[data-testid=open-guide] [data-binding="Shift+/"]').should('exist');
    cy.get('[data-testid=open-guide]').click();
    cy.get('[data-testid=getting-started-section]').should('be.visible');
    cy.url().should('include', '#/settings/getting-started');
  });

  it('opens from the ? key but not while typing', () => {
    cy.get('[data-testid=empty-add-table]').click();
    cy.get('[data-testid=prop-name]').focus();
    cy.pressKey('?', { code: 'Slash', shiftKey: true });
    cy.get('[data-testid=settings-page]').should('not.exist');
    cy.get('[data-testid=prop-name]').blur();
    cy.pressKey('?', { code: 'Slash', shiftKey: true });
    cy.get('[data-testid=getting-started-section]').should('be.visible');
  });

  it('opens from ? on a layout where it is typed with another key', () => {
    cy.pressKey('?', { code: 'Minus', shiftKey: true });
    cy.get('[data-testid=getting-started-section]').should('be.visible');
  });

  it('deep-links to a section and defaults to shortcuts', () => {
    cy.visit('/#/settings/getting-started');
    cy.get('[data-testid=getting-started-section]').should('be.visible');
    cy.visit('/#/settings');
    cy.get('[data-testid=shortcuts-section]').should('be.visible');
  });

  it('walks through a first schema with real renderings', () => {
    cy.visit('/#/settings/getting-started');
    cy.get('[data-testid=guide-first-schema] li').should('have.length', 5);
    cy.get('[data-testid=guide-step-number]').should(($n) => expect($n.toArray().map((e) => e.textContent)).to.deep.equal(['1', '2', '3', '4', '5']));
    cy.get('[data-testid=guide-step-number]').first().should('be.visible');
    cy.get('[data-testid=guide-first-schema] svg [data-node-type=table]').should('exist');
    cy.get('[data-testid=guide-screen]').should('contain', 'Import').and('contain', 'Tool dock');
  });
});

describe('First run: Import and Export menus', () => {
  beforeEach(() => cy.visitEmpty());

  it('sit in the top bar and open their dialogs and pickers', () => {
    cy.get('[data-testid=import-menu]').click();
    cy.get('[data-testid=import-schema]').click();
    cy.get('[data-testid=schema-source]').should('be.visible');
    cy.get('[data-testid=dialog]').type('{esc}');
    cy.get('[data-testid=dialog]').should('not.exist');

    cy.get('[data-testid=export-menu]').click();
    cy.get('[data-testid=export-schema]').click();
    cy.get('[data-testid=export-scope]').should('be.visible');
    cy.get('[data-testid=dialog]').type('{esc}');

    cy.get('[data-testid=import-file]').then(($input) => cy.stub($input[0]!, 'click').as('pick'));
    cy.get('[data-testid=import-menu]').click();
    cy.get('[data-testid=import-board]').click();
    cy.get('@pick').should('have.been.calledOnce');
  });

  it('shows a shortcut hint once a command is bound, and runs it', () => {
    cy.get('[data-testid=import-menu]').click();
    cy.get('[data-testid=import-schema] [data-binding]').should('not.exist');
    cy.get('body').type('{esc}');
    cy.window().then((win) => {
      win.localStorage.setItem('draftboard:keybindings:v1', JSON.stringify({ 'file.importSchema': ['Alt+I'] }));
    });
    cy.reload();
    cy.get('[data-testid=import-menu]').click();
    cy.get('[data-testid=import-schema] [data-binding="Alt+I"]').should('exist');
    cy.get('body').type('{esc}');
    cy.pressKey('i', { code: 'KeyI', altKey: true });
    cy.get('[data-testid=schema-source]').should('be.visible');
  });

  for (const width of [700, 800, 1000]) {
    it(`keeps the first tab its width and Import/Export inside the bar at ${width}px`, () => {
      cy.get('[role=tab]').first().invoke('outerWidth').then((natural) => {
        cy.viewport(width, 600);
        cy.get('[role=tab]').first().invoke('outerWidth').should('equal', natural);
        cy.get('[data-testid=toolbar]').should(($bar) => {
          const bar = $bar[0]!;
          expect(bar.scrollWidth).to.be.at.most(bar.clientWidth);
          const right = bar.getBoundingClientRect().right;
          for (const id of ['import-menu', 'export-menu', 'zoom-level']) {
            expect(Cypress.$(`[data-testid=${id}]`)[0]!.getBoundingClientRect().right).to.be.at.most(right);
          }
        });
      });
    });
  }

  it('collapse to icons on a narrow window but keep their names', () => {
    cy.viewport(700, 600);
    for (const kind of ['import', 'export']) {
      cy.get(`[data-testid=${kind}-menu-label]`).should('not.be.visible');
      cy.get(`[data-testid=${kind}-menu]`).should('have.attr', 'aria-label').and('match', /^(Import|Export)$/);
    }
  });
});
