// A module, so its helpers don't clash with other specs' in the shared spec scope.
export {};

import { savedNodes } from '../support/workspace';
import { placeTable, undo } from '../support/canvas';

const connect = (from: [number, number], to: [number, number]) => {
  cy.pressKey('c', { code: 'KeyC' });
  cy.get('[data-testid=canvas]').should('have.attr', 'data-tool', 'connector');
  cy.canvasDrag(from, to);
  cy.get('[data-testid=canvas]').should('have.attr', 'data-tool', 'select');
};

const marker = (end: 'from' | 'to') => cy.get(`[data-testid=connector-marker][data-cardinality-end=${end}]`);
const badge = (table: number, row: number) =>
  cy.get('[data-node-type=table]').eq(table).find('[data-testid=table-column]').eq(row).find('[data-testid=column-badge]');

// Table 1 at (100, 100): `id` row centred at y 150, right edge x 340.
// Table 2 at (500, 300): `id` row at y 350, then `column_1` (added below) at y 378; left edge x 500.
const tablesWithColumn = () => {
  placeTable([100, 100]);
  placeTable([500, 300]);
  cy.get('[data-testid=add-column]').click();
  cy.get('[data-node-type=table]').eq(1).find('[data-testid=table-column]').should('have.length', 2);
};

describe('Relationships', () => {
  beforeEach(() => cy.visitEmpty());

  it('a column-to-column link is a many-to-one foreign key, warns when the types differ, can be made visual only, and shows PFK until its table is gone', () => {
    tablesWithColumn();
    connect([550, 378], [150, 150]);
    marker('from').should('have.attr', 'data-cardinality', 'many');
    marker('to').should('have.attr', 'data-cardinality', 'one');
    badge(1, 1).should('have.text', 'FK');
    // column_1 is text, Table 1's id is uuid: the amber dot sits on column_1's row, not on the line.
    cy.get('[data-testid=connector-warning]').should('not.exist');
    cy.get('[data-node-type=table]').eq(1).find('[data-testid=table-column]').eq(1).find('[data-testid=type-mismatch]')
      .should('have.attr', 'aria-label', 'Types differ: text → uuid')
      .find('title').should('have.text', 'Types differ: text → uuid');
    cy.get('[data-testid=type-mismatch]').should('have.length', 1);

    // Selected by its vertical run; the Design panel names the two types.
    cy.canvasClick([420, 300]);
    cy.prop('name').should('have.value', 'Connector 1');
    cy.get('[data-testid=connector-type-warning]').should('contain', 'text').and('contain', 'uuid');
    // Visual only: no badge, no warning.
    cy.get('[data-testid=connector-fk]').should('have.attr', 'data-state', 'checked').click();
    cy.get('[data-testid=connector-fk]').should('have.attr', 'data-state', 'unchecked');
    badge(1, 1).should('not.exist');
    cy.get('[data-testid=type-mismatch]').should('not.exist');
    undo();
    badge(1, 1).should('have.text', 'FK');

    // Matching types clear the warning.
    cy.canvasClick([550, 318]);
    cy.get('[data-testid=column-row]').eq(1).click();
    cy.get('[data-testid=column-editor] [data-testid=column-type]').clear().type('uuid{enter}');
    cy.get('[data-testid=type-mismatch]').should('not.exist');
    badge(1, 1).should('have.text', 'FK');

    // A unique foreign key shows both.
    cy.get('[data-testid=column-editor] [data-testid=column-unique]').click();
    badge(1, 1).should('have.text', 'UFK');

    // A primary key that is also a foreign key shows both, until the table it points at is gone.
    connect([550, 350], [150, 150]);
    badge(1, 0).should('have.text', 'PFK');
    cy.canvasClick([200, 118]);
    cy.prop('name').should('have.value', 'Table 1');
    cy.pressKey('Backspace');
    cy.get('[data-node-type=table]').should('have.length', 1);
    badge(0, 0).should('have.text', 'PK');
  });

  it('a table-to-table link is one-to-many, and clicking a marker cycles it, allowing many-to-many between tables', () => {
    placeTable([100, 100]);
    placeTable([500, 300]);
    // Header to header: from Table 2's top at (620, 300) to Table 1's bottom at (220, 164).
    connect([550, 318], [200, 118]);
    marker('from').should('have.attr', 'data-cardinality', 'one');
    marker('to').should('have.attr', 'data-cardinality', 'many');
    cy.get('[data-node-type=table] [data-testid=column-badge]').should(($b) => {
      expect($b.toArray().map((b) => b.textContent)).to.deep.equal(['PK', 'PK']);
    });
    // A step in from Table 2's end: one → zero-or-one → many, so both ends are many.
    cy.canvasClick([620, 290]);
    marker('from').should('have.attr', 'data-cardinality', 'zeroOrOne');
    cy.canvasClick([620, 290]);
    marker('from').should('have.attr', 'data-cardinality', 'many');
    marker('to').should('have.attr', 'data-cardinality', 'many');
    // Each click was one undo step.
    undo();
    marker('from').should('have.attr', 'data-cardinality', 'zeroOrOne');
  });

  it('never makes column-to-column links many-to-many, and keeps cardinality across a reload', () => {
    tablesWithColumn();
    connect([550, 378], [150, 150]);
    marker('to').should('have.attr', 'data-cardinality', 'one');
    // From Table 1's end: one → zero-or-one, then many and one-or-many are skipped → none.
    cy.canvasClick([352, 150]);
    marker('to').should('have.attr', 'data-cardinality', 'zeroOrOne');
    savedNodes((nodes) => expect(nodes.map((n) => n.type === 'connector' && n.toCardinality)).to.include('zeroOrOne'));
    cy.reload();
    marker('to').should('have.attr', 'data-cardinality', 'zeroOrOne');
    badge(1, 1).should('have.text', 'FK');
    cy.canvasClick([352, 150]);
    marker('to').should('have.attr', 'data-cardinality', 'none');
  });

  it('gives links between plain shapes no markers to click, and leaves a click beside a close table to the table', () => {
    cy.drawShape('rect', [100, 500], [200, 560]);
    cy.drawShape('rect', [400, 500], [500, 560]);
    connect([150, 530], [450, 530]);
    cy.get('[data-node-type=connector]').should('exist');
    cy.get('[data-testid=connector-marker]').should('not.exist');

    // Tables 10 px apart: the marker stays in the gap, so a press inside Table 2 is Table 2's.
    placeTable([100, 100]);
    placeTable([350, 100]);
    connect([400, 150], [150, 150]);
    cy.canvasClick([700, 700]);
    cy.canvasClick([356, 150]);
    cy.prop('name').should('have.value', 'Table 2');
    // The 10 px link is one segment: each end's marker gets its own half, so both stay clickable.
    marker('from').should('have.attr', 'data-cardinality', 'many');
    cy.canvasClick([348, 150]);
    marker('from').should('have.attr', 'data-cardinality', 'oneOrMany');
    marker('to').should('have.attr', 'data-cardinality', 'one');
  });
});
