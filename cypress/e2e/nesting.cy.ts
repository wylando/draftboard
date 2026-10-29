// Layers rows expose the tree through ARIA: aria-level 1 = top level.
const layer = (name: string) => cy.contains('[data-testid=layers-panel] [role=treeitem]', name);
const MOD = { metaKey: true, ctrlKey: true };

describe('Frames contain layers', () => {
  beforeEach(() => {
    cy.visitEmpty();
    cy.drawShape('frame', [50, 50], [450, 350]);
    cy.drawShape('rect', [100, 100], [200, 200]);
  });

  it('a shape drawn on a frame goes inside it', () => {
    layer('Frame 1').should('have.attr', 'aria-level', '1').and('have.attr', 'aria-expanded', 'true');
    layer('Rectangle 1').should('have.attr', 'aria-level', '2');
  });

  it('clicking a child on the canvas selects the child, not the frame', () => {
    cy.canvasClick([300, 300]);
    cy.prop('name').should('have.value', 'Frame 1');
    cy.canvasClick([150, 150]);
    cy.prop('name').should('have.value', 'Rectangle 1');
  });

  it('moving the frame moves its children', () => {
    cy.canvasClick([300, 300]);
    cy.prop('name').should('have.value', 'Frame 1');
    cy.canvasDrag([300, 300], [350, 320]);
    cy.prop('x').should('have.value', '100');
    layer('Rectangle 1').click();
    cy.prop('x').should('have.value', '150');
    cy.prop('y').should('have.value', '120');
  });

  it('moving the frame with the X field moves its children too', () => {
    layer('Frame 1').click();
    cy.prop('name').should('have.value', 'Frame 1');
    cy.prop('x').clear().type('0{enter}');
    layer('Rectangle 1').click();
    cy.prop('x').should('have.value', '50');
  });

  it('dragging a child out of the frame takes it out, and undo puts it back', () => {
    cy.canvasDrag([150, 150], [550, 150]);
    layer('Rectangle 1').should('have.attr', 'aria-level', '1');
    cy.pressKey('z', { metaKey: true });
    layer('Rectangle 1').should('have.attr', 'aria-level', '2');
    cy.prop('x').should('have.value', '100');
  });

  it('dragging a shape onto a frame puts it inside', () => {
    cy.drawShape('ellipse', [500, 100], [560, 160]);
    layer('Ellipse 1').should('have.attr', 'aria-level', '1');
    cy.canvasDrag([530, 130], [300, 250]);
    layer('Ellipse 1').should('have.attr', 'aria-level', '2');
  });

  it('rotating the frame turns its children about the frame center', () => {
    layer('Frame 1').click();
    cy.prop('name').should('have.value', 'Frame 1');
    cy.prop('rotation').clear().type('180{enter}');
    layer('Rectangle 1').click();
    // Frame center is (250, 200): the rect's center (150, 150) maps to (350, 250).
    cy.prop('rotation').should('have.value', '180');
    cy.prop('x').should('have.value', '300');
    cy.prop('y').should('have.value', '200');
  });

  it('deleting the frame deletes its children', () => {
    layer('Frame 1').click();
    cy.prop('name').should('have.value', 'Frame 1');
    cy.pressKey('Backspace');
    cy.get('[data-node-type]').should('not.exist');
  });
});

describe('Groups', () => {
  beforeEach(() => {
    cy.visitEmpty();
    cy.drawShape('rect', [100, 100], [200, 200]);
    cy.drawShape('rect', [300, 100], [400, 200]);
    cy.canvasDrag([50, 50], [450, 250]);
    cy.get('[data-testid=properties-panel]').should('contain', '2 layers selected');
    cy.pressKey('g', { code: 'KeyG', metaKey: true });
    cy.prop('name').should('have.value', 'Group 1');
  });

  it('Mod+G groups the selection; the group spans its layers', () => {
    cy.prop('x').should('have.value', '100');
    cy.prop('w').should('have.value', '300');
    cy.prop('rotation').should('not.exist');
    layer('Group 1').should('have.attr', 'aria-level', '1');
    layer('Rectangle 1').should('have.attr', 'aria-level', '2');
    layer('Rectangle 2').should('have.attr', 'aria-level', '2');
  });

  it('click selects the group, double-click selects inside, Mod+click goes straight in', () => {
    cy.canvasClick([700, 500]);
    cy.canvasClick([150, 150]);
    cy.prop('name').should('have.value', 'Group 1');
    cy.canvasDblClick([150, 150]);
    cy.prop('name').should('have.value', 'Rectangle 1');
    // With a layer inside selected, a plain click picks its siblings.
    cy.canvasClick([350, 150]);
    cy.prop('name').should('have.value', 'Rectangle 2');

    // Rectangle 1, not the Rectangle 2 still selected above, so this can't pass by leftover state.
    cy.canvasClick([700, 500]);
    cy.get('[data-testid=properties-panel]').should('contain', 'Select a layer');
    cy.canvasClick([150, 150], MOD);
    cy.prop('name').should('have.value', 'Rectangle 1');
  });

  it('dragging a layer inside the group stays in the group, which grows', () => {
    cy.canvasClick([150, 150], MOD);
    cy.prop('name').should('have.value', 'Rectangle 1');
    cy.canvasDrag([150, 150], [150, 350]);
    cy.prop('y').should('have.value', '300');
    layer('Rectangle 1').should('have.attr', 'aria-level', '2');
    layer('Group 1').click();
    cy.prop('h').should('have.value', '300');
  });

  it('resizing the group scales its layers', () => {
    // Group spans 100..400 × 100..200; drag the SE handle to double the width.
    cy.canvasDrag([400, 200], [700, 200]);
    cy.prop('w').should('have.value', '600');
    layer('Rectangle 2').click();
    cy.prop('x').should('have.value', '500');
    cy.prop('w').should('have.value', '200');
  });

  it('Mod+Shift+G ungroups and keeps the layers in place', () => {
    cy.pressKey('g', { code: 'KeyG', metaKey: true, shiftKey: true });
    cy.get('[data-node-type=group]').should('not.exist');
    cy.get('[data-testid=properties-panel]').should('contain', '2 layers selected');
    layer('Rectangle 1').should('have.attr', 'aria-level', '1');
    cy.pressKey('z', { metaKey: true });
    layer('Group 1').should('exist');
  });

  it('nudge, duplicate and delete act on the whole group', () => {
    cy.pressKey('ArrowRight', { shiftKey: true });
    cy.prop('x').should('have.value', '110');
    cy.pressKey('d', { code: 'KeyD', metaKey: true });
    cy.get('[data-node-type=group]').should('have.length', 2);
    cy.get('[data-node-type=rect]').should('have.length', 4);
    cy.pressKey('Backspace');
    cy.get('[data-node-type=group]').should('have.length', 1);
    cy.get('[data-node-type=rect]').should('have.length', 2);
  });

  it('a group whose last layer is deleted disappears', () => {
    cy.canvasClick([150, 150], MOD);
    cy.prop('name').should('have.value', 'Rectangle 1');
    cy.pressKey('Backspace');
    cy.canvasClick([350, 150], MOD);
    cy.prop('name').should('have.value', 'Rectangle 2');
    cy.pressKey('Backspace');
    cy.get('[data-node-type=group]').should('not.exist');
    cy.get('[data-testid=layers-panel]').should('not.contain', 'Group 1');
  });

  it('groups survive a reload', () => {
    cy.window().its('localStorage').invoke('getItem', 'draftboard:workspace:v1').should('contain', '"group"');
    cy.reload();
    layer('Group 1').should('exist');
    layer('Rectangle 1').should('have.attr', 'aria-level', '2');
  });
});
