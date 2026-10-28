// A module, so its helpers don't clash with other specs' in the shared spec scope.
export {};

const placeTable = (at: [number, number]) => {
  cy.pressKey('d', { code: 'KeyD' });
  cy.get('[data-testid=canvas]').should('have.attr', 'data-tool', 'table');
  cy.canvasClick(at);
  cy.get('[data-testid=canvas]').should('have.attr', 'data-tool', 'select');
};
const connect = (from: [number, number], to: [number, number], count: number) => {
  cy.pressKey('c', { code: 'KeyC' });
  cy.get('[data-testid=canvas]').should('have.attr', 'data-tool', 'connector');
  cy.canvasDrag(from, to);
  cy.get('[data-testid=canvas]').should('have.attr', 'data-tool', 'select');
  cy.get('[data-node-type=connector]').should('have.length', count);
};
const nodeId = (type: string, index: number) => cy.get(`[data-node-type=${type}]`).eq(index).invoke('attr', 'data-node-id');
const hover = (at: [number, number]) => cy.canvasPointer('pointermove', at, { buttons: 0 });
const layerRow = (name: string) => cy.contains('[data-testid=layers-panel] [role=treeitem]', name);

// Table 1 (A) at (100, 100), Table 2 (B) at (500, 300), Table 3 (C) at (100, 500); headers are the first 36 px.
// B links to A. World and screen coordinates coincide on a fresh board.
const A: [number, number] = [200, 118];
const C: [number, number] = [200, 518];

describe('Canvas signals', () => {
  let a: string, b: string, c: string, link: string;

  beforeEach(() => {
    cy.visitEmpty();
    placeTable([100, 100]);
    placeTable([500, 300]);
    placeTable([100, 500]);
    connect([550, 318], A, 1);
    cy.canvasClick([800, 650]);
    nodeId('table', 0).then((id) => (a = id!));
    nodeId('table', 1).then((id) => (b = id!));
    nodeId('table', 2).then((id) => (c = id!));
    nodeId('connector', 0).then((id) => (link = id!));
  });

  describe('focus highlight', () => {
    it('fades the tables and links the highlight leaves out, draws related links thicker, and still lets them be clicked', () => {
      cy.get('[data-dimmed]').should('not.exist');
      cy.canvasClick(A);
      cy.prop('name').should('have.value', 'Table 1');
      cy.get('[data-dimmed=true]').should('have.length', 1).and('have.css', 'opacity', '0.35').find(`[data-node-id="${c}"]`).should('exist');
      cy.get('[data-testid=related-connector]').should('have.attr', 'stroke-width', '3');
      // Only the opacity changes: the faded table is still hit.
      cy.canvasClick(C);
      cy.prop('name').should('have.value', 'Table 3');
      // Table 3 has no links, so nothing is highlighted and nothing fades.
      cy.get('[data-dimmed]').should('not.exist');
      cy.canvasClick([800, 650]);
      cy.get('[data-dimmed]').should('not.exist');
      cy.get('[data-testid=route-step]').should('not.exist');
      expect(link).to.be.a('string');
    });

    it('numbers the tables of a join route, Start to End, on the table corners', () => {
      connect([200, 518], [600, 318], 2);
      cy.canvasClick([800, 650]);
      cy.get('[data-testid=connector-handle]').should('not.exist');
      cy.canvasClick(A);
      cy.prop('name').should('have.value', 'Table 1');
      cy.canvasClick(C, { shiftKey: true });
      cy.get('[data-testid=layers-panel] [role=treeitem][aria-selected=true]').should('have.length', 2);
      cy.get('[data-testid=route-step]').should('have.length', 3);
      const step = (n: number, table: string, text: string) =>
        cy.get(`[data-route-step=${n}]`).should('have.attr', 'data-route-table', table).and('have.text', text).and('have.attr', 'pointer-events', 'none');
      step(1, a, 'Start');
      step(2, b, '2');
      step(3, c, 'End');
    });
  });

  describe('hover', () => {
    it('outlines the layer a click would select, and highlights its Layers row', () => {
      hover(C);
      cy.get(`[data-testid=hover-outline][data-hover-id="${c}"]`).should('exist');
      layerRow('Table 3').should('have.attr', 'data-hovered', 'true');
      layerRow('Table 1').should('not.have.attr', 'data-hovered');
      hover([800, 650]);
      cy.get('[data-testid=hover-outline]').should('not.exist');
      layerRow('Table 3').should('not.have.attr', 'data-hovered');
    });

    it('thickens a hovered connector', () => {
      cy.get(`[data-node-id="${link}"] [data-testid=connector-line]`).invoke('attr', 'data-route').then((route) => {
        const [p, q] = route!.split(' ').map((pt) => pt.split(',').map(Number)) as [[number, number], [number, number]];
        hover([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]);
      });
      cy.get(`[data-testid=hover-outline][data-hover-id="${link}"]`).should('have.attr', 'stroke-width', '4');
    });

    it('is not drawn for a selected layer or while a button is held', () => {
      cy.canvasClick(A);
      cy.prop('name').should('have.value', 'Table 1');
      hover(A);
      cy.get('[data-testid=hover-outline]').should('not.exist');
      cy.canvasPointer('pointermove', C, { buttons: 1 });
      cy.get('[data-testid=hover-outline]').should('not.exist');
    });

    it('outlines the layer on the canvas while its Layers row is hovered', () => {
      layerRow('Table 2').trigger('pointerover');
      cy.get(`[data-testid=hover-outline][data-hover-id="${b}"]`).should('exist');
      layerRow('Table 2').trigger('pointerout');
      cy.get('[data-testid=hover-outline]').should('not.exist');
    });
  });
});

describe('Handle hit areas', () => {
  beforeEach(() => {
    cy.visitEmpty();
    cy.drawShape('rect', [200, 200], [400, 350]);
    cy.prop('w').should('have.value', '200');
  });

  const centre = (testId: string) =>
    cy.get('[data-testid=canvas]').then(($canvas) =>
      cy.get(`[data-testid=${testId}]`).then(($h) => {
        const r = $h[0]!.getBoundingClientRect();
        const o = $canvas[0]!.getBoundingClientRect();
        return [r.left + r.width / 2 - o.left, r.top + r.height / 2 - o.top] as [number, number];
      }),
    );

  it('grabs an edge handle from 10px away along the edge', () => {
    centre('handle-e').then(([x, y]) => cy.canvasDrag([x, y + 10], [x + 30, y + 10]));
    cy.prop('w').should('have.value', '230');
  });

  it('grabs a corner handle from 10px inside it', () => {
    // The corner's hit square reaches inward, so the drawn handle (at 400, 350) is 8px from its centre.
    cy.canvasDrag([390, 340], [420, 360]);
    cy.prop('w').should('have.value', '230');
    cy.prop('h').should('have.value', '170');
  });

  it('hides edge handles on a layer too small to hold them', () => {
    cy.canvasClick([800, 650]);
    cy.drawShape('rect', [600, 400], [620, 420]);
    cy.get('[data-testid=handle-se]').should('exist');
    cy.get('[data-testid=handle-n]').should('not.exist');
    cy.get('[data-testid=handle-e]').should('not.exist');
  });
});

describe('Connector handle hit areas', () => {
  it('grabs a connector end from 10px away', () => {
    cy.visitEmpty();
    placeTable([100, 100]);
    placeTable([500, 300]);
    connect([550, 318], A, 1);
    cy.get('[data-node-type=connector]').first().should('have.attr', 'data-to', 'node');
    cy.get('[data-testid=connector-handle]').should('have.length', 2);
    cy.get('[data-connector-end=to]').then(($h) => {
      const r = $h[0]!.getBoundingClientRect();
      cy.get('[data-testid=canvas]').then(($canvas) => {
        const o = $canvas[0]!.getBoundingClientRect();
        const [x, y] = [r.left + r.width / 2 - o.left, r.top + r.height / 2 - o.top];
        cy.canvasDrag([x + 10, y], [800, 650]);
      });
    });
    cy.get('[data-node-type=connector]').first().should('have.attr', 'data-to', 'point');
  });
});
