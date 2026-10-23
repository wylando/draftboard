const NODES = '[data-node-type=table], [data-node-type=connector]';
const FIXTURE = 'schema/postgres.sql';
const FIXTURE_MYSQL = 'schema/mysql.sql';

const FORMAT = '[data-testid=import-format]';
const pressed = (dialect: string) => cy.get(`${FORMAT} [data-state=on]`).should('have.attr', 'data-value', dialect);

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
    pressed('postgres');
    cy.get('[data-testid=import-summary]').should('contain', '3 tables').and('contain', '3 relationships');
    cy.get('[data-testid=import-add]').should('have.focus');
    cy.fixture(FIXTURE).then((sql: string) => {
      const line = sql.split('\n').findIndex((l) => l.startsWith('CREATE VIEW')) + 1;
      cy.contains('h3', 'Skipped (1)').should('be.visible');
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
    cy.contains('h3', 'Problems (3)').should('be.visible');
    cy.get('[data-testid=import-problems]').should('contain', '"users" already exists; imported as "users 2"');
    cy.get('[data-testid=import-add]').click();
    cy.get('[data-node-type=table]').should('have.length', 6);
  });

  it('replaces the document with the plain imported tables after confirming, and clears history', () => {
    cy.drawShape('rect', [100, 100], [200, 200]);
    previewFixture();
    cy.get('[data-testid=import-add]').click();
    cy.get('[data-node-type=table]').should('have.length', 3);

    previewFixture();
    cy.get('[data-testid=import-problems]').should('contain', '"users" already exists; imported as "users 2"');

    cy.get('[data-testid=import-replace]').click();
    cy.get('[role=alertdialog]').should('contain', 'Replace the current design?');
    // Escape and Cancel close only the confirm; the preview and the canvas stay.
    cy.get('[role=alertdialog]').type('{esc}');
    cy.get('[role=alertdialog]').should('not.exist');
    cy.get('[data-testid=import-replace]').click();
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
    // Planned against an empty document, so nothing is renamed around the old tables.
    for (const name of ['users', 'posts', 'comments']) cy.contains('[data-node-type=table]', name).should('exist');
    cy.contains('[data-node-type=table]', 'users 2').should('not.exist');
    cy.get('[data-testid=undo]').should('be.disabled');
  });

  it('asks before replacing when the canvas is empty but has undo history', () => {
    cy.drawShape('rect', [100, 100], [200, 200]);
    cy.pressKey('Backspace');
    cy.get('[data-node-type=rect]').should('not.exist');
    previewFixture();
    cy.get('[data-testid=import-replace]').click();
    cy.get('[role=alertdialog]').should('be.visible');
    cy.get('[data-testid=dialog-cancel]').click();
    cy.get('[data-testid=import-replace]').should('be.visible');
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

  it('reads a MySQL dump from a file and detects the dialect', () => {
    cy.get('[data-testid=import-schema]').click();
    cy.get('[data-testid=schema-tab-file]').click();
    cy.contains('button', 'Preview').should('be.disabled');
    cy.fixture(FIXTURE_MYSQL, null).then((contents) => {
      cy.get('[data-testid=schema-file]').selectFile({ contents, fileName: 'dump.sql' }, { force: true });
    });
    cy.contains('dump.sql').should('be.visible');
    cy.contains('button', 'Preview').click();
    pressed('mysql');
    cy.get('[data-testid=import-summary]').should('contain', '2 tables').and('contain', '1 relationship');
  });

  it('re-parses with the dialect picked in the preview', () => {
    cy.get('[data-testid=import-schema]').click();
    // `jsonb` marks it as PostgreSQL, and the MySQL grammar can't read it. (The reverse isn't true:
    // the PostgreSQL grammar accepts MySQL dumps, so a dump can't demonstrate a failing re-parse.)
    cy.get('[data-testid=schema-source]').type('CREATE TABLE events (id serial PRIMARY KEY, payload jsonb);');
    cy.contains('button', 'Preview').click();
    pressed('postgres');
    cy.get('[data-testid=import-summary]').should('contain', '1 table');

    cy.get(`${FORMAT} [data-value=mysql]`).click();
    pressed('mysql');
    cy.get('[data-testid=import-summary]').should('contain', '0 tables');
    cy.get('[data-testid=import-problems]').should('exist');
    // Keyboard users keep their place after the plan is replaced.
    cy.get(`${FORMAT} [data-value=mysql]`).should('have.focus');
  });

  it('falls back to the SQL dialect preference when nothing marks the dialect', () => {
    cy.visit('/', {
      onBeforeLoad: (win) => {
        win.localStorage.clear();
        win.localStorage.setItem('draftboard:preferences:v1', '{"sqlDialect":"mysql"}');
      },
    });
    cy.get('[data-testid=canvas]').should('be.visible');
    cy.get('[data-testid=import-schema]').click();
    cy.get('[data-testid=schema-source]').type('CREATE TABLE t (id int);');
    cy.contains('button', 'Preview').click();
    pressed('mysql');
  });

  it('keeps pasted text across tabs, and states the privacy note only on the File tab', () => {
    cy.get('[data-testid=import-schema]').click();
    cy.get('[data-testid=schema-source]').type('CREATE TABLE t (id int);');
    cy.contains('Nothing is uploaded').should('not.exist');
    cy.get('[data-testid=schema-tab-file]').click();
    cy.contains('Nothing is uploaded').should('be.visible');
    cy.get('[data-testid=schema-tab-paste]').click();
    cy.get('[data-testid=schema-source]').should('have.value', 'CREATE TABLE t (id int);');
  });

  it('imports a SQLite database file', () => {
    cy.get('[data-testid=import-schema]').click();
    cy.get('[data-testid=schema-tab-file]').click();
    cy.fixture('schema/sample.db', null).then((contents) => {
      cy.get('[data-testid=schema-file]').selectFile({ contents, fileName: 'sample.db' }, { force: true });
    });
    cy.contains('button', 'Preview').click();
    // A binary file can't be re-read as another dialect, so there is no toggle.
    cy.get('[data-testid=import-summary]').should('contain', 'SQLite database').and('contain', '2 tables').and('contain', '1 relationship');
    cy.get('[data-testid=import-format]').should('not.exist');
    cy.get('[data-testid=import-skipped]').should('contain', 'CREATE VIEW');
    cy.get('[data-testid=import-add]').click();
    cy.get('[data-node-type=table]').should('have.length', 2);
    cy.get('[data-node-type=connector]').should('have.length', 1);
  });

  it('reads pasted SQLite SQL, and re-parses it when the dialect is toggled', () => {
    cy.get('[data-testid=import-schema]').click();
    cy.get('[data-testid=schema-source]').type(
      'CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT);\nCREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id));',
      { delay: 0 },
    );
    cy.contains('button', 'Preview').click();
    pressed('sqlite');
    cy.get('[data-testid=import-summary]').should('contain', '2 tables').and('contain', '1 relationship');

    cy.get(`${FORMAT} [data-value=postgres]`).click();
    pressed('postgres');
    // The PostgreSQL grammar rejects AUTOINCREMENT, so the first table is lost and its relationship with it.
    cy.get('[data-testid=import-summary]').should('contain', '1 table').and('contain', '0 relationships');
    cy.get('[data-testid=import-problems]').should('exist');
    cy.get(`${FORMAT} [data-value=sqlite]`).click();
    pressed('sqlite');
    cy.get('[data-testid=import-summary]').should('contain', '2 tables').and('contain', '1 relationship');
  });

  describe('DBML', () => {
    const chooseDbml = () => {
      cy.get('[data-testid=import-schema]').click();
      cy.get('[data-testid=schema-tab-file]').click();
      cy.fixture('schema/sample.dbml', null).then((contents) => {
        cy.get('[data-testid=schema-file]').selectFile({ contents, fileName: 'sample.dbml' }, { force: true });
      });
      cy.contains('button', 'Preview').click();
      cy.get('[data-testid=import-summary]').should('contain', 'DBML');
    };

    it('imports a DBML file, notes the enum, and adds tables and relationships', () => {
      chooseDbml();
      cy.get('[data-testid=import-summary]').should('contain', '4 tables').and('contain', '4 relationships');
      cy.get('[data-testid=import-skipped]').should('contain', 'Skipped enum types');
      cy.get('[data-testid=import-add]').click();
      cy.get('[data-node-type=table]').should('have.length', 4);
      cy.get('[data-node-type=connector]').should('have.length', 4);
      // Only `Ref: posts.id <> tags.id` is many-to-many, so only one connector has a many marker at both ends.
      cy.get('[data-node-type=connector]')
        .filter((_, el) => el.querySelectorAll('[data-testid=connector-marker][data-cardinality=many]').length === 2)
        .should('have.length', 1);
    });

    it('maps column types to the dialect picked under "Column types"', () => {
      chooseDbml();
      cy.get(FORMAT).should('have.attr', 'aria-label', 'Column types');
      cy.get(`${FORMAT} [data-value=mysql]`).click();
      pressed('mysql');
      cy.get(`${FORMAT} [data-value=mysql]`).should('have.focus');
      cy.get('[data-testid=import-add]').click();
      cy.contains('[data-testid=column-type]', 'varchar(255)').should('exist');
    });

    it('does not blame the DBML when it is valid but has no tables', () => {
      cy.get('[data-testid=import-schema]').click();
      cy.get('[data-testid=schema-source]').type('Enum s {{}\n  a\n  b\n}', { delay: 0 });
      cy.contains('button', 'Preview').click();
      cy.contains('No tables found').should('be.visible');
      cy.contains('Check that the text contains Table blocks.').should('be.visible');
      cy.contains('Fix the DBML errors').should('not.exist');
    });

    it('lists syntax errors with their lines and imports nothing', () => {
      cy.get('[data-testid=import-schema]').click();
      cy.get('[data-testid=schema-source]').type('Table users {{}\n  id int [pk\n}', { delay: 0 });
      cy.contains('button', 'Preview').click();
      cy.contains('No tables found').should('be.visible');
      cy.contains('Fix the DBML errors listed below.').should('be.visible');
      cy.get('[data-testid=import-problems]').should('contain', 'Line ');
      cy.get('[data-testid=import-add]').should('be.disabled');
    });
  });

  describe('files the importer cannot use', () => {
    const chooseFile = (contents: ReturnType<typeof Cypress.Buffer.from>, fileName: string) => {
      cy.get('[data-testid=import-schema]').click();
      cy.get('[data-testid=schema-tab-file]').click();
      cy.get('[data-testid=schema-file]').selectFile({ contents, fileName }, { force: true });
      cy.contains(fileName).should('be.visible');
      cy.contains('button', 'Preview').click();
    };

    it('shows a damaged SQLite database as nothing to import', () => {
      chooseFile(Cypress.Buffer.concat([Cypress.Buffer.from('SQLite format 3\0'), Cypress.Buffer.alloc(64)]), 'x.db');
      cy.get('[data-testid=import-summary]').should('contain', 'SQLite database');
      cy.contains('No tables found').should('be.visible');
      cy.contains("The database has no tables, or it isn't a readable SQLite file.").should('be.visible');
      cy.contains('CREATE TABLE statements').should('not.exist');
    });

    it('refuses a binary file', () => {
      chooseFile(Cypress.Buffer.from(Array.from({ length: 256 }, (_, i) => i)), 'y.sql');
      cy.get('[role=alertdialog]').should('contain', "Can't read this file").and('contain', "This file isn't text.");
    });
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
