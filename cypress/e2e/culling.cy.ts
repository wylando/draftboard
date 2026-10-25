const rect = (id: string, name: string, x: number) => ({
  id,
  type: 'rect',
  name,
  parentId: null,
  x,
  y: 100,
  width: 100,
  height: 100,
  rotation: 0,
  fill: '#cccccc',
  stroke: '#000000',
  strokeWidth: 1,
  opacity: 1,
  visible: true,
  cornerRadius: 0,
});

const node = (id: string) => cy.get(`[data-testid=node-${id}]`);

/** Pans the view by wheel, as a trackpad scroll would. */
const panByWheel = (deltaX: number) =>
  cy.get('[data-testid=canvas]').then(($c) => {
    const win = $c[0]!.ownerDocument.defaultView!;
    $c[0]!.dispatchEvent(new win.WheelEvent('wheel', { deltaX, bubbles: true, cancelable: true }));
  });

describe('Large boards: only layers near the view are mounted', () => {
  beforeEach(() => {
    const workspace = {
      version: 1,
      activeId: 'b1',
      boards: [{ id: 'b1', name: 'Board 1', nodes: [rect('near', 'Near', 100), rect('other', 'Other', 300), rect('far', 'Far', 20000)] }],
    };
    cy.visit('/', { onBeforeLoad: (win) => win.localStorage.setItem('draftboard:workspace:v1', JSON.stringify(workspace)) });
    node('near').should('exist');
  });

  it('mounts a far layer only once the view reaches it', () => {
    node('far').should('not.exist');
    panByWheel(19900);
    node('far').should('exist');
    node('near').should('not.exist');
  });

  it('keeps a selected layer mounted after panning away', () => {
    cy.get('[data-testid=layers-panel]').contains('Near').click();
    panByWheel(19900);
    node('far').should('exist');
    node('other').should('not.exist');
    node('near').should('exist');
  });
});
