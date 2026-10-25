const layerRow = (name: string) => cy.contains('[data-testid=layers-panel] [role=treeitem]', name);
const treeRows = () => cy.get('[data-testid=layers-panel] [role=treeitem]');

/** HTML5 drag and drop between two layer rows. `at` picks the drop zone on the target row. */
function dragLayer(source: string, target: string, at: 'top' | 'center' | 'bottom', expected: string) {
  const dataTransfer = new DataTransfer();
  layerRow(source).trigger('dragstart', { dataTransfer });
  layerRow(source).should('have.attr', 'data-dragging', 'true');
  layerRow(target).trigger('dragover', at, { dataTransfer });
  layerRow(target).should('have.attr', 'data-drop', expected);
  layerRow(target).trigger('drop', at, { dataTransfer });
  layerRow(source).trigger('dragend', { dataTransfer });
}

describe('Layers tree', () => {
  beforeEach(() => {
    cy.visitEmpty();
    cy.drawShape('frame', [50, 50], [450, 350]);
    cy.drawShape('rect', [100, 100], [200, 200]);
    cy.drawShape('ellipse', [500, 100], [560, 160]);
  });

  it('indents children under their parent with one guide per level', () => {
    layerRow('Frame 1').should('have.attr', 'data-depth', '0');
    layerRow('Frame 1').find('[data-testid=layer-guide]').should('not.exist');
    layerRow('Rectangle 1').should('have.attr', 'data-depth', '1').find('[data-testid=layer-guide]').should('have.length', 1);
    // Top of the z-order first: the ellipse was drawn last, at the top level.
    treeRows().first().should('contain', 'Ellipse 1');
  });

  it('collapses and expands a container', () => {
    layerRow('Frame 1').find('button[aria-expanded]').click();
    layerRow('Frame 1').should('have.attr', 'aria-expanded', 'false');
    cy.get('[data-testid=layers-panel]').should('not.contain', 'Rectangle 1');
    layerRow('Frame 1').find('button[aria-expanded]').click();
    layerRow('Rectangle 1').should('be.visible');
  });

  it('reveals a collapsed layer when it is selected on the canvas', () => {
    layerRow('Frame 1').find('button[aria-expanded]').click();
    cy.get('[data-testid=layers-panel]').should('not.contain', 'Rectangle 1');
    cy.canvasClick([150, 150]);
    layerRow('Rectangle 1').should('have.attr', 'aria-selected', 'true');
  });

  it('marks layers inside a selected container', () => {
    layerRow('Frame 1').click();
    layerRow('Frame 1').should('have.attr', 'aria-selected', 'true');
    layerRow('Rectangle 1').should('have.attr', 'aria-selected', 'false').and('have.attr', 'data-in-selection', 'true');
    layerRow('Ellipse 1').should('not.have.attr', 'data-in-selection');
  });

  it('drags a layer onto a frame to put it inside', () => {
    dragLayer('Ellipse 1', 'Frame 1', 'center', 'inside');
    layerRow('Ellipse 1').should('have.attr', 'aria-level', '2');
    // Dropped inside = top of the frame's children, so it lists first under the frame.
    treeRows().eq(1).should('contain', 'Ellipse 1');
    cy.pressKey('z', { metaKey: true });
    layerRow('Ellipse 1').should('have.attr', 'aria-level', '1');
  });

  it('drags a child above its frame to take it out', () => {
    dragLayer('Rectangle 1', 'Frame 1', 'top', 'above');
    layerRow('Rectangle 1').should('have.attr', 'aria-level', '1');
    treeRows().eq(1).should('contain', 'Rectangle 1');
    treeRows().eq(2).should('contain', 'Frame 1');
  });

  it('reorders top-level layers', () => {
    dragLayer('Ellipse 1', 'Frame 1', 'bottom', 'below');
    treeRows().last().should('contain', 'Ellipse 1');
  });

  it('will not drop a frame into its own child', () => {
    const dataTransfer = new DataTransfer();
    layerRow('Frame 1').trigger('dragstart', { dataTransfer });
    layerRow('Frame 1').should('have.attr', 'data-dragging', 'true');
    layerRow('Rectangle 1').trigger('dragover', 'center', { dataTransfer });
    layerRow('Rectangle 1').should('not.have.attr', 'data-drop');
    layerRow('Rectangle 1').trigger('drop', 'center', { dataTransfer });
    layerRow('Frame 1').trigger('dragend', { dataTransfer });
    // The drag ending has rendered, so the drop has too: the tree is unchanged.
    layerRow('Frame 1').should('not.have.attr', 'data-dragging');
    layerRow('Frame 1').should('have.attr', 'aria-level', '1');
    layerRow('Rectangle 1').should('have.attr', 'aria-level', '2');
  });

  it('renames a layer, but never to a name another layer has, ignoring case', () => {
    const renameInput = () => cy.get('[data-testid=layers-panel] input');
    const nameError = (panel: string) => cy.get(`[data-testid=${panel}] [role=alert]`);
    layerRow('Ellipse 1').dblclick();
    renameInput().clear().type('Rectangle 1{enter}');
    // The input closes in the same render that would apply the rename.
    renameInput().should('not.exist');
    layerRow('Ellipse 1').should('exist');
    nameError('layers-panel').should('contain', 'Rectangle 1');

    cy.prop('name').clear().type('frame 1{enter}');
    cy.prop('name').should('have.value', 'Ellipse 1');
    nameError('properties-panel').should('contain', 'frame 1');
    // The refusal is tied to the field for assistive technology.
    cy.prop('name').should('have.attr', 'aria-invalid', 'true');
    nameError('properties-panel')
      .invoke('attr', 'id')
      .then((id) => cy.prop('name').should('have.attr', 'aria-describedby').and('contain', id));

    // Changing the case of a layer's own name is not a clash.
    layerRow('Ellipse 1').dblclick();
    renameInput().clear().type('ELLIPSE 1{enter}');
    layerRow('ELLIPSE 1').should('exist');
    cy.prop('name').should('have.value', 'ELLIPSE 1');
    nameError('layers-panel').should('not.exist');
  });

  it('lists no row for a connector, only for the layers it links', () => {
    cy.pressKey('c', { code: 'KeyC' });
    cy.get('[data-testid=canvas]').should('have.attr', 'data-tool', 'connector');
    cy.canvasDrag([530, 130], [150, 150]);
    cy.get('[data-node-type=connector]').should('have.length', 1);
    layerRow('Rectangle 1').should('exist');
    layerRow('Ellipse 1').should('exist');
    treeRows().should('have.length', 3);
    cy.get('[data-node-type=connector]')
      .invoke('attr', 'data-node-id')
      .then((id) => cy.get(`[data-testid=layer-${id}]`).should('not.exist'));
  });
});
