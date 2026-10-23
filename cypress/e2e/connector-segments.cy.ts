// A module, so its helpers don't clash with other specs' in the shared spec scope.
export {};

interface Pt {
  x: number;
  y: number;
}
interface SavedConnector {
  type: string;
  points: Pt[];
  /** The manual shape; absent while the route is automatic. */
  bends?: unknown;
}

const placeTable = (at: [number, number]) => {
  cy.pressKey('d', { code: 'KeyD' });
  cy.get('[data-testid=canvas]').should('have.attr', 'data-tool', 'table');
  cy.canvasClick(at);
  cy.get('[data-testid=canvas]').should('have.attr', 'data-tool', 'select');
};
const undo = () => cy.pressKey('z', { code: 'KeyZ', metaKey: true });

// A's `id` row is centred at y 150 and its right edge is x 270; C sits lower, so its `id` row is at y 350 and its
// left edge is x 690. The automatic route is horizontal, one vertical jog, horizontal.
const A: [number, number] = [30, 100];
const C: [number, number] = [690, 300];
const linked = () => {
  placeTable(A);
  placeTable(C);
  cy.pressKey('c', { code: 'KeyC' });
  cy.get('[data-testid=canvas]').should('have.attr', 'data-tool', 'connector');
  cy.canvasDrag([A[0] + 50, 150], [C[0] + 50, 350]);
  cy.get('[data-node-type=connector]').should('have.length', 1);
};

const read = (win: Cypress.AUTWindow): SavedConnector | undefined => {
  const raw = win.localStorage.getItem('draftboard:document:v1');
  const nodes = raw ? (JSON.parse(raw) as { nodes: SavedConnector[] }).nodes : [];
  return nodes.find((n) => n.type === 'connector');
};

/** Retries `check` against the saved connector until the debounced save has caught up. */
const saved = (check: (connector: SavedConnector) => void) =>
  cy.window().should((win) => {
    const connector = read(win);
    expect(connector, 'saved connector').to.not.equal(undefined);
    check(connector as SavedConnector);
  });

const savedTables = (check: (tables: Array<{ x: number; y: number }>) => void) =>
  cy.window().should((win) => {
    const raw = win.localStorage.getItem('draftboard:document:v1');
    const nodes = raw ? (JSON.parse(raw) as { nodes: Array<{ type: string; x: number; y: number }> }).nodes : [];
    check(nodes.filter((n) => n.type === 'table').sort((p, q) => p.x - q.x));
  });

/** The saved connector, once its route has the expected elbow (at least three segments). */
const elbow = () =>
  saved((c) => expect(c.points.length, 'route points').to.be.greaterThan(3)).then((win) => read(win as unknown as Cypress.AUTWindow) as SavedConnector);

/** Index of the vertical interior segment: the one between two points that share an x. */
const verticalSegment = (points: Pt[]) => points.findIndex((p, i) => i > 0 && i < points.length - 2 && p.x === (points[i + 1] as Pt).x);

const handle = (index: number) => cy.get(`[data-connector-segment="${index}"]`);
/** Canvas-relative centre of a handle, measured once so the moves don't chase the handle as it follows the pointer. */
const centre = (index: number) =>
  cy.get('[data-testid=canvas]').then(($canvas) =>
    handle(index).then(($h) => {
      const c = $canvas[0]!.getBoundingClientRect();
      const h = $h[0]!.getBoundingClientRect();
      return [h.left + h.width / 2 - c.left, h.top + h.height / 2 - c.top] as [number, number];
    }),
  );
const dragHandle = (index: number, by: [number, number], release = true) =>
  centre(index).then(([x, y]) => {
    cy.canvasPointer('pointerdown', [x, y]);
    cy.canvasPointer('pointermove', [x + by[0] / 2, y + by[1] / 2]);
    cy.canvasPointer('pointermove', [x + by[0], y + by[1]]);
    if (release) cy.canvasPointer('pointerup', [x + by[0], y + by[1]]);
    return cy.wrap([x, y] as [number, number], { log: false });
  });

describe('Reshaping an elbow connector by dragging its segments', () => {
  beforeEach(() => cy.visitEmpty());

  it('drags the middle segment sideways and saves the manual shape', () => {
    linked();
    elbow().then((before) => {
      const v = verticalSegment(before.points);
      expect(v, 'a vertical interior segment').to.be.greaterThan(0);
      dragHandle(v, [60, 0]);
      saved((c) => {
        expect((c.points[v] as Pt).x).to.be.closeTo((before.points[v] as Pt).x + 60, 1);
        expect((c.points[v + 1] as Pt).x).to.be.closeTo((before.points[v] as Pt).x + 60, 1);
        expect(c.bends, 'manual shape').to.not.equal(undefined);
      });
    });
  });

  it('undoes a drag in one step', () => {
    linked();
    elbow().then((before) => {
      dragHandle(verticalSegment(before.points), [60, 0]);
      saved((c) => expect(c.bends, 'manual shape').to.not.equal(undefined));
      undo();
      saved((c) => {
        expect(c.points).to.deep.equal(before.points);
        expect(c.bends, 'manual shape').to.equal(undefined);
      });
    });
  });

  it('remembers the shape when a connected table moves, while the end follows it', () => {
    linked();
    elbow().then((before) => {
      const v = verticalSegment(before.points);
      const moved = (before.points[v] as Pt).x + 60;
      const lastY = (before.points[before.points.length - 1] as Pt).y;
      dragHandle(v, [60, 0]);
      saved((c) => expect(c.bends, 'manual shape').to.not.equal(undefined));

      // Down 40 by the header; the connector's end leg should follow, the dragged segment should not.
      cy.canvasDrag([C[0] + 120, C[1] + 10], [C[0] + 120, C[1] + 50]);
      saved((c) => {
        expect((c.points[c.points.length - 1] as Pt).y).to.be.closeTo(lastY + 40, 1);
        const seg = c.points.findIndex((p, i) => i < c.points.length - 1 && p.x === (c.points[i + 1] as Pt).x && p.y !== (c.points[i + 1] as Pt).y);
        expect((c.points[seg] as Pt).x).to.be.closeTo(moved, 1);
      });
    });
  });

  it('moves the manual shape along when the tables and the connector are dragged together', () => {
    linked();
    elbow().then((before) => {
      dragHandle(verticalSegment(before.points), [60, 0]);
      saved((c) => expect(c.bends, 'manual shape').to.not.equal(undefined));
      cy.window().then((win) => {
        const shaped = read(win) as SavedConnector;
        const bends = shaped.bends as Pt[];

        cy.pressKey('a', { code: 'KeyA', metaKey: true });
        // The drag reads the selection when it starts, so wait until all three layers are selected.
        cy.get('[role=treeitem][aria-selected=true]').should('have.length', 3);
        cy.canvasDrag([A[0] + 120, A[1] + 10], [A[0] + 220, A[1] + 60]);
        // Both tables went along, so the shape has to be moved by the same amount, not re-derived.
        savedTables((tables) => expect(tables.map((t) => [t.x, t.y])).to.deep.equal([[A[0] + 100, A[1] + 50], [C[0] + 100, C[1] + 50]]));
        saved((c) => {
          const now = c.bends as Pt[];
          expect(now, 'manual shape').to.have.length(bends.length);
          bends.forEach((b, i) => expect(now[i]).to.deep.equal({ x: b.x + 100, y: b.y + 50 }));
        });
      });
    });
  });

  it('resets to the automatic route, as one undo step', () => {
    linked();
    cy.get('[data-testid=connector-reset-route]').should('be.disabled');
    elbow().then((before) => {
      dragHandle(verticalSegment(before.points), [60, 0]);
      saved((c) => expect(c.bends, 'manual shape').to.not.equal(undefined));
      cy.get('[data-testid=connector-reset-route]').should('be.enabled').click();
      saved((c) => {
        expect(c.points).to.deep.equal(before.points);
        expect(c.bends, 'manual shape').to.equal(undefined);
      });
      cy.get('[data-testid=connector-reset-route]').should('be.disabled');

      undo();
      saved((c) => expect(c.bends, 'manual shape').to.not.equal(undefined));
      cy.get('[data-testid=connector-reset-route]').should('be.enabled');
    });
  });

  it('treats a drag along the segment as no change: no manual shape, no history entry', () => {
    linked();
    elbow().then((before) => {
      dragHandle(verticalSegment(before.points), [0, 30]);
      // Undo would be a no-op if the drag had left an empty step; here it removes the connector that was just drawn.
      undo();
      cy.get('[data-node-type=connector]').should('have.length', 0);
    });
  });

  it('hides segment handles that are too short to grab at low zoom', () => {
    linked();
    cy.get('[data-connector-segment]').should('exist');
    for (let i = 0; i < 3; i++) cy.get('[data-testid=zoom-out]').click();
    cy.get('[data-testid=zoom-level]').should('contain', '13%');
    cy.get('[data-connector-segment]').should('not.exist');
    for (let i = 0; i < 3; i++) cy.get('[data-testid=zoom-in]').click();
    cy.get('[data-connector-segment]').should('exist');
  });

  it('stops following the pointer once Escape has dropped the selection', () => {
    linked();
    elbow().then((before) => {
      const v = verticalSegment(before.points);
      const x0 = (before.points[v] as Pt).x;
      dragHandle(v, [30, 0], false).then(([x, y]) => {
        saved((c) => expect((c.points[v] as Pt).x).to.be.closeTo(x0 + 30, 1));
        cy.pressKey('Escape');
        cy.get('[role=treeitem][aria-selected=true]').should('not.exist');
        cy.canvasPointer('pointermove', [x + 80, y]);
        cy.canvasPointer('pointerup', [x + 80, y]);
        // Two frames, so a (wrongly) applied move has been rendered before looking.
        cy.window().then((win) => new Promise<void>((done) => win.requestAnimationFrame(() => win.requestAnimationFrame(() => done()))));
        // Still where it was when the drag was dropped.
        cy.get('[data-testid=connector-line]').should(($l) => {
          const xs = String($l.attr('data-route')).split(' ').map((p) => Number(p.split(',')[0]));
          expect(xs).to.include(x0 + 30);
          expect(xs).to.not.include(x0 + 80);
        });
      });
    });
  });

  it('keeps Reset route usable on a straight connector that remembers bends, and keeps focus on the routing control', () => {
    linked();
    elbow().then((before) => {
      dragHandle(verticalSegment(before.points), [60, 0]);
      saved((c) => expect(c.bends, 'manual shape').to.not.equal(undefined));
      cy.get('[data-testid=routing-straight]').click();
      cy.get('[data-testid=connector-reset-route]').should('be.enabled').click();
      saved((c) => expect(c.bends, 'manual shape').to.equal(undefined));
      cy.get('[data-testid=routing-straight]').should('have.focus');
    });
  });

  it('shows no segment handles on a straight connector', () => {
    linked();
    cy.get('[data-connector-segment]').should('exist');
    cy.get('[data-testid=routing-straight]').click();
    cy.get('[data-testid=routing-straight]').should('have.attr', 'data-state', 'on');
    cy.get('[data-connector-segment]').should('not.exist');
  });
});
