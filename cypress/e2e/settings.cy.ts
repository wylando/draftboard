// Assertions use `data-binding` (canonical, e.g. "Mod+D"), never the rendered
// label, which is "⌘D" on macOS but "Ctrl+D" on Linux CI.
const row = (id: string) => cy.get(`[data-testid="shortcut-row-${id}"]`);
const chip = (id: string, binding: string) => row(id).find(`[data-binding="${binding}"]`);

const openSettings = () => {
  cy.get('[data-testid=open-settings]').click();
  cy.get('[data-testid=settings-page]').should('be.visible');
};

const record = (id: string, key: string, code: string, mods: { metaKey?: boolean; shiftKey?: boolean } = {}) => {
  cy.get(`[data-testid="record-${id}"]`).click();
  row(id).find('[data-testid=recording-hint]').should('be.visible');
  cy.pressKey(key, { code, ...mods });
};

describe('Settings: keyboard shortcuts', () => {
  beforeEach(() => {
    cy.visitEmpty();
    openSettings();
  });

  it('opens from the toolbar and returns to the canvas', () => {
    cy.url().should('include', '#/settings');
    cy.get('[data-testid=shortcuts-section]').should('be.visible');
    cy.get('[data-testid=close-settings]').click();
    cy.get('[data-testid=canvas]').should('be.visible');
    cy.url().should('not.include', '#/settings');
  });

  it('lists every category with default bindings', () => {
    for (const c of ['tools', 'edit', 'arrange', 'view', 'nudge', 'boards', 'app']) {
      cy.get(`[data-testid=category-${c}]`).should('exist');
    }
    chip('tool.rect', 'R').should('exist');
    chip('edit.redo', 'Mod+Shift+Z').should('exist');
    chip('edit.redo', 'Mod+Y').should('exist');
    chip('board.next', 'Alt+]').should('exist');
    row('app.openSettings').should('contain', 'Not assigned');
  });

  it('rebinds Rectangle from R to B and the canvas uses the new key', () => {
    record('tool.rect', 'b', 'KeyB');
    chip('tool.rect', 'B').should('exist');
    row('tool.rect').find('[data-binding="R"]').parent().find('[data-testid=remove-binding]').click();
    chip('tool.rect', 'R').should('not.exist');

    cy.get('[data-testid=close-settings]').click();
    cy.get('[data-testid=canvas]').should('be.visible');
    cy.pressKey('r', { code: 'KeyR' });
    // data-tool is already "select", so wait for a later update to render
    // first; otherwise this passes even if R still picks Rectangle.
    cy.get('[data-testid=zoom-in]').click();
    cy.get('[data-testid=zoom-level]').should('have.text', '200%');
    cy.get('[data-testid=canvas]').should('have.attr', 'data-tool', 'select');
    cy.pressKey('b', { code: 'KeyB' });
    cy.get('[data-testid=canvas]').should('have.attr', 'data-tool', 'rect');
  });

  it('keeps custom bindings after a reload', () => {
    record('edit.duplicate', 'j', 'KeyJ', { metaKey: true });
    chip('edit.duplicate', 'Mod+J').should('exist');
    cy.window().its('localStorage').invoke('getItem', 'draftboard:keybindings:v1').should('contain', 'Mod+J');

    cy.reload();
    cy.get('[data-testid=settings-page]').should('be.visible'); // hash route survives reload
    chip('edit.duplicate', 'Mod+J').should('exist');
    row('edit.duplicate').should('have.attr', 'data-customized', 'true');
  });

  it('asks before taking a key from another command, then moves it', () => {
    record('tool.rect', 'v', 'KeyV');
    cy.get('[data-testid=conflict-notice]').should('contain', 'Move');
    chip('tool.rect', 'V').should('not.exist');

    cy.get('[data-testid=confirm-replace]').click();
    chip('tool.rect', 'V').should('exist');
    chip('tool.select', 'V').should('not.exist');
    row('tool.select').should('contain', 'Not assigned');
  });

  it('cancelling a conflict changes nothing', () => {
    record('tool.rect', 'v', 'KeyV');
    cy.get('[data-testid=conflict-notice]').contains('Cancel').click();
    cy.get('[data-testid=conflict-notice]').should('not.exist');
    chip('tool.select', 'V').should('exist');
    chip('tool.rect', 'V').should('not.exist');
  });

  it('Escape cancels recording without changing bindings', () => {
    record('tool.rect', 'Escape', '');
    row('tool.rect').find('[data-testid=recording-hint]').should('not.exist');
    chip('tool.rect', 'R').should('exist');
    row('tool.rect').should('have.attr', 'data-customized', 'false');
  });

  it('rejects browser-reserved combinations', () => {
    record('tool.rect', 'w', 'KeyW', { metaKey: true });
    row('tool.rect').find('[data-testid=binding-error]').should('contain', 'reserved');
    chip('tool.rect', 'Mod+W').should('not.exist');
  });

  it('resets one command and all commands', () => {
    record('tool.rect', 'b', 'KeyB');
    record('tool.ellipse', 'e', 'KeyE');
    cy.get('[data-testid="reset-tool.rect"]').click();
    chip('tool.rect', 'B').should('not.exist');
    chip('tool.ellipse', 'E').should('exist');

    // Resetting everything can't be undone, so it asks first.
    cy.get('[data-testid=reset-all]').click();
    cy.get('[role=alertdialog]').should('contain', 'Reset all');
    cy.get('[data-testid=dialog-cancel]').click();
    chip('tool.ellipse', 'E').should('exist');

    cy.get('[data-testid=reset-all]').click();
    cy.get('[data-testid=dialog-confirm]').click();
    chip('tool.ellipse', 'E').should('not.exist');
    chip('tool.ellipse', 'O').should('exist');
    cy.get('[data-testid=reset-all]').should('be.disabled');
  });

  it('stops recording when Reset all asks for confirmation', () => {
    record('tool.rect', 'b', 'KeyB');
    cy.get('[data-testid="record-tool.ellipse"]').click();
    row('tool.ellipse').find('[data-testid=recording-hint]').should('be.visible');
    cy.get('[data-testid=reset-all]').click();
    cy.get('[role=alertdialog]').should('be.visible');
    row('tool.ellipse').find('[data-testid=recording-hint]').should('not.exist');
    // The keyboard reaches the dialog instead of being recorded as a binding.
    cy.focused().type('{esc}');
    cy.get('[role=alertdialog]').should('not.exist');
    chip('tool.rect', 'B').should('exist');
  });

  it('filters by command name', () => {
    cy.get('[data-testid=shortcut-search]').type('duplicate');
    row('edit.duplicate').should('exist');
    row('tool.rect').should('not.exist');
    cy.get('[data-testid=shortcut-search]').clear().type('zzzz');
    cy.get('[data-testid=no-results]').should('be.visible');
  });

  it('a newly bound Open settings shortcut works from the canvas', () => {
    record('app.openSettings', 'k', 'KeyK', { metaKey: true });
    chip('app.openSettings', 'Mod+K').should('exist');
    cy.get('[data-testid=close-settings]').click();
    cy.get('[data-testid=canvas]').should('be.visible');
    cy.pressKey('k', { code: 'KeyK', metaKey: true });
    cy.get('[data-testid=settings-page]').should('be.visible');
  });
});

describe('Settings: robustness', () => {
  it('falls back to defaults when saved bindings are corrupt', () => {
    cy.visit('/#/settings', {
      onBeforeLoad: (win) => {
        win.localStorage.clear();
        win.localStorage.setItem('draftboard:keybindings:v1', '{not json');
      },
    });
    chip('tool.rect', 'R').should('exist');
  });

  it('ignores unknown commands and invalid keys in saved bindings', () => {
    cy.visit('/#/settings', {
      onBeforeLoad: (win) => {
        win.localStorage.clear();
        win.localStorage.setItem(
          'draftboard:keybindings:v1',
          JSON.stringify({ 'tool.rect': ['B', 'not a key'], 'made.up': ['X'] }),
        );
      },
    });
    chip('tool.rect', 'B').should('exist');
    row('tool.rect').find('[data-binding]').should('have.length', 1);
  });

  it('keeps the document and undo history when visiting Settings', () => {
    cy.visitEmpty();
    cy.drawShape('rect', [100, 100], [200, 200]);
    openSettings();
    cy.get('[data-testid=close-settings]').click();
    cy.get('[data-node-type=rect]').should('have.length', 1);
    cy.get('[data-testid=undo]').should('not.be.disabled').click();
    cy.get('[data-node-type=rect]').should('not.exist');
  });

  it('editor shortcuts are inactive on the Settings page', () => {
    cy.visitEmpty();
    cy.drawShape('rect', [100, 100], [200, 200]);
    openSettings();
    cy.pressKey('Backspace');
    cy.get('[data-testid=close-settings]').click();
    cy.get('[data-node-type=rect]').should('have.length', 1);
  });
});

describe('Settings: getting started guide', () => {
  it('describes the screen, tools with current shortcuts, and options', () => {
    cy.visitEmpty();
    openSettings();
    cy.get('[data-testid=nav-guide]').click();
    cy.get('[data-testid=getting-started-section]').should('be.visible');
    cy.get('[data-testid=guide-screen]').should('contain', 'Layers').and('contain', 'Design panel');
    cy.get('[data-testid=guide-tools]').should('contain', 'Rectangle').find('kbd').should('have.length.at.least', 7);
    cy.get('[data-testid=guide-options]').should('contain', 'Stroke').and('contain', 'Layer opacity');
  });
});

describe('Settings: symbols', () => {
  it('draws each canvas symbol with the canvas renderer and explains it', () => {
    cy.visitEmpty();
    openSettings();
    cy.get('[data-testid=nav-symbols]').click();
    cy.get('[data-testid=symbols-section]').should('be.visible');
    for (const kind of ['one', 'zeroOrOne', 'many', 'oneOrMany']) {
      cy.get(`[data-testid=symbol-cardinality-${kind}] [data-testid=connector-marker][data-cardinality=${kind}] path`).should('exist');
    }
    // A 'none' end on a table still offers a (blank) marker to click.
    cy.get('[data-testid=symbol-cardinality-none] [data-testid=connector-marker][data-cardinality=none]').should('exist').find('path').should('not.exist');

    cy.get('[data-testid=symbol-end-attached] [data-testid=connector-end][data-attached=true]').should('exist');
    cy.get('[data-testid=symbol-end-loose] [data-testid=connector-end][data-attached=false]').should('exist');
    cy.get('[data-testid=symbol-end-broken] [data-testid=connector-line][data-broken=true]').should('exist');
    cy.get('[data-testid=symbol-warning] [data-testid=connector-warning]').should('exist');
    // The default highlight colour from the preferences.
    cy.get('[data-testid=symbol-highlight] [data-testid=related-connector]').should('have.attr', 'stroke', '#80caff');
    cy.get('[data-testid=symbol-highlight] [data-testid=related-table]').should('have.attr', 'stroke', '#80caff');

    cy.get('[data-testid=symbols-rows] [data-testid=column-badge]').should(($b) => {
      expect($b.toArray().map((e) => e.textContent)).to.include.members(['PK', 'UQ', 'FK', 'PFK', 'UFK']);
    });
    cy.get('[data-testid=symbols-rows] [data-testid=column-index]').should('exist');
    cy.get('[data-testid=symbols-rows] [data-testid=column-type]').should('contain', 'text?');
    // The badges exist even when clipped away, so check the last row is inside the drawing.
    cy.get('[data-testid=symbols-rows] svg').should(($svg) => {
      const rows = $svg.find('[data-testid=table-column]');
      expect(rows).to.have.length(6);
      expect(rows[5]!.getBoundingClientRect().bottom).to.be.at.most($svg[0]!.getBoundingClientRect().bottom);
    });

    cy.get('[data-testid=symbols-routes]').should('contain', 'index lookup').and('contain', 'scan').and('contain', 'Guaranteed route');
  });
});
