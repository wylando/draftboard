// A module, so its helpers don't clash with other specs' in the shared spec scope.
export {};

interface Pt {
  x: number;
  y: number;
}
interface Box extends Pt {
  width: number;
  height: number;
}
interface Saved extends Box {
  type: string;
  name: string;
  points?: Pt[];
  bends?: Pt[];
}

const placeTable = (at: [number, number]) => {
  cy.pressKey('d', { code: 'KeyD' });
  cy.get('[data-testid=canvas]').should('have.attr', 'data-tool', 'table');
  cy.canvasClick(at);
  cy.get('[data-testid=canvas]').should('have.attr', 'data-tool', 'select');
};

// A's `id` row is centred at y 150 (right edge x 270); C is lower, its `id` row at y 350 (left edge x 690).
// B starts out of the way, below both; the tests drag it onto the connector.
const A: [number, number] = [30, 100];
const C: [number, number] = [690, 300];
const B: [number, number] = [400, 480];

const shapedConnector = () => {
  placeTable(A);
  placeTable(C);
  placeTable(B);
  cy.pressKey('c', { code: 'KeyC' });
  cy.get('[data-testid=canvas]').should('have.attr', 'data-tool', 'connector');
  cy.canvasDrag([A[0] + 50, 150], [C[0] + 50, 350]);
  cy.get('[data-node-type=connector]').should('have.length', 1);
  cy.get('[data-connector-segment="1"]').should('exist');
  centre().then(([x, y]) => {
    cy.canvasPointer('pointerdown', [x, y]);
    cy.canvasPointer('pointermove', [x + 30, y]);
    cy.canvasPointer('pointermove', [x + 60, y]);
    cy.canvasPointer('pointerup', [x + 60, y]);
  });
};

const centre = () =>
  cy.get('[data-testid=canvas]').then(($canvas) =>
    cy.get('[data-connector-segment="1"]').then(($h) => {
      const c = $canvas[0]!.getBoundingClientRect();
      const h = $h[0]!.getBoundingClientRect();
      return [h.left + h.width / 2 - c.left, h.top + h.height / 2 - c.top] as [number, number];
    }),
  );

/** The saved tables (left to right: A, B, C by their x at the start) and the connector, retried until saved. */
const saved = (check: (tables: Saved[], connector: Saved) => void) =>
  cy.window().should((win) => {
    const raw = win.localStorage.getItem('draftboard:document:v1');
    const nodes = raw ? (JSON.parse(raw) as { nodes: Saved[] }).nodes : [];
    const connector = nodes.find((n) => n.type === 'connector');
    expect(connector, 'saved connector').to.not.equal(undefined);
    check(nodes.filter((n) => n.type === 'table'), connector as Saved);
  });
// Tables are named in the order they are placed (A, C, B), and a name survives smart-guide snapping, unlike a position.
const TABLE = { A: 'Table 1', C: 'Table 2', B: 'Table 3' };
const table = (tables: Saved[], name: string) => {
  const found = tables.find((t) => t.name === name);
  expect(found, `saved ${name}`).to.not.equal(undefined);
  return found as Saved;
};

/** Liang-Barsky: does the segment enter the box's interior (shrunk 1px, so touching an edge isn't a hit)? */
function crosses(p: Pt, q: Pt, box: Box): boolean {
  const left = box.x + 1;
  const right = box.x + box.width - 1;
  const top = box.y + 1;
  const bottom = box.y + box.height - 1;
  let t0 = 0;
  let t1 = 1;
  for (const [pk, qk] of [
    [-(q.x - p.x), p.x - left],
    [q.x - p.x, right - p.x],
    [-(q.y - p.y), p.y - top],
    [q.y - p.y, bottom - p.y],
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

/** Drags a table by its header, `by` pixels. */
const dragTable = (header: [number, number], by: [number, number]) => cy.canvasDrag(header, [header[0] + by[0], header[1] + by[1]]);

describe('A shaped connector still avoids tables', () => {
  beforeEach(() => cy.visitEmpty());

  /** The saved connector as it is right now. */
  const connectorNow = () =>
    cy.window().then((win) => (JSON.parse(win.localStorage.getItem('draftboard:document:v1') as string) as { nodes: Saved[] }).nodes.find((n) => n.type === 'connector') as Saved);

  /** Drags B so it straddles the shaped segment; the returned offset puts it back. */
  const dragBOntoSegment = (segmentX: number) => {
    const by: [number, number] = [segmentX - (B[0] + 120), 210 - (B[1] + 10)];
    dragTable([B[0] + 120, B[1] + 10], by);
    saved((tables, c) => {
      const b = table(tables, TABLE.B);
      expect(b.y, 'B moved up onto the route').to.be.lessThan(300);
      expect(passesThrough(c.points as Pt[], b), 'route passes through B').to.equal(false);
    });
    return by;
  };

  it('detours around a table dragged onto the shaped segment, keeps the shape, and returns to it', () => {
    shapedConnector();
    saved((_t, c) => expect(c.bends, 'manual shape').to.not.equal(undefined));
    connectorNow().then((shaped) => {
      const by = dragBOntoSegment((shaped.points as Pt[])[1]!.x);
      saved((_t, c) => expect(c.bends, 'the shape is kept').to.deep.equal(shaped.bends));

      dragTable([B[0] + 120 + by[0], B[1] + 10 + by[1]], [-by[0], -by[1]]);
      saved((tables, c) => {
        expect(table(tables, TABLE.B).y, 'B moved away again').to.be.greaterThan(400);
        expect(c.points, 'the shaped route again').to.deep.equal(shaped.points);
      });
    });
  });

  it('reshapes the user shape, not the detour, when its segment is dragged while a table is in the way', () => {
    shapedConnector();
    saved((_t, c) => expect(c.bends, 'manual shape').to.not.equal(undefined));
    connectorNow().then((shaped) => {
      const points = shaped.points as Pt[];
      const by = dragBOntoSegment(points[1]!.x);

      // B is selected after its drag; pick the connector again on its first leg, clear of B.
      cy.canvasClick([350, 150]);
      cy.get('[data-testid=routing-orthogonal]').should('have.attr', 'data-state', 'on');
      // The handle stays on the user's segment (index 1), not on a detour segment.
      centre().then(([x, y]) => {
        cy.canvasPointer('pointerdown', [x, y]);
        cy.canvasPointer('pointermove', [x + 20, y]);
        cy.canvasPointer('pointermove', [x + 40, y]);
        cy.canvasPointer('pointerup', [x + 40, y]);
      });
      saved((_t, c) => expect(((c.bends as Pt[])[0] as Pt).x, 'the shape moved by 40').to.equal(points[1]!.x + 40));

      dragTable([B[0] + 120 + by[0], B[1] + 10 + by[1]], [-by[0], -by[1]]);
      const expected = points.map((p, i) => (i === 1 || i === 2 ? { x: p.x + 40, y: p.y } : p));
      saved((tables, c) => {
        expect(table(tables, TABLE.B).y, 'B moved away again').to.be.greaterThan(400);
        expect(c.points, 'the shape plus the drag, with no detour corners left').to.deep.equal(expected);
      });
    });
  });

  it('leaves from the far side of its table when another table is dragged up against the end', () => {
    shapedConnector();
    saved((_t, c) => expect(c.bends, 'manual shape').to.not.equal(undefined));
    // B to 10 px right of A, across A's `id` row: no room for the stub on A's right.
    dragTable([B[0] + 120, B[1] + 10], [280 - B[0], 120 - B[1]]);
    saved((tables, c) => {
      const b = table(tables, TABLE.B);
      expect(b.x - (A[0] + 240), 'B up against A').to.be.within(0, 20);
      expect(passesThrough(c.points as Pt[], b), 'route passes through B').to.equal(false);
      expect((c.points as Pt[])[0], 'leaves A by its left edge').to.deep.equal({ x: A[0], y: 150 });
    });
  });
});
