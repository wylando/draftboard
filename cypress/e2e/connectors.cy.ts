// A module, so its helpers don't clash with other specs' in the shared spec scope.
export {};

const placeTable = (at: [number, number]) => {
  cy.pressKey('d', { code: 'KeyD' });
  cy.get('[data-testid=canvas]').should('have.attr', 'data-tool', 'table');
  cy.canvasClick(at);
  cy.get('[data-testid=canvas]').should('have.attr', 'data-tool', 'select');
};

const connectorTool = () => {
  cy.pressKey('c', { code: 'KeyC' });
  cy.get('[data-testid=canvas]').should('have.attr', 'data-tool', 'connector');
};

const line = () => cy.get('[data-node-type=connector] [data-testid=connector-line]');

const parseRoute = (r: string | undefined) => String(r).split(' ').map((p) => p.split(',').map(Number) as [number, number]);

/** Checks the connector's route in world px, retrying until React has drawn it. */
const route = (check: (points: Array<[number, number]>) => void) => line().should(($l) => check(parseRoute($l.attr('data-route'))));

// Two tables: Table 1 at (100, 100), its `id` row centred at y 150, right edge x 340;
// Table 2 at (500, 300), its `id` row centred at y 350, left edge x 500.
const twoTables = () => {
  placeTable([100, 100]);
  placeTable([500, 300]);
};

const connectIdRows = () => {
  connectorTool();
  cy.canvasDrag([550, 350], [150, 150]);
  cy.get('[data-node-type=connector]').should('have.length', 1);
};

describe('Connectors', () => {
  beforeEach(() => cy.visitEmpty());

  it('links a column to a column on the facing sides', () => {
    twoTables();
    connectIdRows();
    cy.get('[data-node-type=connector]').should('have.attr', 'data-from', 'column').and('have.attr', 'data-to', 'column');
    route((points) => {
      expect(points[0]).to.deep.equal([500, 350]);
      expect(points[points.length - 1]).to.deep.equal([340, 150]);
    });
    cy.get('[data-testid=canvas]').should('have.attr', 'data-tool', 'select');
  });

  it('shows the row or the whole table it will attach to while dragging', () => {
    twoTables();
    connectorTool();
    cy.canvasPointer('pointerdown', [550, 350]);
    cy.canvasPointer('pointermove', [300, 250]);
    cy.canvasPointer('pointermove', [150, 150]);
    cy.get('[data-testid=connect-target]').should('have.attr', 'data-target-kind', 'column');
    cy.get('[data-testid=connect-preview]').should('exist');
    cy.canvasPointer('pointermove', [200, 118]);
    cy.get('[data-testid=connect-target]').should('have.attr', 'data-target-kind', 'node');
    cy.canvasPointer('pointerup', [200, 118]);
    cy.get('[data-node-type=connector]').should('have.attr', 'data-to', 'node');
    cy.get('[data-testid=connect-preview]').should('not.exist');
  });

  it('attaches where a selected layer shows a handle, and beside another connector on the same row', () => {
    twoTables();
    connectIdRows();
    // A second foreign key into the same row edge, released right on the first connector's end dot.
    connectorTool();
    cy.canvasDrag([550, 450], [340, 150]);
    cy.get('[data-node-type=connector]').should('have.length', 2).last().should('have.attr', 'data-to', 'column');

    cy.drawShape('rect', [600, 600], [650, 650]);
    connectorTool();
    // (650, 625) is the selected rect's east resize handle.
    cy.canvasDrag([300, 700], [650, 625]);
    cy.get('[data-node-type=connector]').should('have.length', 3).last().should('have.attr', 'data-to', 'node');
  });

  it('refuses to link a layer to itself, and Escape cancels a drag', () => {
    cy.drawShape('rect', [600, 600], [700, 700]);
    connectorTool();
    cy.canvasDrag([620, 620], [680, 680]);
    cy.get('[data-testid=canvas]').should('have.attr', 'data-tool', 'select');
    cy.get('[data-node-type=connector]').should('not.exist');

    connectorTool();
    cy.canvasPointer('pointerdown', [300, 300]);
    cy.canvasPointer('pointermove', [400, 400]);
    cy.get('[data-testid=connect-preview]').should('exist');
    cy.pressKey('Escape');
    cy.get('[data-testid=connect-preview]').should('not.exist');
    cy.canvasPointer('pointerup', [650, 650]);
    // Picking another tool mid-drag cancels too.
    connectorTool();
    cy.canvasPointer('pointerdown', [300, 300]);
    cy.canvasPointer('pointermove', [400, 400]);
    cy.get('[data-testid=connect-preview]').should('exist');
    cy.pressKey('r', { code: 'KeyR' });
    cy.get('[data-testid=canvas]').should('have.attr', 'data-tool', 'rect');
    cy.canvasPointer('pointerup', [650, 650]);
    // A later render proves both releases were handled before checking nothing came of them.
    cy.zoomMenu('zoom-in');
    cy.get('[data-testid=zoom-level]').should('have.text', '200%');
    cy.get('[data-node-type=connector]').should('not.exist');
  });

  it('moves its loose ends with the selection, and is never grouped or boxed in by its bounds', () => {
    connectorTool();
    cy.canvasDrag([300, 300], [400, 420]);
    cy.prop('name').should('have.value', 'Connector 1');
    cy.pressKey('ArrowRight', { code: 'ArrowRight' });
    route((points) => {
      expect(points[0]).to.deep.equal([301, 300]);
      expect(points[points.length - 1]).to.deep.equal([401, 420]);
    });

    // Grouping a lone connector would make an empty group: nothing happens.
    cy.get('[data-testid=group-selection]').click();
    cy.get('[data-node-type=group]').should('not.exist');
    cy.prop('name').should('have.value', 'Connector 1');

    // A marquee in the empty corner of the route's bounds doesn't touch the line.
    cy.canvasClick([700, 100]);
    cy.get('[data-testid=properties-panel]').should('contain', 'Select a layer');
    route((points) => expect(points.length).to.be.greaterThan(2));
    cy.canvasDrag([392, 302], [398, 308]);
    cy.get('[data-testid=properties-panel]').should('contain', 'Select a layer');
  });

  it('follows a table when it moves', () => {
    twoTables();
    connectIdRows();
    cy.canvasDrag([200, 118], [200, 418]);
    route((points) => expect(points[points.length - 1]).to.deep.equal([340, 450]));
  });

  it('attaches to any shape by the side facing the other end, and leaves a loose end where it was dropped', () => {
    cy.drawShape('rect', [600, 600], [650, 650]);
    connectorTool();
    cy.canvasDrag([300, 610], [625, 625]);
    cy.get('[data-node-type=connector]').should('have.attr', 'data-from', 'point').and('have.attr', 'data-to', 'node');
    route((points) => {
      expect(points[0]).to.deep.equal([300, 610]);
      expect(points[points.length - 1]).to.deep.equal([600, 625]);
    });
    cy.get('[data-testid=connector-end][data-attached=false]').should('have.length', 1);
    cy.get('[data-testid=connector-end][data-attached=true]').should('have.length', 1);
  });

  it('keeps a dashed loose end where a deleted table was, counted as a problem until undone', () => {
    twoTables();
    connectIdRows();
    cy.get('[data-testid=problems-indicator]').should('not.exist');
    cy.canvasClick([200, 118]);
    cy.prop('name').should('have.value', 'Table 1');
    cy.pressKey('Backspace');
    cy.get('[data-node-type=table]').should('have.length', 1);
    line().should('have.attr', 'data-broken', 'true');
    route((points) => expect(points[points.length - 1]).to.deep.equal([340, 150]));
    cy.get('[data-testid=problems-indicator]').should('contain', '1');

    cy.pressKey('z', { code: 'KeyZ', metaKey: true });
    line().should('have.attr', 'data-broken', 'false');
    cy.get('[data-testid=problems-indicator]').should('not.exist');
    cy.pressKey('z', { code: 'KeyZ', metaKey: true, shiftKey: true });
    line().should('have.attr', 'data-broken', 'true');
  });

  it('keeps a loose end where a deleted column was', () => {
    twoTables();
    cy.canvasClick([200, 118]);
    cy.get('[data-testid=add-column]').click();
    // Table 1's new column_1 row is centred at y 178.
    connectorTool();
    cy.canvasDrag([550, 350], [150, 178]);
    cy.get('[data-node-type=connector]').should('have.attr', 'data-to', 'column');
    cy.canvasClick([200, 118]);
    cy.get('[data-testid=column-row]').eq(1).click();
    cy.get('[data-testid=column-editor] [data-testid=column-delete]').click();
    line().should('have.attr', 'data-broken', 'true');
    route((points) => expect(points[points.length - 1]).to.deep.equal([340, 178]));
  });

  it('is selected by a click on its line and deleted on its own', () => {
    twoTables();
    connectIdRows();
    route((points) => expect(points[0]).to.deep.equal([500, 350]));
    line().then(($l) => {
      const points = parseRoute($l.attr('data-route'));
      // The middle of the vertical run between the two tables.
      const vertical = points.findIndex(([x], i) => i > 0 && x === (points[i - 1] as [number, number])[0]);
      const [x, y1] = points[vertical - 1] as [number, number];
      const [, y2] = points[vertical] as [number, number];
      cy.canvasClick([x, (y1 + y2) / 2]);
    });
    cy.prop('name').should('have.value', 'Connector 1');
    // Attached at both ends, it goes where they go: dragging its line moves nothing.
    cy.canvasDrag([420, 250], [480, 260]);
    route((points) => expect(points[0]).to.deep.equal([500, 350]));
    cy.pressKey('Backspace');
    cy.get('[data-node-type=connector]').should('not.exist');
    cy.get('[data-node-type=table]').should('have.length', 2);
  });

  it('survives a reload, and a saved connector whose table is gone loads as a loose end', () => {
    twoTables();
    connectIdRows();
    cy.window().its('localStorage').invoke('getItem', 'draftboard:workspace:v1').should('contain', 'connector');
    cy.reload();
    line().should('have.attr', 'data-broken', 'false');

    const connector = {
      id: 'k', type: 'connector', name: 'Connector 1', parentId: null, x: 0, y: 0, width: 0, height: 0,
      rotation: 0, fill: '#ffffff', stroke: '#757575', strokeWidth: 1.5, opacity: 1, visible: true, routing: 'orthogonal',
      from: { kind: 'point', x: 50, y: 60 }, to: { kind: 'node', nodeId: 'gone' }, points: [{ x: 50, y: 60 }, { x: 250, y: 60 }],
    };
    cy.visit('/', {
      onBeforeLoad: (win) => {
        win.localStorage.clear();
        win.localStorage.setItem('draftboard:document:v1', JSON.stringify({ version: 1, nodes: [connector] }));
      },
    });
    line().should('have.attr', 'data-broken', 'true');
    route((points) => expect(points[points.length - 1]).to.deep.equal([250, 60]));
  });
});
