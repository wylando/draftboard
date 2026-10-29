// A module, so its helpers don't clash with other specs' in the shared spec scope.
export {};

const placeTable = (at: [number, number]) => {
  cy.pressKey('d', { code: 'KeyD' });
  cy.get('[data-testid=canvas]').should('have.attr', 'data-tool', 'table');
  cy.canvasClick(at);
  cy.get('[data-testid=canvas]').should('have.attr', 'data-tool', 'select');
};

const parseRoute = (r: string | undefined) => String(r).split(' ').map((p) => p.split(',').map(Number) as [number, number]);
/** Checks the route of connector `i`, retrying until React has drawn it. */
const route = (i: number, check: (points: Array<[number, number]>) => void) =>
  cy.get('[data-node-type=connector] [data-testid=connector-line]').eq(i).should(($l) => check(parseRoute($l.attr('data-route'))));
const undo = () => cy.pressKey('z', { code: 'KeyZ', metaKey: true });

// Table 1 at (100, 100): `id` row centred at y 150, right edge x 340.
// Table 2 at (500, 300): `id` row centred at y 350, left edge x 500.
// The connector from Table 2's `id` to Table 1's turns at x 420; (420, 250) is on its line.
const linkedTables = () => {
  placeTable([100, 100]);
  placeTable([500, 300]);
  cy.pressKey('c', { code: 'KeyC' });
  cy.get('[data-testid=canvas]').should('have.attr', 'data-tool', 'connector');
  cy.canvasDrag([550, 350], [150, 150]);
  cy.get('[data-node-type=connector]').should('have.length', 1);
};

describe('Editing connectors', () => {
  beforeEach(() => cy.visitEmpty());

  it('re-attaches an end by dragging it, as one undo step; refuses self-links; Escape cancels; a drop in place is no step', () => {
    linkedTables();
    cy.drawShape('rect', [100, 500], [200, 560]);
    cy.canvasClick([420, 250]);
    cy.prop('name').should('have.value', 'Connector 1');
    cy.get('[data-testid=connector-handle][data-connector-end=to]').should('exist');
    cy.canvasPointer('pointerdown', [340, 150]);
    cy.canvasPointer('pointermove', [250, 400]);
    cy.canvasPointer('pointermove', [150, 530]);
    cy.get('[data-testid=connect-target]').should('have.attr', 'data-target-kind', 'node');
    cy.canvasPointer('pointerup', [150, 530]);
    cy.get('[data-node-type=connector]').should('have.attr', 'data-to', 'node');
    route(0, (points) => expect(points[points.length - 1]).to.deep.equal([200, 530]));

    undo();
    cy.get('[data-node-type=connector]').should('have.attr', 'data-to', 'column');

    // Onto the layer its other end is on: refused, and never highlighted as a target.
    cy.canvasClick([420, 250]);
    cy.canvasPointer('pointerdown', [340, 150]);
    cy.canvasPointer('pointermove', [450, 300]);
    cy.canvasPointer('pointermove', [600, 318]);
    cy.get('[data-testid=connect-preview]').should('exist');
    cy.get('[data-testid=connect-target]').should('not.exist');
    cy.canvasPointer('pointerup', [600, 318]);
    cy.get('[data-node-type=connector]').should('have.attr', 'data-to', 'column');

    // Escape mid-drag cancels (by dropping the selection).
    cy.canvasClick([420, 250]);
    cy.canvasPointer('pointerdown', [340, 150]);
    cy.canvasPointer('pointermove', [250, 400]);
    cy.canvasPointer('pointermove', [150, 530]);
    cy.get('[data-testid=connect-preview]').should('exist');
    cy.pressKey('Escape');
    cy.get('[data-testid=connect-preview]').should('not.exist');
    cy.canvasPointer('pointerup', [150, 530]);

    // Back onto the row it was on: no change, so no undo step; the next undo removes the rect.
    cy.canvasClick([420, 250]);
    cy.canvasDrag([340, 150], [150, 150]);
    cy.get('[data-node-type=connector]').should('have.attr', 'data-to', 'column');
    undo();
    cy.get('[data-node-type=rect]').should('not.exist');
  });

  it('repairs a broken end: the problems button selects it, and its end goes onto another layer', () => {
    linkedTables();
    cy.drawShape('rect', [100, 500], [200, 560]);
    cy.canvasClick([200, 118]);
    cy.prop('name').should('have.value', 'Table 1');
    cy.pressKey('Backspace');
    // Once Table 1 is gone the connector is redrawn with its loose end at the old table edge (x 340), so
    // (420, 250) is no longer on it. Wait for the redraw instead of clicking before React has rendered the delete.
    cy.get('[data-testid=connector-line]').should('have.attr', 'data-broken', 'true');
    // A copy of a broken connector is broken too: still a lost link, so it counts.
    cy.canvasClick([340, 250]);
    cy.prop('name').should('have.value', 'Connector 1');
    cy.pressKey('d', { code: 'KeyD', metaKey: true });
    cy.get('[data-node-type=connector] [data-testid=connector-line]').eq(1).should('have.attr', 'data-broken', 'true');
    cy.get('[data-testid=problems-indicator]').should('contain', '2');
    cy.pressKey('Backspace');
    cy.get('[data-testid=problems-indicator]').should('contain', '1').click();
    cy.prop('name').should('have.value', 'Connector 1');
    cy.canvasDrag([340, 150], [150, 530]);
    cy.get('[data-node-type=connector]').should('have.attr', 'data-to', 'node');
    cy.get('[data-testid=connector-line]').should('have.attr', 'data-broken', 'false');
    cy.get('[data-testid=problems-indicator]').should('not.exist');
  });

  it('drops an end on empty canvas to leave it loose, which is not a problem', () => {
    linkedTables();
    cy.canvasClick([420, 250]);
    cy.get('[data-testid=connector-handle][data-connector-end=from]').should('exist');
    cy.canvasDrag([500, 350], [700, 700]);
    cy.get('[data-node-type=connector]').should('have.attr', 'data-from', 'point');
    route(0, (points) => expect(points[0]).to.deep.equal([700, 700]));
    cy.get('[data-testid=connector-line]').should('have.attr', 'data-broken', 'false');
    cy.get('[data-testid=problems-indicator]').should('not.exist');
  });

  it('names its ends and switches between right-angled and straight routes in the Design panel', () => {
    linkedTables();
    cy.canvasClick([420, 250]);
    cy.get('[data-testid=connector-from]').should('have.text', 'Table 2 · id');
    cy.get('[data-testid=connector-to]').should('have.text', 'Table 1 · id');
    cy.get('[data-testid=routing-orthogonal]').should('have.attr', 'data-state', 'on');
    cy.get('[data-testid=routing-straight]').click();
    route(0, (points) => expect(points).to.deep.equal([[500, 350], [340, 150]]));
    // Re-attaching a straight connector previews a straight line too.
    cy.canvasPointer('pointerdown', [340, 150]);
    cy.canvasPointer('pointermove', [300, 300]);
    cy.canvasPointer('pointermove', [300, 400]);
    cy.get('[data-testid=connect-preview]').should(($p) => expect(String($p.attr('points')).split(' ')).to.have.length(2));
    cy.canvasPointer('pointerup', [150, 150]);
    route(0, (points) => expect(points).to.deep.equal([[500, 350], [340, 150]]));
    undo();
    route(0, (points) => expect(points.length).to.be.greaterThan(2));
  });

  it('keeps copies linked to copied layers, and comes loose from layers that were not copied', () => {
    linkedTables();
    // Everything: both tables and the connector.
    cy.canvasDrag([60, 60], [800, 450]);
    cy.get('[data-testid=properties-panel]').should('contain', '3 layers selected');
    cy.pressKey('d', { code: 'KeyD', metaKey: true });
    cy.get('[data-node-type=connector]').should('have.length', 2);
    cy.get('[data-node-type=connector]').eq(1).should('have.attr', 'data-from', 'column').and('have.attr', 'data-to', 'column');
    route(1, (points) => {
      expect(points[0]).to.deep.equal([510, 360]);
      expect(points[points.length - 1]).to.deep.equal([350, 160]);
    });

    // The connector alone: its copy's ends stay where the original's were, 10 px on, loose.
    cy.canvasClick([420, 250]);
    cy.prop('name').should('have.value', 'Connector 1');
    cy.pressKey('d', { code: 'KeyD', metaKey: true });
    cy.get('[data-node-type=connector]').should('have.length', 3);
    cy.get('[data-node-type=connector]').eq(2).should('have.attr', 'data-from', 'point').and('have.attr', 'data-to', 'point');
    route(2, (points) => {
      expect(points[0]).to.deep.equal([510, 360]);
      expect(points[points.length - 1]).to.deep.equal([350, 160]);
    });
    cy.get('[data-testid=problems-indicator]').should('not.exist');
  });
});
