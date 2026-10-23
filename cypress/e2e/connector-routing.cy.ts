// A module, so its helpers don't clash with other specs' in the shared spec scope.
export {};

interface Pt {
  x: number;
  y: number;
}
interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
interface StoredNode extends Box {
  type: string;
  points?: Pt[];
}

const placeTable = (at: [number, number]) => {
  cy.pressKey('d', { code: 'KeyD' });
  cy.get('[data-testid=canvas]').should('have.attr', 'data-tool', 'table');
  cy.canvasClick(at);
  cy.get('[data-testid=canvas]').should('have.attr', 'data-tool', 'select');
};

// Tables are 240 wide with 90px gaps. A table placed at (x, 100) has its `id` row centred at y 150.
const A: [number, number] = [30, 100];
const B: [number, number] = [360, 100];
const C: [number, number] = [690, 100];

const connect = (from: [number, number], to: [number, number]) => {
  cy.pressKey('c', { code: 'KeyC' });
  cy.get('[data-testid=canvas]').should('have.attr', 'data-tool', 'connector');
  cy.canvasDrag(from, to);
  cy.get('[data-node-type=connector]').should('have.length', 1);
};

/**
 * Reads the saved document, which holds each connector's route (`points`) and each table's box, in world
 * coordinates. Retries until the debounced save has caught up with `check`.
 */
const document = (check: (tables: Box[], route: Pt[]) => void) =>
  cy.window().should((win) => {
    const raw = win.localStorage.getItem('draftboard:document:v1');
    expect(raw, 'saved document').to.be.a('string');
    const nodes = (JSON.parse(raw as string) as { nodes: StoredNode[] }).nodes;
    const tables = nodes.filter((n) => n.type === 'table').sort((a, b) => a.x - b.x);
    const connector = nodes.find((n) => n.type === 'connector');
    expect(connector, 'saved connector').to.not.equal(undefined);
    check(tables, connector?.points ?? []);
  });

/** Liang-Barsky: does the segment enter the box's interior (shrunk by 1px, so touching an edge isn't a hit)? */
function crosses(p: Pt, q: Pt, box: Box): boolean {
  const left = box.x + 1;
  const right = box.x + box.width - 1;
  const top = box.y + 1;
  const bottom = box.y + box.height - 1;
  let t0 = 0;
  let t1 = 1;
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  for (const [pk, qk] of [
    [-dx, p.x - left],
    [dx, right - p.x],
    [-dy, p.y - top],
    [dy, bottom - p.y],
  ] as const) {
    if (pk === 0) {
      if (qk < 0) return false;
    } else {
      const r = qk / pk;
      if (pk < 0) t0 = Math.max(t0, r);
      else t1 = Math.min(t1, r);
    }
  }
  return t0 < t1;
}

const passesThrough = (route: Pt[], box: Box) => route.slice(1).some((q, i) => crosses(route[i] as Pt, q, box));

describe('Connector routing around tables', () => {
  beforeEach(() => cy.visitEmpty());

  it('routes around a table that sits between its two ends', () => {
    placeTable(A);
    placeTable(B);
    placeTable(C);
    cy.get('[data-node-type=table]').should('have.length', 3);
    connect([A[0] + 50, 150], [C[0] + 50, 150]);

    document((tables, route) => {
      expect(tables).to.have.length(3);
      expect(route.length, 'route points').to.be.greaterThan(1);
      expect(passesThrough(route, tables[1] as Box), 'route passes through the middle table').to.equal(false);
    });
  });

  it('reroutes live when a table is dragged onto the route', () => {
    placeTable(A);
    placeTable(C);
    placeTable([B[0], 400]);
    cy.get('[data-node-type=table]').should('have.length', 3);
    connect([A[0] + 50, 150], [C[0] + 50, 150]);
    document((tables, route) => {
      expect(route.length).to.be.greaterThan(1);
      expect(passesThrough(route, tables[1] as Box), 'nothing in the way yet').to.equal(false);
    });

    // Grab the middle table by its header and move it up onto the line between the other two.
    cy.canvasDrag([B[0] + 120, 410], [B[0] + 120, 110]);
    document((tables, route) => {
      expect((tables[1] as Box).y, 'the table moved onto the route').to.be.lessThan(150);
      expect(passesThrough(route, tables[1] as Box), 'route passes through the moved table').to.equal(false);
    });
  });

  it('keeps a straight connector straight, even through a table', () => {
    placeTable(A);
    placeTable(B);
    // Lower than the others, so an orthogonal route needs bends, and detours around the middle table.
    placeTable([C[0], 300]);
    cy.get('[data-node-type=table]').should('have.length', 3);
    connect([A[0] + 50, 150], [C[0] + 50, 350]);

    // The connector is selected right after it is drawn.
    cy.get('[data-testid=routing-orthogonal]').should('have.attr', 'data-state', 'on');
    document((_tables, route) => {
      expect(route.length, 'an orthogonal route bends').to.be.greaterThan(2);
    });

    cy.get('[data-testid=routing-straight]').click();
    cy.get('[data-testid=routing-straight]').should('have.attr', 'data-state', 'on');
    document((_tables, route) => {
      expect(route, 'a straight route is one segment').to.have.length(2);
    });
  });
});
