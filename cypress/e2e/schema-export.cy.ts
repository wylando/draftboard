// A module, so its helpers don't clash with other specs' in the shared spec scope.
export {};

const PREVIEW = '[data-testid=export-preview]';

// Three tables (users, posts, comments) and three foreign keys, via the importer.
const importFixture = () => {
  cy.get('[data-testid=import-menu]').click();
  cy.get('[data-testid=import-schema]').click();
  cy.fixture('schema/postgres.sql').then((sql: string) => {
    cy.get('[data-testid=schema-source]').type(sql, { delay: 0, parseSpecialCharSequences: false });
  });
  cy.contains('button', 'Preview').click();
  cy.get('[data-testid=import-submit]').click();
  cy.get('[data-node-type=table]').should('have.length', 3);
};

describe('Schema export', () => {
  beforeEach(() => cy.visitEmpty());

  it('previews SQL for the selected tables, or the whole board, and switches to DBML', () => {
    importFixture();
    // The import leaves nothing selected; select just users by its layer row.
    cy.contains('[data-testid=layers-panel] [role=treeitem]', 'users').click();
    cy.get('[data-testid=export-menu]').click();
    cy.get('[data-testid=export-schema]').click();
    cy.get('[data-testid=export-scope] [data-value=selection]').should('contain', 'Selection (1 table)').and('have.attr', 'data-state', 'on');
    cy.get('[data-testid=export-scope] [data-value=board]').should('contain', 'Whole board (3 tables)');
    cy.get(PREVIEW).should('contain.value', 'CREATE TABLE "users"').and('not.contain.value', '"posts"');
    // The scope control switches the output without touching the selection.
    cy.get('[data-testid=export-scope] [data-value=board]').click();
    cy.get(PREVIEW).should('contain.value', 'CREATE TABLE "posts"');
    cy.get('[data-testid=export-scope] [data-value=selection]').click();
    cy.get(PREVIEW).should('not.contain.value', '"posts"');
    cy.get('[data-testid=dialog]').type('{esc}');
    cy.get('[data-testid=dialog]').should('not.exist');

    cy.pressKey('Escape');
    cy.get('[data-testid=selection-overlay] [data-handle]').should('not.exist');
    cy.get('[data-testid=export-menu]').click();
    cy.get('[data-testid=export-schema]').click();
    cy.get('[data-testid=export-scope]').should('contain', '3 tables on this board');
    cy.get('[data-testid=export-scope] [data-value]').should('not.exist');
    cy.get(PREVIEW)
      .should('contain.value', 'CREATE TABLE "comments"')
      .and('contain.value', 'ALTER TABLE "posts" ADD FOREIGN KEY ("user_id") REFERENCES "users" ("id");');

    cy.get('[data-testid=export-dialect] [data-value=mysql]').click();
    cy.get(PREVIEW).should('contain.value', 'CREATE TABLE `users`');

    cy.get('[data-testid=export-format] [data-value=dbml]').click();
    cy.get('[data-testid=export-dialect]').should('not.exist');
    cy.get(PREVIEW).should('contain.value', 'Table users {').and('contain.value', 'Ref: posts.user_id > users.id');
  });

  it('names left-out relationships by their ends, above the preview, and can include the linked tables', () => {
    importFixture();
    cy.contains('[data-testid=layers-panel] [role=treeitem]', 'posts').click();
    cy.get('[data-testid=export-menu]').click();
    cy.get('[data-testid=export-schema]').click();
    cy.get('[data-testid=export-notice]').should('contain', 'relationships left out').and('contain', 'posts.user_id → users.id');
    cy.get('[data-testid=export-notice]').should('not.contain', 'Connector');
    // Above the preview in the document.
    cy.get('[data-testid=export-notice]').then(($n) => {
      cy.get(PREVIEW).then(($p) => expect($n[0]!.getBoundingClientRect().bottom).to.be.lte($p[0]!.getBoundingClientRect().top));
    });
    cy.get('[data-testid=export-include-linked]').click();
    cy.get('[data-testid=export-scope] [data-value=selection]').should('contain', 'Selection (3 tables)');
    cy.get(PREVIEW).should('contain.value', 'CREATE TABLE "users"').and('contain.value', 'CREATE TABLE "comments"');
    cy.get('[data-testid=export-notice]').should('not.exist');
  });

  it('wraps long preview lines instead of clipping them', () => {
    importFixture();
    cy.get('[data-testid=export-menu]').click();
    cy.get('[data-testid=export-schema]').click();
    cy.get(PREVIEW).should('have.css', 'white-space', 'pre-wrap');
  });

  it('copies the preview and downloads it as a file named after the board', () => {
    importFixture();
    cy.get('[data-testid=export-menu]').click();
    cy.get('[data-testid=export-schema]').click();
    cy.window().then((win) => cy.stub(win.navigator.clipboard, 'writeText').as('copy').resolves());
    cy.get('[data-testid=export-copy]').click();
    cy.get(PREVIEW)
      .invoke('val')
      .then((text) => cy.get('@copy').should('have.been.calledOnceWith', text));
    cy.get('[data-testid=export-status]').should('contain', 'Copied');

    // A file left by an earlier run would satisfy readFile before the new download lands.
    cy.exec('rm -f cypress/downloads/board_1.dbml');
    cy.get('[data-testid=export-format] [data-value=dbml]').click();
    cy.get('[data-testid=export-download]').click();
    cy.readFile('cypress/downloads/board_1.dbml').should('contain', 'Ref: comments.post_id > posts.id');
  });

  it('says there is nothing to export on a board without tables', () => {
    cy.get('[data-testid=export-menu]').click();
    cy.get('[data-testid=export-schema]').click();
    cy.get('[data-testid=export-scope]').should('contain', 'No tables to export');
    cy.get('[data-testid=export-copy]').should('be.disabled');
    cy.get('[data-testid=export-download]').should('be.disabled');
  });
});
