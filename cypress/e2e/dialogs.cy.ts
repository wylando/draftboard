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

  it('exports the board as JSON, named after the board', () => {
    cy.drawShape('rect', [100, 100], [200, 200]);
    // A file left by an earlier run would satisfy readFile before the new download lands.
    cy.exec("rm -f 'cypress/downloads/Board 1.draftboard.json'");
    cy.get('[data-testid=export-menu]').click();
    cy.get('[data-testid=export-board]').click();
    cy.readFile('cypress/downloads/Board 1.draftboard.json').its('nodes').should('have.length', 1);
  });
});
