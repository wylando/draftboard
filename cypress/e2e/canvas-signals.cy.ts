// A module, so its helpers don't clash with other specs' in the shared spec scope.
export {};

import { placeTable } from '../support/canvas';

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
    it('outlines the layer a click would select (a connector thicker), highlights its Layers row, and skips a selected layer or a held button', () => {
      hover(C);
      cy.get(`[data-testid=hover-outline][data-hover-id="${c}"]`).should('exist');
      layerRow('Table 3').should('have.attr', 'data-hovered', 'true');
      layerRow('Table 1').should('not.have.attr', 'data-hovered');
      hover([800, 650]);
      cy.get('[data-testid=hover-outline]').should('not.exist');
      layerRow('Table 3').should('not.have.attr', 'data-hovered');

      cy.get(`[data-node-id="${link}"] [data-testid=connector-line]`).invoke('attr', 'data-route').then((route) => {
        const [p, q] = route!.split(' ').map((pt) => pt.split(',').map(Number)) as [[number, number], [number, number]];
        hover([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]);
      });
      cy.get(`[data-testid=hover-outline][data-hover-id="${link}"]`).should('have.attr', 'stroke-width', '4');

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

  it('still moves a small selected layer by its body, and rotates from just outside a corner', () => {
    cy.canvasClick([800, 650]);
    cy.drawShape('rect', [600, 400], [640, 440]);
    cy.prop('w').should('have.value', '40');
    // Fractions of the 40px box: the first sits in an edge's grab reach, the second in a corner's, the third clear of both; none may resize.
    for (const [fx, fy] of [[0.3, 0.5], [0.25, 0.25], [0.7, 0.7]] as const) {
      cy.prop('x').invoke('val').then((x) => {
        cy.canvasDrag([600 + 40 * fx + (Number(x) - 600), 400 + 40 * fy], [600 + 40 * fx + (Number(x) - 600) + 20, 400 + 40 * fy]);
        cy.prop('x').should('have.value', String(Number(x) + 20));
      });
      cy.prop('w').should('have.value', '40');
    }
    cy.prop('rotation').should('have.value', '0');
    // Just outside the box's top-left corner (x is now 660; the corner grab area starts 4px out).
    cy.canvasDrag([652, 392], [630, 410]);
    cy.prop('rotation').should('not.have.value', '0');
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
  it('grabs a connector end from 8px away', () => {
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
        cy.canvasDrag([x + 8, y], [800, 650]);
      });
    });
    cy.get('[data-node-type=connector]').first().should('have.attr', 'data-to', 'point');
  });
});
