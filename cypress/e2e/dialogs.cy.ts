const importFile = (contents: string) =>
  cy.get('[data-testid=import-file]').selectFile({ contents: Cypress.Buffer.from(contents), fileName: 'design.json' }, { force: true });

const EMPTY_DOCUMENT = JSON.stringify({ version: 1, nodes: [] });

describe('Dialogs', () => {
  beforeEach(() => cy.visitEmpty());

  it('explains a rejected import in a dialog instead of a browser alert', () => {
    cy.on('window:alert', () => {
      throw new Error('window.alert should not be used');
    });
    importFile('not json');
    cy.get('[role=alertdialog]').should('be.visible').and('contain', 'not a valid Draftboard document');
    cy.get('[data-testid=dialog-confirm]').click();
    cy.get('[role=alertdialog]').should('not.exist');
  });

  it('asks before an import replaces the current design', () => {
    cy.drawShape('rect', [100, 100], [200, 200]);
    importFile(EMPTY_DOCUMENT);
    cy.get('[role=alertdialog]').should('contain', 'Replace');
    cy.get('[data-testid=dialog-cancel]').click();
    cy.get('[role=alertdialog]').should('not.exist');
    cy.get('[data-node-type=rect]').should('have.length', 1);

    importFile(EMPTY_DOCUMENT);
    cy.get('[data-testid=dialog-confirm]').click();
    cy.get('[data-node-type=rect]').should('not.exist');
  });

  it('imports into an empty design without asking', () => {
    importFile(EMPTY_DOCUMENT);
    // Draw afterwards: if a dialog had opened, its backdrop would block the toolbar.
    cy.drawShape('rect', [100, 100], [200, 200]);
    cy.get('[role=alertdialog]').should('not.exist');
  });

  it('keeps editor shortcuts from acting behind an open dialog', () => {
    cy.drawShape('rect', [100, 100], [200, 200]);
    importFile(EMPTY_DOCUMENT);
    cy.get('[role=alertdialog]').should('be.visible');

    cy.pressKey('Backspace');
    cy.pressKey('z', { code: 'KeyZ', metaKey: true });
    // Space must still press the focused button: Space-to-pan mustn't cancel the keydown.
    cy.focused().then(($button) => {
      const button = $button[0]!;
      const event = new button.ownerDocument.defaultView!.KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true });
      expect(button.dispatchEvent(event), 'Space keydown not prevented').to.equal(true);
    });
    cy.focused().type('{esc}');
    cy.get('[role=alertdialog]').should('not.exist');

    // Escape closed only the dialog: the rectangle is still there and still selected.
    cy.get('[data-node-type=rect]').should('have.length', 1);
    cy.prop('name').should('have.value', 'Rectangle 1');
  });
});
