const NODES = '[data-node-type=table], [data-node-type=connector]';
const FIXTURE = 'schema/postgres.sql';

const previewFixture = () => {
  cy.get('[data-testid=import-schema]').click();
  cy.get('[data-testid=schema-source]').should('be.visible');
  cy.fixture(FIXTURE).then((sql: string) => {
    // `delay: 0` because the default per-key delay makes a whole schema slow.
    cy.get('[data-testid=schema-source]').type(sql, { delay: 0, parseSpecialCharSequences: false });
  });
  cy.contains('button', 'Preview').click();
  cy.get('[data-testid=import-summary]').should('be.visible');
};

describe('Schema import from SQL', () => {
  beforeEach(() => cy.visitEmpty());

  it('previews, adds tables and relationships, and undoes in one step', () => {
    cy.get('[data-testid=import-schema]').click();
    cy.contains('button', 'Preview').should('be.disabled');
    cy.get('[data-testid=dialog]').type('{esc}');

    previewFixture();
    cy.get('[data-testid=import-summary]').should('contain', 'PostgreSQL').and('contain', '3 tables').and('contain', '3 relationships');
    cy.get('[data-testid=import-add]').should('have.focus');
    cy.fixture(FIXTURE).then((sql: string) => {
      const line = sql.split('\n').findIndex((l) => l.startsWith('CREATE VIEW')) + 1;
      cy.get('[data-testid=import-skipped]').should('contain', `Line ${line}: Skipped CREATE VIEW`);
    });
    cy.get('[data-testid=import-problems]').should('not.exist');

    // Back keeps the pasted text.
    cy.contains('button', 'Back').click();
    cy.get('[data-testid=schema-source]').should('contain.value', 'CREATE TABLE users');
    cy.contains('button', 'Preview').click();

    cy.get('[data-testid=import-add]').click();
    cy.get('[data-testid=dialog]').should('not.exist');
    cy.get('[data-node-type=table]').should('have.length', 3);
    cy.get('[data-node-type=connector]').should('have.length', 3);

    cy.pressKey('z', { metaKey: true });
    cy.get(NODES).should('not.exist');
  });

  it('reopens with an empty source after dismissing a preview', () => {
    previewFixture();
    cy.get('[data-testid=dialog]').type('{esc}');
    cy.get('[data-testid=dialog]').should('not.exist');
    cy.get('[data-testid=import-schema]').click();
    cy.get('[data-testid=schema-source]').should('have.value', '');
  });

  it('lists a renamed table under Problems and still adds it', () => {
    previewFixture();
    cy.get('[data-testid=import-add]').click();
    cy.get('[data-node-type=table]').should('have.length', 3);

    previewFixture();
    cy.get('[data-testid=import-problems]').should('contain', '"users" already exists; imported as "users 2"');
    cy.get('[data-testid=import-add]').click();
    cy.get('[data-node-type=table]').should('have.length', 6);
  });

  it('replaces the document after confirming, and clears history', () => {
    cy.drawShape('rect', [100, 100], [200, 200]);
    cy.get('[data-node-type=rect]').should('have.length', 1);
    previewFixture();

    // Cancelling the confirm leaves the preview and the canvas as they were.
    cy.get('[data-testid=import-replace]').click();
    cy.get('[role=alertdialog]').should('contain', 'Replace the current design?');
    cy.get('[data-testid=dialog-cancel]').click();
    cy.get('[role=alertdialog]').should('not.exist');
    cy.get('[data-testid=import-replace]').should('be.visible');
    cy.get('[data-node-type=rect]').should('have.length', 1);

    cy.get('[data-testid=import-replace]').click();
    cy.get('[data-testid=dialog-confirm]').click();
    cy.get('[data-testid=dialog]').should('not.exist');
    cy.get('[data-node-type=table]').should('have.length', 3);
    cy.get('[data-node-type=connector]').should('have.length', 3);
    cy.get('[data-node-type=rect]').should('not.exist');
    cy.contains('[data-testid^=node-]', 'users 2').should('not.exist');

    cy.get('[data-testid=undo]').should('be.disabled');
    cy.pressKey('z', { metaKey: true });
    cy.get('[data-node-type=rect]').should('not.exist');
    cy.get('[data-node-type=table]').should('have.length', 3);
  });

  it('replaces an empty canvas without asking', () => {
    previewFixture();
    cy.get('[data-testid=import-replace]').click();
    cy.get('[data-testid=dialog]').should('not.exist');
    cy.get('[role=alertdialog]').should('not.exist');
    cy.get('[data-node-type=table]').should('have.length', 3);
  });

  it('says so when the text has no tables', () => {
    cy.get('[data-testid=import-schema]').click();
    cy.get('[data-testid=schema-source]').type('SELECT 1;');
    cy.contains('button', 'Preview').click();
    cy.get('[data-testid=import-summary]').should('be.visible');
    cy.contains('No tables found').should('be.visible');
    cy.contains('Check that the text contains CREATE TABLE statements.').should('be.visible');
    cy.get('[data-testid=import-add]').should('be.disabled');
    cy.get('[data-testid=import-replace]').should('be.disabled');
  });

  it('does not run canvas shortcuts while typing in the dialog', () => {
    cy.drawShape('rect', [100, 100], [200, 200]);
    cy.get('[data-node-type=rect]').should('have.length', 1);
    cy.get('[data-testid=import-schema]').click();
    cy.get('[data-testid=schema-source]').type('rrr{backspace}').should('have.value', 'rr');
    cy.get('[data-testid=canvas]').should('have.attr', 'data-tool', 'select');
    cy.get('[data-node-type=rect]').should('have.length', 1);
  });
});
