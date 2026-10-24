const tableRow = (i: number) => cy.get('[data-node-type=table] [data-testid=table-column]').eq(i);
const columnEditor = (i: number) => cy.get('[data-testid=column-editor]').eq(i);

const placeTable = () => {
  cy.pressKey('d', { code: 'KeyD' });
  cy.get('[data-testid=canvas]').should('have.attr', 'data-tool', 'table');
  cy.canvasClick([200, 200]);
  cy.get('[data-node-type=table]').should('have.length', 1);
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

  it('marks unique and indexed columns, shows index order, and keeps unrelated indexes when a column goes', () => {
    placeTable();
    addEmailColumn();
    columnEditor(1).find('[data-testid=column-unique]').click();
    tableRow(1).find('[data-testid=column-badge]').should('have.text', 'UQ');

    cy.get('[data-testid=add-index]').click();
    cy.get('[data-testid=index-editor]').eq(0).find('[data-testid=index-column]').contains('email').click();
    tableRow(1).find('[data-testid=column-index]').should('exist');
    tableRow(0).find('[data-testid=column-index]').should('not.exist');

    // A composite index lists its columns in the order they were picked.
    cy.get('[data-testid=add-index]').click();
    cy.get('[data-testid=index-editor]').eq(1).find('[data-testid=index-column]').contains('email').click();
    cy.get('[data-testid=index-editor]').eq(1).find('[data-testid=index-column]').contains(/^id$/).click();
    cy.get('[data-testid=index-editor]').eq(1).find('[data-testid=index-order]').should('have.text', 'email, id');

    // Deleting email empties the first index, which goes; the second keeps id.
    columnEditor(1).find('[data-testid=column-delete]').click();
    cy.get('[data-node-type=table] [data-testid=table-column]').should('have.length', 1);
    cy.get('[data-testid=index-editor]').should('have.length', 1).find('[data-testid=index-order]').should('have.text', 'id');
  });

  it('refuses an index name already used in the table, saying why', () => {
    placeTable();
    cy.get('[data-testid=add-index]').click();
    cy.get('[data-testid=add-index]').click();
    cy.get('[data-testid=index-editor]').eq(1).find('[data-testid=index-name]').clear().type('table_1_idx{enter}');
    cy.get('[data-testid=index-editor]').eq(1).should('contain', 'already has an index named');
    cy.get('[data-testid=index-editor]').eq(1).find('[data-testid=index-name]').should('have.value', 'table_1_idx_2');
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
