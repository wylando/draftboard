import { seedWorkspace } from '../support/workspace';

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

describe('Large boards: only layers near the view are mounted', () => {
  beforeEach(() => {
    seedWorkspace([rect('near', 'Near', 100), rect('other', 'Other', 300), rect('far', 'Far', 20000)]);
    node('near').should('exist');
  });

  it('mounts a far layer only once the view reaches it', () => {
    node('far').should('not.exist');
    cy.canvasWheel({ deltaX: 19900 });
    node('far').should('exist');
    node('near').should('not.exist');
  });

  it('keeps a selected layer mounted after panning away', () => {
    cy.get('[data-testid=layers-panel]').contains('Near').click();
    cy.canvasWheel({ deltaX: 19900 });
    node('far').should('exist');
    node('other').should('not.exist');
    node('near').should('exist');
  });
});
