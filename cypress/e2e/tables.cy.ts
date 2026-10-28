const tableRow = (i: number) => cy.get('[data-node-type=table] [data-testid=table-column]').eq(i);
const columnRow = (i: number) => cy.get('[data-testid=column-row]').eq(i);
// Rows start folded, so this opens column i first (a column just added is already open).
const columnEditor = (i: number) => {
  columnRow(i).then(($row) => {
    if ($row.attr('aria-expanded') !== 'true') cy.wrap($row).click();
  });
  columnRow(i).should('have.attr', 'aria-expanded', 'true');
  return columnRow(i).closest('[data-part=item]').find('[data-testid=column-editor]');
};
const indexSearch = () => cy.get('[data-testid=index-editor] [data-testid=index-column-search]');
const indexChips = () => cy.get('[data-testid=index-editor] [data-testid=index-chip]');

const placeTable = () => {
  cy.pressKey('d', { code: 'KeyD' });
  cy.get('[data-testid=canvas]').should('have.attr', 'data-tool', 'table');
  cy.canvasClick([200, 200]);
  cy.get('[data-node-type=table]').should('have.length', 1);
};

const addColumn = () => {
  cy.get('[data-testid=add-column]').click();
  cy.focused().should('have.attr', 'data-testid', 'column-name');
};

const addEmailColumn = () => {
  cy.get('[data-testid=add-column]').click();
  columnEditor(1).find('[data-testid=column-name]').clear().type('email{enter}');
  tableRow(1).should('contain', 'email');
};

describe('Tables', () => {
  beforeEach(() => cy.visitEmpty());

  it('places a table with an id primary key from the Table tool', () => {
    placeTable();
    cy.prop('name').should('have.value', 'Table 1');
    tableRow(0).should('contain', 'id').and('contain', 'uuid');
    tableRow(0).find('[data-testid=column-badge]').should('have.text', 'PK');
    // A 36 px header plus one 28 px row.
    cy.get('[data-testid=table-body]').should('have.attr', 'height', '64');
    columnEditor(0).find('[data-testid=column-pk]').should('have.attr', 'data-state', 'on');
    columnEditor(0).find('[data-testid=column-type]').should('have.value', 'uuid');
  });

  it('adds and edits columns from the Design panel, one undo step per edit', () => {
    placeTable();
    addEmailColumn();
    columnEditor(1).find('[data-testid=column-type]').clear().type('varchar(64){enter}');
    tableRow(1).should('contain', 'varchar(64)');
    columnEditor(1).find('[data-testid=column-nullable]').click();
    tableRow(1).should('contain', 'varchar(64)?');
    cy.get('[data-testid=table-body]').should('have.attr', 'height', '92');

    cy.pressKey('z', { code: 'KeyZ', metaKey: true });
    tableRow(1).should('contain', 'varchar(64)').and('not.contain', '?');
    cy.pressKey('z', { code: 'KeyZ', metaKey: true });
    tableRow(1).should('contain', 'email').and('not.contain', 'varchar');
  });

  it('lists every column as a folded row, even a lone one, and only the first 5 until asked', () => {
    placeTable();
    cy.get('[data-testid=column-row]').should('have.length', 1);
    cy.get('[data-testid=column-editor]').should('not.exist');
    columnRow(0).should('contain', 'id').and('contain', 'uuid').and('contain', 'PK').and('have.attr', 'aria-expanded', 'false').click();
    columnRow(0).should('have.attr', 'aria-expanded', 'true');
    cy.get('[data-testid=column-editor]').should('have.length', 1);
    columnRow(0).click();
    cy.get('[data-testid=column-editor]').should('not.exist');

    for (let i = 0; i < 5; i++) addColumn();
    // Past 5 the rest wait behind Show more, until the list is asked for or a new column needs showing.
    cy.get('[data-testid=column-row]').should('have.length', 6);
    cy.get('[data-testid=show-more-columns]').should('have.text', 'Show fewer columns').click();
    cy.get('[data-testid=column-row]').should('have.length', 5);
    cy.get('[data-testid=show-more-columns]').should('have.text', 'Show 1 more column').click();
    cy.get('[data-testid=column-row]').should('have.length', 6);
  });

  it('turns the chevron on a row that opens in place, for columns and indexes alike', () => {
    // The down chevron's path; open, it is turned over by 180 degrees (matrix a = -1), not quarter-turned.
    const DOWN_CHEVRON = 'M4 6l4 4 4-4';
    const flipped = (el: JQuery<HTMLElement>) => new DOMMatrix(getComputedStyle(el[0]!).transform).a;
    placeTable();
    cy.get('[data-testid=add-index]').click();
    cy.get('[data-testid=index-row]').should('have.attr', 'aria-expanded', 'true');
    cy.get('[data-testid=index-row] [data-part=item-indicator]').should('have.attr', 'data-state', 'open').and(($i) => expect(flipped($i)).to.be.closeTo(-1, 0.001));
    cy.get('[data-testid=index-row] [data-part=item-indicator] path').should('have.attr', 'd', DOWN_CHEVRON);
    cy.get('[data-testid=index-row]').click();
    cy.get('[data-testid=index-row]').should('have.attr', 'aria-expanded', 'false');
    cy.get('[data-testid=index-row] [data-part=item-indicator]').should('have.attr', 'data-state', 'closed').and('have.css', 'transform', 'none');

    // Folded, a chevron points down; open, it has turned over.
    columnRow(0).find('[data-part=item-indicator]').should('have.attr', 'data-state', 'closed').and('have.css', 'transform', 'none');
    columnRow(0).find('[data-part=item-indicator] path').should('have.attr', 'd', DOWN_CHEVRON);
    columnRow(0).click();
    columnRow(0).should('have.attr', 'aria-expanded', 'true');
    columnRow(0).find('[data-part=item-indicator]').should('have.attr', 'data-state', 'open').and(($i) => expect(flipped($i)).to.be.closeTo(-1, 0.001));
  });

  it('after naming a new column with Enter, focus moves to Add column so the next one is a keypress away', () => {
    placeTable();
    cy.get('[data-testid=add-column]').click();
    cy.focused().should('have.attr', 'data-testid', 'column-name').type('email{enter}');
    columnRow(1).should('contain', 'email');
    // Cypress's simulated Enter does not activate any button in this app (an unrelated Add index probe fails the same way),
    // so the keypress itself is left to the browser; this pins that focus is there and that a second add still opens a named row.
    cy.get('[data-testid=add-column]').should('have.focus');
    cy.get('[data-testid=column-row]').should('have.length', 2);
    cy.get('[data-testid=add-column]').click();
    cy.get('[data-testid=column-row]').should('have.length', 3);
    cy.get('[data-testid=column-editor] [data-testid=column-name]').should('have.focus').and('have.value', 'column_1');
  });

  it('Add column stays in place: each click adds a row, opens it and selects its name', () => {
    placeTable();
    cy.get('[data-testid=add-column]').click();
    cy.get('[data-testid=add-column]').click();
    cy.get('[data-testid=column-row]').should('have.length', 3);
    columnRow(1).should('contain', 'column_1').and('have.attr', 'aria-expanded', 'false');
    columnRow(2).should('contain', 'column_2').and('have.attr', 'aria-expanded', 'true');
    cy.get('[data-testid=column-editor] [data-testid=column-name]').should('have.length', 1).and('have.focus').and('have.value', 'column_2');
    cy.focused().should(($input) => {
      const input = $input[0] as HTMLInputElement;
      expect([input.selectionStart, input.selectionEnd]).to.deep.equal([0, 'column_2'.length]);
    });
    cy.focused().type('total{enter}');
    columnRow(2).should('contain', 'total');
    cy.get('[data-testid=add-column]').should('exist');
  });

  it('reveals a column added past the first 5, open with its name focused', () => {
    placeTable();
    for (let i = 0; i < 4; i++) addColumn();
    cy.get('[data-testid=column-row]').should('have.length', 5);
    cy.get('[data-testid=show-more-columns]').should('not.exist');

    addColumn();
    cy.get('[data-testid=column-row]').should('have.length', 6);
    columnRow(5).should('contain', 'column_5').and('have.attr', 'aria-expanded', 'true');
    cy.get('[data-testid=column-editor] [data-testid=column-name]').should('have.focus').and('have.value', 'column_5');
    cy.get('[data-testid=show-more-columns]').should('have.text', 'Show fewer columns');
  });

  it('focuses a new column\'s name once, not again when an undo and redo bring it back', () => {
    placeTable();
    addColumn();
    addColumn();
    cy.pressKey('z', { code: 'KeyZ', metaKey: true });
    cy.get('[data-testid=column-row]').should('have.length', 2);
    cy.pressKey('z', { code: 'KeyZ', metaKey: true, shiftKey: true });
    cy.get('[data-testid=column-row]').should('have.length', 3);
    cy.document().its('activeElement.tagName').should('eq', 'BODY');
  });

  it('shows the whole list when a hidden column is picked on the canvas, opening it in its place', () => {
    placeTable();
    for (let i = 0; i < 6; i++) addColumn();
    cy.canvasClick([700, 500]);
    cy.contains('[data-testid=layers-panel] [role=treeitem]', 'Table 1').click();
    cy.get('[data-testid=show-more-columns]').should('have.text', 'Show 2 more columns');
    // Placed at (200, 200): header 200..236, then 28 px rows.
    cy.canvasClick([250, 236 + 28 * 5 + 14]);
    cy.get('[data-testid=column-row]').should('have.length', 7).eq(5).should('contain', 'column_5');
    cy.get('[data-testid=column-editor]').should('have.length', 1).find('[data-testid=column-name]').should('have.value', 'column_5');
    cy.get('[data-testid=show-more-columns]').should('have.text', 'Show fewer columns');
  });

  it('scrolls the Design panel to a column picked on the canvas', () => {
    // Short enough that the panel scrolls and the last column starts out of view.
    cy.viewport(1280, 560);
    placeTable();
    for (let i = 0; i < 6; i++) addColumn();
    // Reselecting starts the panel afresh: every row folded, the whole list shown.
    cy.canvasClick([700, 500]);
    cy.contains('[data-testid=layers-panel] [role=treeitem]', 'Table 1').click();
    cy.get('[data-testid=show-more-columns]').click();
    cy.get('[data-testid=properties-panel]').scrollTo('top');
    cy.canvasClick([250, 236 + 28 * 6 + 14]);
    cy.get('[data-testid=column-editor]').should('have.length', 1).find('[data-testid=column-name]').should('have.value', 'column_6');
    cy.get('[data-testid=properties-panel]').should(($panel) => {
      const panel = $panel[0]!.getBoundingClientRect();
      const editor = $panel[0]!.querySelector('[data-testid=column-editor]')!.getBoundingClientRect();
      expect(editor.top).to.be.at.least(panel.top);
      expect(editor.bottom).to.be.at.most(panel.bottom);
    });
  });

  it('never lets a primary key be nullable', () => {
    placeTable();
    columnEditor(0).find('[data-testid=column-nullable]').click();
    columnEditor(0).find('[data-testid=column-pk]').should('have.attr', 'data-state', 'off');
    tableRow(0).should('contain', 'uuid?').find('[data-testid=column-badge]').should('not.exist');
    columnEditor(0).find('[data-testid=column-pk]').click();
    columnEditor(0).find('[data-testid=column-nullable]').should('have.attr', 'data-state', 'off');
    tableRow(0).should('not.contain', '?');
  });

  it('keeps column names unique within a table, ignoring case', () => {
    placeTable();
    cy.get('[data-testid=add-column]').click();
    columnEditor(1).find('[data-testid=column-name]').clear().type('ID{enter}');
    columnEditor(1).should('contain', 'already has a column named');
    tableRow(1).should('not.contain', 'ID');
  });

  it('cuts long names short instead of letting them overlap the type, but never a type that fits', () => {
    placeTable();
    columnEditor(0).find('[data-testid=column-type]').clear().type('double precision{enter}');
    tableRow(0).find('[data-testid=column-type]').should('have.text', 'double precision');
    columnEditor(0).find('[data-testid=column-name]').clear().type('identifier_assigned_by_the_upstream_system{enter}');
    tableRow(0).find('[data-testid=column-name]').should(($t) => expect($t.text()).to.match(/…$/));
  });

  it('marks unique and indexed columns, finds index columns by fuzzy search, and keeps unrelated indexes when a column goes', () => {
    placeTable();
    addEmailColumn();
    columnEditor(1).find('[data-testid=column-unique]').click();
    tableRow(1).find('[data-testid=column-badge]').should('have.text', 'UQ');

    cy.get('[data-testid=add-index]').click();
    // Clicked while empty, the search lists every column.
    indexSearch().click();
    cy.get('[data-testid=index-column-option]').should('have.length', 2);
    cy.contains('[data-testid=index-column-option]', 'email').click();
    tableRow(1).find('[data-testid=column-index]').should('exist');
    tableRow(0).find('[data-testid=column-index]').should('not.exist');

    // Adding another index folds the first to its one-line summary.
    cy.get('[data-testid=add-index]').click();
    cy.get('[data-testid=index-row]').eq(0).should('contain', 'table_1_idx').and('contain', 'email');
    indexSearch().type('eml');
    cy.get('[data-testid=index-column-option]').should('have.length', 1).click();
    indexSearch().type('id');
    cy.get('[data-testid=index-column-option]').should('have.length', 1).click();
    indexChips().should(($chips) => expect([...$chips].map((c) => c.textContent)).to.deep.equal(['email', 'id']));

    // Deleting email empties the first index, which goes; the second keeps id.
    columnEditor(1).find('[data-testid=column-delete]').click();
    cy.get('[data-node-type=table] [data-testid=table-column]').should('have.length', 1);
    cy.get('[data-testid=index-row]').should('have.length', 1).and('contain', 'id').and('not.contain', 'email');
  });

  it('reorders index columns by dragging their chips, as one undo step, and folds the index to one line when not editing', () => {
    placeTable();
    addEmailColumn();
    cy.get('[data-testid=add-index]').click();
    indexSearch().click();
    cy.contains('[data-testid=index-column-option]', 'email').click();
    cy.contains('[data-testid=index-column-option]', /^id$/).click();
    indexChips().should('have.length', 2);

    cy.contains('[data-testid=index-chip]', /^id$/).then(($id) => {
      cy.contains('[data-testid=index-chip]', 'email').then(($email) => {
        const dx = $email[0]!.getBoundingClientRect().left + 2 - ($id[0]!.getBoundingClientRect().left + $id[0]!.getBoundingClientRect().width / 2);
        cy.wrap($id).pointer('pointerdown').pointer('pointermove', [dx / 2, 0]).pointer('pointermove', [dx, 0]).pointer('pointerup', [dx, 0]);
      });
    });
    indexChips().should(($chips) => expect([...$chips].map((c) => c.textContent)).to.deep.equal(['id', 'email']));

    cy.prop('name').click();
    cy.get('[data-testid=index-editor]').should('not.exist');
    cy.get('[data-testid=index-row]').should('contain', 'id, email');
    cy.pressKey('z', { code: 'KeyZ', metaKey: true });
    cy.get('[data-testid=index-row]').should('contain', 'email, id').click();
    cy.get('[data-testid=index-editor]').should('exist');
  });

  it('keeps a typed index name when a press elsewhere folds the index', () => {
    placeTable();
    cy.get('[data-testid=add-index]').click();
    cy.get('[data-testid=index-name]').clear().type('by_id');
    cy.prop('name').click();
    cy.get('[data-testid=index-editor]').should('not.exist');
    cy.get('[data-testid=index-row]').should('contain', 'by_id');
  });

  it('moves and removes index chips from the keyboard', () => {
    placeTable();
    addEmailColumn();
    cy.get('[data-testid=add-index]').click();
    indexSearch().click();
    cy.contains('[data-testid=index-column-option]', 'email').click();
    cy.contains('[data-testid=index-column-option]', /^id$/).click();
    cy.contains('[data-testid=index-chip]', /^id$/).focus().type('{alt}{leftArrow}');
    indexChips().should(($chips) => expect([...$chips].map((c) => c.textContent)).to.deep.equal(['id', 'email']));
    // Backspace on a chip removes that column, never the selected table behind the panel.
    cy.contains('[data-testid=index-chip]', 'email').focus().type('{backspace}');
    indexChips().should('have.length', 1);
    cy.get('[data-node-type=table]').should('exist');
  });

  it('refuses an index name already used in the table, saying why', () => {
    placeTable();
    cy.get('[data-testid=add-index]').click();
    cy.get('[data-testid=add-index]').click();
    cy.get('[data-testid=index-editor]').find('[data-testid=index-name]').clear().type('table_1_idx{enter}');
    cy.get('[data-testid=index-editor]').should('contain', 'already has an index named');
    cy.get('[data-testid=index-editor]').find('[data-testid=index-name]').should('have.value', 'table_1_idx_2');
  });

  it('renaming an index to the name it already has adds no undo step', () => {
    placeTable();
    addEmailColumn();
    cy.get('[data-testid=add-index]').click();
    cy.get('[data-testid=index-name]').should('have.value', 'table_1_idx').type(' {enter}');
    cy.pressKey('z', { code: 'KeyZ', metaKey: true });
    // The undo removed the index itself, so the trailing-space commit wasn't a step.
    cy.get('[data-testid=index-editor]').should('not.exist');
    tableRow(1).should('contain', 'email');
  });

  it('takes a header color from the swatches, with text that stays readable on a dark custom color', () => {
    placeTable();
    cy.get('[data-testid=accent-swatch]').eq(1).click();
    cy.get('[data-testid=table-header]').should('have.attr', 'fill', '#dcfce7');
    cy.get('[data-testid=table-name]').should('have.attr', 'fill', '#1e1e1e');
    cy.get('[data-testid=prop-accent]').clear().type('1E3A8A{enter}');
    cy.get('[data-testid=table-header]').should('have.attr', 'fill', '#1e3a8a');
    cy.get('[data-testid=table-name]').should('have.attr', 'fill', '#ffffff');
  });

  it('draws the lines between rows in the table’s stroke, and drops them with the stroke', () => {
    placeTable();
    cy.get('[data-testid=add-column]').click();
    cy.get('[data-node-type=table] [data-testid=row-divider]').should('have.length', 1);
    cy.prop('stroke').clear().type('FF0000{enter}');
    cy.get('[data-node-type=table] [data-testid=row-divider]').should('have.attr', 'stroke', '#ff0000');
    cy.prop('stroke-width').clear().type('0{enter}');
    // Still two rows, so a missing divider means the stroke hid it.
    cy.get('[data-node-type=table] [data-testid=table-column]').should('have.length', 2);
    cy.get('[data-node-type=table] [data-testid=row-divider]').should('not.exist');
  });

  it('resizes in width only, down to a readable minimum, and never rotates', () => {
    placeTable();
    cy.get('[data-testid=handle-e]').should('exist');
    cy.get('[data-testid=handle-n]').should('not.exist');
    cy.get('[data-testid=handle-se]').should('not.exist');
    cy.get('[data-testid=rotate-ne]').should('not.exist');
    // Placed at (200, 200), 240 wide: the east handle sits at (440, 232).
    cy.canvasDrag([440, 232], [500, 232]);
    cy.prop('w').should('have.value', '300');
    // The table's 120 px minimum is for width only; applied to height, it once shifted the table up.
    cy.prop('y').should('have.value', '200');
    cy.canvasDrag([500, 232], [210, 232]);
    cy.prop('w').should('have.value', '120');
  });

  it('dragging with the Table tool sets the width and keeps the top where the drag began', () => {
    cy.pressKey('d', { code: 'KeyD' });
    cy.get('[data-testid=canvas]').should('have.attr', 'data-tool', 'table');
    cy.canvasDrag([200, 300], [400, 100]);
    cy.prop('y').should('have.value', '300');
    cy.prop('w').should('have.value', '200');

    // Too short a drag still gives a table wide enough to read.
    cy.pressKey('d', { code: 'KeyD' });
    cy.get('[data-testid=canvas]').should('have.attr', 'data-tool', 'table');
    cy.canvasDrag([500, 500], [530, 510]);
    cy.prop('name').should('have.value', 'Table 2');
    cy.prop('x').should('have.value', '500');
    cy.prop('w').should('have.value', '120');
  });

  it('takes the id type and type suggestions from the SQL dialect setting', () => {
    cy.get('[data-testid=app-menu]').click();
    cy.get('[data-testid=open-settings]').click();
    cy.get('[data-testid=nav-canvas]').click();
    cy.get('[data-testid=sql-dialect-mysql]').click();
    cy.get('[data-testid=sql-dialect-mysql]').should('have.attr', 'data-state', 'checked');
    cy.get('[data-testid=close-settings]').click();

    placeTable();
    columnEditor(0).find('[data-testid=column-type]').should('have.value', 'bigint');
    cy.get('datalist#column-types option[value=datetime]').should('exist');
  });

  it('duplicates a table with its columns under the next free name', () => {
    placeTable();
    addEmailColumn();
    cy.pressKey('d', { code: 'KeyD', metaKey: true });
    cy.get('[data-node-type=table]').should('have.length', 2);
    cy.get('[data-testid=table-name]').eq(1).should('have.text', 'Table 2');
    cy.get('[data-node-type=table]').eq(1).find('[data-testid=table-column]').should('have.length', 2);
  });

  it('keeps tables across a reload', () => {
    placeTable();
    cy.get('[data-testid=add-column]').click();
    cy.window().its('localStorage').invoke('getItem', 'draftboard:workspace:v1').should('contain', 'column_1');
    cy.reload();
    cy.get('[data-node-type=table] [data-testid=table-column]').should('have.length', 2);
  });

  it('repairs a saved table with repeated column names or stale index columns, keeping the rest of the document', () => {
    const column = { primaryKey: false, nullable: false, unique: false, dataType: 'text' };
    const rect = { id: 'r', type: 'rect', name: 'Keep me', parentId: null, x: 500, y: 100, width: 50, height: 50, rotation: 0, fill: '#d9d9d9', stroke: '#000000', strokeWidth: 0, opacity: 1, visible: true, cornerRadius: 0 };
    const table = {
      id: 't', type: 'table', name: 'users', parentId: null, x: 100, y: 100, width: 240, height: 92,
      rotation: 0, fill: '#ffffff', stroke: '#d9d9d9', strokeWidth: 1, opacity: 1, visible: true, accent: '#dbeafe',
      columns: [{ ...column, id: 'a', name: 'email' }, { ...column, id: 'b', name: 'Email' }],
      indexes: [{ id: 'i', name: 'users_idx', columnIds: ['a', 'gone'], unique: false }],
    };
    cy.visit('/', {
      onBeforeLoad: (win) => {
        win.localStorage.clear();
        win.localStorage.setItem('draftboard:document:v1', JSON.stringify({ version: 1, nodes: [rect, table] }));
      },
    });
    cy.get('[data-node-type=rect]').should('have.length', 1);
    tableRow(1).should('contain', 'Email_2');
    tableRow(0).find('[data-testid=column-index]').should('exist');
  });
});
