// A module, so its helpers don't clash with other specs' in the shared spec scope.
export {};

import { createConnector } from '../../src/editor/model/connector';
import { createNode } from '../../src/editor/model/nodes';
import { createColumn } from '../../src/editor/model/table';
import type { DesignNode, TableNode } from '../../src/editor/model/types';
import { seedWorkspace } from '../support/workspace';

const PREVIEW = '[data-testid=export-preview]';

type Col = [name: string, dataType: string, primaryKey?: boolean];
const COLUMNS = {
  users: [['id', 'uuid', true], ['email', 'text']],
  posts: [['id', 'uuid', true], ['user_id', 'uuid'], ['title', 'text']],
  comments: [['id', 'uuid', true], ['post_id', 'uuid'], ['user_id', 'uuid'], ['body', 'text']],
} satisfies Record<string, Col[]>;

// Seeds saved tables and foreign keys ([table, column, referenced table]) instead of importing them,
// so only the export dialog is under test.
function visitWithTables(tables: Record<string, Col[]>, foreignKeys: [string, string, string][]) {
  const nodes: DesignNode[] = Object.entries(tables).map(([name, columns], i) => {
    const t = createNode('table', { x: 100 + i * 300, y: 100, width: 240, height: 0 }, []) as TableNode;
    return { ...t, name, columns: columns.map(([n, type, pk]) => createColumn(n, type, pk)) };
  });
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const table = (name: string) => nodes.find((n): n is TableNode => n.type === 'table' && n.name === name)!;
  const column = (t: TableNode, name: string) => ({ kind: 'column' as const, tableId: t.id, columnId: t.columns.find((c) => c.name === name)!.id });
  for (const [from, col, to] of foreignKeys) {
    const target = table(to);
    nodes.push(createConnector(column(table(from), col), column(target, target.columns[0]!.name), `${from}.${col} to ${to}`, byId));
  }
  seedWorkspace(nodes);
  cy.get('[data-node-type=table]').should('have.length', Object.keys(tables).length);
}

const visitFixture = () =>
  visitWithTables(COLUMNS, [['posts', 'user_id', 'users'], ['comments', 'post_id', 'posts'], ['comments', 'user_id', 'users']]);

describe('Schema export', () => {
  it('previews SQL for the selected tables, or the whole board, and switches to DBML', () => {
    visitFixture();
    // Nothing is selected on load; select just users by its layer row.
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
    visitFixture();
    cy.contains('[data-testid=layers-panel] [role=treeitem]', 'posts').click();
    cy.get('[data-testid=export-menu]').click();
    cy.get('[data-testid=export-schema]').click();
    cy.get('[data-testid=export-notice]').should('contain', 'relationships left out').and('contain', 'posts.user_id → users.id');
    cy.get('[data-testid=export-notice]').should('not.contain', 'Connector');
    // Above the preview in the document.
    cy.get(PREVIEW).should(($p) => {
      const notice = $p[0]!.ownerDocument.querySelector('[data-testid=export-notice]')!;
      expect(notice.getBoundingClientRect().bottom).to.be.lte($p[0]!.getBoundingClientRect().top);
    });
    cy.get('[data-testid=export-include-linked]').click();
    cy.get('[data-testid=export-scope] [data-value=selection]').should('contain', 'Selection (3 tables)');
    cy.get(PREVIEW).should('contain.value', 'CREATE TABLE "users"').and('contain.value', 'CREATE TABLE "comments"');
    cy.get('[data-testid=export-notice]').should('not.exist');
  });

  it('wraps long preview lines instead of clipping them', () => {
    visitFixture();
    cy.get('[data-testid=export-menu]').click();
    cy.get('[data-testid=export-schema]').click();
    cy.get(PREVIEW).should('have.css', 'white-space', 'pre-wrap');
  });

  it('keeps a left-out relationship with a long unbroken name inside the dialog', () => {
    const name = 'GlSourceSyncIntegrityVerificationAuditHistoryRecordsArchive';
    visitWithTables({ users: COLUMNS.users, [name]: [['id', 'uuid', true], [`${name}Id`, 'uuid']] }, [[name, `${name}Id`, 'users']]);
    cy.contains('[data-testid=layers-panel] [role=treeitem]', name).click();
    cy.get('[data-testid=export-menu]').click();
    cy.get('[data-testid=export-schema]').click();
    cy.get('[data-testid=dialog-body]').then(($body) => {
      const right = $body[0]!.getBoundingClientRect().right;
      for (const q of ['[data-testid=export-notice]', PREVIEW]) {
        cy.get(q).should(($el) => expect($el[0]!.getBoundingClientRect().right).to.be.lte(right));
      }
    });
  });

  it('copies the preview and downloads it as a file named after the board', () => {
    visitFixture();
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
    cy.visitEmpty();
    cy.get('[data-testid=export-menu]').click();
    cy.get('[data-testid=export-schema]').click();
    cy.get('[data-testid=export-scope]').should('contain', 'No tables to export');
    cy.get('[data-testid=export-copy]').should('be.disabled');
    cy.get('[data-testid=export-download]').should('be.disabled');
  });
});
