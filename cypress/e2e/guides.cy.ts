const wheel = (deltaX: number, deltaY: number) =>
  cy.get('[data-testid=canvas]').then(($c) => {
    const win = $c[0]!.ownerDocument.defaultView!;
    $c[0]!.dispatchEvent(new win.WheelEvent('wheel', { deltaX, deltaY, bubbles: true, cancelable: true }));
  });

const guide = (axis: 'x' | 'y', at: number) => cy.get(`[data-testid=snap-guide][data-axis=${axis}][data-at="${at}"]`);

/** Screen point for a world point, read from the world layer's current transform. */
const toScreen = (x: number, y: number) =>
  cy.get('[data-testid=world]').then(($w) => {
    const m = /translate\(([-\d.]+) ([-\d.]+)\) scale\(([-\d.]+)\)/.exec($w.attr('transform') ?? '');
    if (!m) throw new Error('world transform not found');
    const [tx, ty, zoom] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return [x * zoom + tx, y * zoom + ty] as [number, number];
  });

describe('Smart guides', () => {
  beforeEach(() => {
    cy.visitEmpty();
    cy.drawShape('rect', [100, 100], [200, 200]);
    // Selected after drawing: 300..400 × 100..200.
    cy.drawShape('rect', [300, 100], [400, 200]);
  });

  it('snaps a moved layer to nearby edges and shows guides only while dragging', () => {
    // Unsnapped, this lands the rect at (204, 103).
    cy.canvasPointer('pointerdown', [350, 150]);
    cy.canvasPointer('pointermove', [300, 152]);
    cy.canvasPointer('pointermove', [254, 153]);
    // One × at each end of both rects' edges on the line.
    guide('x', 200).find('path').should('have.length', 4);
    guide('y', 100).should('exist');
    cy.canvasPointer('pointerup', [254, 153]);

    cy.prop('x').should('have.value', '200');
    cy.prop('y').should('have.value', '100');
    cy.get('[data-testid=snap-guide]').should('not.exist');
  });

  it('skips snapping while Ctrl is held', () => {
    // Ctrl alone, because that is the binding on Linux CI; ⌘ goes through the same check.
    cy.canvasPointer('pointerdown', [350, 150]);
    cy.canvasPointer('pointermove', [300, 152], { ctrlKey: true });
    cy.canvasPointer('pointermove', [254, 153], { ctrlKey: true });
    cy.get('[data-testid=snap-guide]').should('not.exist');
    cy.canvasPointer('pointerup', [254, 153], { ctrlKey: true });

    cy.prop('x').should('have.value', '204');
    cy.prop('y').should('have.value', '103');
    // Ctrl was pressed after the press, so it didn't deep-select or change the selection.
    cy.prop('name').should('have.value', 'Rectangle 2');
  });

  it('keeps the snap distance at 6 screen px when zoomed in', () => {
    cy.get('[data-testid=zoom-in]').click();
    cy.get('[data-testid=zoom-level]').should('have.text', '200%');
    // Zooming about the canvas center can push the rects off screen, and only layers on
    // screen are snap targets: scroll so the world origin sits at (20, 20).
    toScreen(0, 0).then(([ox, oy]) => wheel(ox - 20, oy - 20));
    cy.get('[data-testid=world]').should('have.attr', 'transform', 'translate(20 20) scale(2)');

    // 4 world px from the other rect's edge is 8 screen px at 200%: too far to snap.
    toScreen(350, 150).then((from) => {
      toScreen(254, 150).then((to) => cy.canvasDrag(from, to));
    });
    cy.prop('x').should('have.value', '204');

    // 2 world px is 4 screen px: close enough.
    toScreen(254, 150).then((from) => {
      toScreen(252, 150).then((to) => cy.canvasDrag(from, to));
    });
    cy.prop('x').should('have.value', '200');
  });

  it('ignores hidden layers', () => {
    // The eye button only shows on row hover, hence force.
    cy.contains('[data-testid=layers-panel] [role=treeitem]', 'Rectangle 1').find('[aria-label="Hide layer"]').click({ force: true });
    cy.get('[data-testid=layers-panel]').contains('Rectangle 2').click();
    cy.canvasDrag([350, 150], [254, 153]);
    cy.prop('x').should('have.value', '204');
    cy.prop('y').should('have.value', '103');
  });

  it('snaps to a layer scrolled into view mid-drag', () => {
    // Scroll rect 1 off the left edge, leaving rect 2 at screen x 50..150.
    wheel(250, 0);
    cy.get('[data-testid=world]').should('have.attr', 'transform').and('contain', 'translate(-250 0)');
    cy.canvasPointer('pointerdown', [100, 150]);
    cy.canvasPointer('pointermove', [90, 152]);
    wheel(-250, 0);
    cy.get('[data-testid=world]').should('have.attr', 'transform').and('contain', 'translate(0 0)');
    // Unsnapped, this lands the rect at (204, 103), 4 px from rect 1, which is on screen again.
    cy.canvasPointer('pointermove', [254, 153]);
    cy.canvasPointer('pointerup', [254, 153]);
    cy.prop('x').should('have.value', '200');
  });

  it('a cancelled pointer ends the gesture: guides clear, a move still drops, a click places nothing', () => {
    cy.drawShape('frame', [500, 300], [700, 450]);
    cy.canvasClick([350, 150]);
    cy.prop('name').should('have.value', 'Rectangle 2');
    cy.canvasPointer('pointerdown', [350, 150]);
    cy.canvasPointer('pointermove', [600, 375]);
    guide('x', 600).should('exist');
    cy.canvasPointer('pointercancel', [0, 0]);
    cy.get('[data-testid=snap-guide]').should('not.exist');
    // Dropped where the pointer last was, inside the frame, so it isn't left clipped out of sight.
    cy.contains('[data-testid=layers-panel] [role=treeitem]', 'Rectangle 2').should('have.attr', 'aria-level', '2');
    // The move has ended: further pointer movement doesn't drag the rect (checked after the later render below).
    cy.canvasPointer('pointermove', [400, 400]);

    cy.get('[data-testid=tool-rect]').click();
    cy.get('[data-testid=canvas]').should('have.attr', 'data-tool', 'rect');
    cy.canvasPointer('pointerdown', [800, 600]);
    cy.canvasPointer('pointercancel', [0, 0]);
    // A later render proves the cancel has been handled before checking nothing came of it.
    cy.get('[data-testid=zoom-in]').click();
    cy.get('[data-testid=zoom-level]').should('have.text', '200%');
    cy.get('[data-node-type=rect]').should('have.length', 2);
    cy.get('[data-testid=canvas]').should('have.attr', 'data-tool', 'rect');
    cy.prop('x').should('have.value', '550');
  });

  it('snaps to a gap already used in the row, and marks every equal gap', () => {
    // Rect 1 and rect 2 sit 100 apart; this one starts 60 right of rect 2.
    cy.drawShape('rect', [460, 100], [560, 200]);
    cy.canvasPointer('pointerdown', [510, 150]);
    cy.canvasPointer('pointermove', [530, 150]);
    // An 80 px gap matches nothing, so nothing is marked yet (checked once that position has rendered).
    cy.prop('x').should('have.value', '480');
    cy.get('[data-testid=spacing-guide]').should('not.exist');
    // Unsnapped, the gap to rect 2 would be 104.
    cy.canvasPointer('pointermove', [554, 150]);
    cy.get('[data-testid=spacing-guide][data-axis=x][data-distance="100"]').find('[data-testid=spacing-gap]').should('have.length', 2);
    cy.canvasPointer('pointerup', [554, 150]);
    cy.prop('x').should('have.value', '500');
    cy.get('[data-testid=spacing-guide]').should('not.exist');
  });

  it('centers a layer between its neighbours in a column', () => {
    // A column: rect 1 (y 100..200) and this rect (y 300..400), then a 40 px square to drop between them.
    cy.drawShape('rect', [100, 300], [200, 400]);
    cy.drawShape('rect', [600, 600], [640, 640]);
    // Unsnapped, the square lands at y 233; centered, at 230 with 30 above and below.
    cy.canvasDrag([620, 620], [150, 253]);
    cy.prop('y').should('have.value', '230');
  });

  it('snaps the dragged edge while resizing', () => {
    // Unsnapped, the bottom edge would stop at 196.
    cy.canvasDrag([400, 200], [420, 196]);
    cy.prop('w').should('have.value', '120');
    cy.prop('h').should('have.value', '100');
  });

  it('snaps both corners while drawing, without pulling a shape into a frame it starts beside', () => {
    cy.drawShape('frame', [500, 300], [700, 450]);
    // Starts 4 px left of the frame's edge (500) and ends 4 px right of rect 1's (200).
    cy.drawShape('rect', [496, 420], [204, 520]);
    cy.prop('x').should('have.value', '200');
    cy.prop('w').should('have.value', '300');
    cy.prop('h').should('have.value', '100');
    // The press was outside the frame, so snapping its corner onto the edge mustn't nest it.
    cy.contains('[data-testid=layers-panel] [role=treeitem]', 'Rectangle 3').should('have.attr', 'aria-level', '1');

    // Both corners of this narrow rect are within reach of rect 1's edge at 200; snapping both would leave it 0 wide.
    cy.drawShape('rect', [197, 600], [205, 700]);
    cy.prop('x').should('have.value', '197');
    cy.prop('w').should('have.value', '3');
    // Pressed right on the edge, the start is already on the line, so the end mustn't snap there either.
    cy.drawShape('rect', [200, 720], [203, 780]);
    cy.prop('x').should('have.value', '200');
    cy.prop('w').should('have.value', '3');
  });

  it('can be turned off in Settings, and stays off after a reload', () => {
    cy.get('[data-testid=open-settings]').click();
    cy.get('[data-testid=nav-canvas]').click();
    cy.get('[data-testid=snap-to-layers]').should('have.attr', 'data-state', 'checked').click();
    cy.get('[data-testid=snap-to-layers]').should('have.attr', 'data-state', 'unchecked');
    cy.window().its('localStorage').invoke('getItem', 'draftboard:preferences:v1').should('contain', '"snapToLayers":false');
    // Document saves are debounced; the drag below needs the rects to survive the reload.
    cy.window().its('localStorage').invoke('getItem', 'draftboard:document:v1').should('contain', 'Rectangle 2');

    cy.reload();
    cy.get('[data-testid=nav-canvas]').click();
    cy.get('[data-testid=snap-to-layers]').should('have.attr', 'data-state', 'unchecked');
    cy.get('[data-testid=close-settings]').click();
    cy.get('[data-testid=layers-panel]').contains('Rectangle 2').click();
    cy.canvasDrag([350, 150], [254, 153]);
    cy.prop('x').should('have.value', '204');
    cy.prop('y').should('have.value', '103');
  });
});

const base = { rotation: 0, fill: '#d9d9d9', stroke: '#000000', strokeWidth: 0, opacity: 1, visible: true, cornerRadius: 0 };

const visitWith = (nodes: object[]) =>
  cy.visit('/', {
    onBeforeLoad: (win) => {
      win.localStorage.clear();
      win.localStorage.setItem('draftboard:document:v1', JSON.stringify({ version: 1, nodes }));
    },
  });

describe('Smart guides on nested layers', () => {
  it('only reuses gaps between true neighbours, not across a frame to its child', () => {
    visitWith([
      { ...base, id: 'f', type: 'frame', name: 'Frame 1', parentId: null, x: 100, y: 300, width: 300, height: 100, fill: '#ffffff' },
      { ...base, id: 'c', type: 'rect', name: 'Child', parentId: 'f', x: 300, y: 300, width: 50, height: 100 },
      { ...base, id: 'y', type: 'rect', name: 'Neighbour', parentId: null, x: 450, y: 300, width: 50, height: 100 },
      { ...base, id: 'm', type: 'rect', name: 'Mover', parentId: null, x: 700, y: 300, width: 50, height: 100 },
    ]);
    cy.get('[data-testid=layers-panel]').should('contain', 'Mover');
    // The real gap is Frame 1 → Neighbour, 50. Child → Neighbour (100) crosses the frame's edge,
    // so Mover, landing 103 past Neighbour, must not snap to 100.
    cy.canvasDrag([725, 350], [628, 350]);
    cy.prop('x').should('have.value', '603');
    // Control: the real 50 px gap does snap, so the miss above isn't snapping being off.
    cy.canvasDrag([628, 350], [578, 350]);
    cy.prop('x').should('have.value', '550');
  });

  it('reuses gaps between siblings inside a frame', () => {
    // The frame spans the whole row; it encloses the gaps rather than blocking them.
    visitWith([
      { ...base, id: 'f', type: 'frame', name: 'Frame 1', parentId: null, x: 50, y: 300, width: 850, height: 200, fill: '#ffffff' },
      { ...base, id: 'a', type: 'rect', name: 'A', parentId: 'f', x: 100, y: 350, width: 100, height: 100 },
      { ...base, id: 'b', type: 'rect', name: 'B', parentId: 'f', x: 300, y: 350, width: 100, height: 100 },
      { ...base, id: 'm', type: 'rect', name: 'M', parentId: 'f', x: 600, y: 350, width: 100, height: 100 },
    ]);
    cy.get('[data-testid=layers-panel]').should('contain', 'M');
    // Unsnapped, M lands 104 past B; A → B is 100.
    cy.canvasDrag([650, 400], [554, 400]);
    cy.prop('x').should('have.value', '500');
  });

  it('ignores a layer clipped out of sight by its frame', () => {
    const nodes = [
      { ...base, id: 'f', type: 'frame', name: 'Frame 1', parentId: null, x: 100, y: 300, width: 200, height: 200, fill: '#ffffff' },
      // Wholly outside its frame, so the frame clips it away.
      { ...base, id: 'c', type: 'rect', name: 'Clipped', parentId: 'f', x: 400, y: 300, width: 50, height: 50 },
      { ...base, id: 'm', type: 'rect', name: 'Mover', parentId: null, x: 600, y: 600, width: 100, height: 100 },
    ];
    visitWith(nodes);
    cy.get('[data-testid=layers-panel]').should('contain', 'Clipped');

    // Unsnapped, Mover's left edge lands 4 px from Clipped's right edge (450).
    cy.canvasDrag([650, 650], [504, 650]);
    cy.prop('x').should('have.value', '454');
  });
});
