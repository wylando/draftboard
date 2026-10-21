// A module, so its helpers don't clash with tables.cy.ts's in the shared spec scope.
export {};

const tableRow = (i: number) => cy.get('[data-node-type=table] [data-testid=table-column]').eq(i);
const tableRows = () => cy.get('[data-node-type=table] [data-testid=table-column]');
const editor = () => cy.get('[data-testid=table-cell-editor]');
const undo = () => cy.pressKey('z', { code: 'KeyZ', metaKey: true });

// Placed at (200, 200), 240 wide: header 200..236, then 28 px rows from 236.
const rowY = (i: number) => 236 + 28 * i + 14;

describe('Editing tables on the canvas', () => {
  beforeEach(() => {
    cy.visitEmpty();
    cy.pressKey('d', { code: 'KeyD' });
    cy.get('[data-testid=canvas]').should('have.attr', 'data-tool', 'table');
    cy.canvasClick([200, 200]);
    cy.get('[data-testid=canvas]').should('have.attr', 'data-tool', 'select');
  });

  it('renames a table from its header, refusing a name another layer has', () => {
    cy.drawShape('rect', [600, 500], [650, 550]);
    cy.canvasDblClick([260, 218]);
    editor().should('have.attr', 'data-field', 'table-name').and('have.value', 'Table 1');
    editor().clear().type('rectangle 1{enter}');
    cy.get('[data-testid=table-cell-error]').should('contain', 'already named');
    editor().clear().type('users{enter}');
    editor().should('not.exist');
    cy.get('[data-testid=table-name]').should('have.text', 'users');
    cy.get('[data-testid=layers-panel]').should('contain', 'users');
  });

  it('edits cells in place: Tab goes name → type, Enter on the last row adds one, Escape cancels', () => {
    cy.canvasDblClick([250, rowY(0)]);
    editor().should('have.attr', 'data-field', 'column-name').and('have.value', 'id');
    editor().clear().type('user_id');
    // A real Tab key, so a missing preventDefault would move focus out of the editor.
    cy.press(Cypress.Keyboard.Keys.TAB);
    editor().should('have.attr', 'data-field', 'column-type').and('have.value', 'uuid');
    editor().clear().type('bigint{enter}');
    // Enter on the last row adds a column and moves on to its name.
    editor().should('have.attr', 'data-field', 'column-name').and('have.value', 'column_1');
    editor().clear().type('email{esc}');
    editor().should('not.exist');
    tableRow(0).should('contain', 'user_id').and('contain', 'bigint');
    tableRow(1).should('contain', 'column_1');

    // Each commit was its own undo step.
    undo();
    tableRows().should('have.length', 1);
    undo();
    tableRow(0).should('contain', 'uuid').and('contain', 'user_id');
  });

  it('double-clicking a type edits the type, and Shift+Tab walks back to the header', () => {
    cy.canvasDblClick([420, rowY(0)]);
    editor().should('have.attr', 'data-field', 'column-type').and('have.value', 'uuid');
    editor().trigger('keydown', { key: 'Tab', shiftKey: true });
    editor().should('have.attr', 'data-field', 'column-name').and('have.value', 'id');
    editor().trigger('keydown', { key: 'Tab', shiftKey: true });
    editor().should('have.attr', 'data-field', 'table-name');
  });

  it('blur saves a valid cell; a refused one closes with a notice and never holds on to focus', () => {
    cy.get('[data-testid=add-column]').click();
    tableRows().should('have.length', 2);
    cy.canvasDblClick([250, rowY(1)]);
    editor().should('have.value', 'column_1').clear().type('email').blur();
    editor().should('not.exist');
    tableRow(1).should('contain', 'email');

    cy.canvasDblClick([250, rowY(1)]);
    editor().clear().type('ID');
    // Clicking into another field takes focus away from the editor.
    cy.get('[data-testid=prop-w]').click();
    cy.focused().should('have.attr', 'data-testid', 'prop-w');
    editor().should('not.exist');
    cy.get('[data-testid=table-cell-notice]').should('contain', 'already has a column named');
    tableRow(1).should('contain', 'email');
  });

  it('a press elsewhere on the canvas saves the open cell first, or says why it could not', () => {
    cy.drawShape('rect', [600, 500], [650, 550]);
    cy.canvasDblClick([250, rowY(0)]);
    editor().clear().type('pk');
    cy.canvasClick([700, 300]);
    editor().should('not.exist');
    tableRow(0).should('contain', 'pk');

    cy.get('[data-testid=add-column]').should('not.exist');
    cy.canvasClick([250, rowY(0)]);
    cy.get('[data-testid=add-column]').click();
    tableRows().should('have.length', 2);
    cy.canvasDblClick([250, rowY(1)]);
    editor().clear().type('PK');
    cy.canvasClick([625, 525]);
    cy.prop('name').should('have.value', 'Rectangle 1');
    cy.get('[data-testid=table-cell-notice]').should('contain', 'already has a column named');
    tableRow(1).should('contain', 'column_1');
  });

  it('Escape drops just the pick, and a pick never outlives its column or a change of selection', () => {
    cy.get('[data-testid=add-column]').click();
    tableRows().should('have.length', 2);
    cy.canvasClick([250, rowY(1)]);
    cy.get('[data-testid=selected-column]').should('exist');
    cy.pressKey('Escape');
    cy.get('[data-testid=selected-column]').should('not.exist');
    cy.get('[data-testid=prop-name]').should('have.value', 'Table 1');

    // Group then ungroup re-selects the table without going through a plain select.
    cy.canvasClick([250, rowY(1)]);
    cy.get('[data-testid=selected-column]').should('exist');
    cy.pressKey('g', { code: 'KeyG', metaKey: true });
    cy.get('[data-node-type=group]').should('exist');
    cy.pressKey('g', { code: 'KeyG', metaKey: true, shiftKey: true });
    cy.get('[data-node-type=group]').should('not.exist');
    cy.get('[data-testid=selected-column]').should('not.exist');

    // Undo removes the picked column itself; Delete then removes the table.
    cy.get('[data-testid=add-column]').click();
    tableRows().should('have.length', 3);
    cy.canvasClick([250, rowY(2)]);
    cy.get('[data-testid=selected-column]').should('exist');
    undo();
    tableRows().should('have.length', 2);
    cy.pressKey('Backspace');
    cy.get('[data-node-type=table]').should('not.exist');
  });

  it('a click selects a row of the selected table, and Delete removes that column, not the table', () => {
    cy.get('[data-testid=add-column]').click();
    cy.get('[data-testid=add-column]').click();
    tableRows().should('have.length', 3);
    cy.canvasClick([250, rowY(1)]);
    cy.get('[data-testid=selected-column]').should('exist');
    cy.pressKey('Backspace');
    tableRows().should('have.length', 2);
    cy.get('[data-node-type=table]').should('exist');
    tableRow(1).should('contain', 'column_2');
    cy.get('[data-testid=selected-column]').should('not.exist');
  });

  it('drags a row by its handle to reorder, as one undo step', () => {
    cy.get('[data-testid=add-column]').click();
    cy.get('[data-testid=add-column]').click();
    tableRows().should('have.length', 3);

    // Hovering the drop next to the row itself shows no line, and letting go there changes nothing.
    cy.canvasPointer('pointerdown', [190, rowY(1)]);
    cy.canvasPointer('pointermove', [190, 240]);
    cy.get('[data-testid=row-drop-indicator]').should('exist');
    cy.canvasPointer('pointermove', [190, rowY(1) + 6]);
    cy.get('[data-testid=row-drop-indicator]').should('not.exist');
    cy.canvasPointer('pointerup', [190, rowY(1) + 6]);
    tableRow(1).should('contain', 'column_1');

    // The handles sit just left of the table, one per row.
    cy.canvasPointer('pointerdown', [190, rowY(2)]);
    cy.canvasPointer('pointermove', [190, rowY(1)]);
    cy.canvasPointer('pointermove', [190, 240]);
    cy.get('[data-testid=row-drop-indicator]').should('exist');
    cy.canvasPointer('pointerup', [190, 240]);
    tableRow(0).should('contain', 'column_2');
    tableRow(1).should('contain', 'id');
    cy.get('[data-testid=row-drop-indicator]').should('not.exist');
    cy.prop('x').should('have.value', '200');

    undo();
    tableRow(0).should('contain', 'id');
    tableRow(2).should('contain', 'column_2');

    // Downward: dropped below the last row, the first row goes to the end.
    cy.canvasDrag([190, rowY(0)], [190, rowY(2) + 12]);
    tableRow(2).should('contain', 'id');
    tableRow(0).should('contain', 'column_1');
  });
});
