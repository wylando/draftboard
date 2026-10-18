const MOD = { metaKey: true, ctrlKey: true };
const vertexCount = (points: string | undefined) => (points ?? '').trim().split(/\s+/).length;

describe('Arrow, polygon, star, pencil and image tools', () => {
  beforeEach(() => cy.visitEmpty());

  it('draws an arrow with a head at the end of the drag', () => {
    cy.drawShape('arrow', [100, 100], [300, 200]);
    cy.get('[data-node-type=arrow]').should('have.length', 1);
    cy.get('[data-testid=layers-panel]').should('contain', 'Arrow 1');
    cy.get('[data-node-type=arrow] [data-testid=arrowhead]').should('exist');
    cy.prop('w').should('have.value', '200');
    cy.prop('h').should('have.value', '100');
  });

  it('draws a polygon whose side count is editable', () => {
    cy.drawShape('polygon', [100, 100], [200, 200]);
    cy.get('[data-node-type=polygon] polygon').should(($p) => expect(vertexCount($p.attr('points'))).to.equal(3));
    cy.prop('sides').clear().type('6{enter}');
    cy.get('[data-node-type=polygon] polygon').should(($p) => expect(vertexCount($p.attr('points'))).to.equal(6));
  });

  it('draws a star whose point count is editable', () => {
    cy.pressKey('S', { shiftKey: true, code: 'KeyS' });
    cy.get('[data-testid=canvas]').should('have.attr', 'data-tool', 'star');
    cy.canvasDrag([100, 100], [200, 200]);
    cy.get('[data-node-type=star] polygon').should(($p) => expect(vertexCount($p.attr('points'))).to.equal(10));
    cy.prop('points').clear().type('8{enter}');
    cy.get('[data-node-type=star] polygon').should(($p) => expect(vertexCount($p.attr('points'))).to.equal(16));
  });

  it('draws a freehand path with the pencil, and a click alone draws nothing', () => {
    cy.get('[data-testid=tool-pencil]').click();
    cy.get('[data-testid=canvas]').should('have.attr', 'data-tool', 'pencil');
    cy.canvasClick([400, 400]);
    cy.get('[data-testid=canvas]').should('have.attr', 'data-tool', 'select');
    cy.get('[data-node-type=path]').should('not.exist');

    cy.drawShape('pencil', [100, 100], [300, 200]);
    cy.get('[data-node-type=path]').should('have.length', 1);
    cy.prop('x').should('have.value', '100');
    cy.prop('w').should('have.value', '200');
    cy.prop('h').should('have.value', '100');
  });

  it('places an image downscaled to 1024px on its long side', () => {
    cy.get('[data-testid=image-input]').selectFile('cypress/fixtures/wide-2048x1024.png', { force: true });
    cy.get('[data-node-type=image]').should('have.length', 1);
    cy.get('[data-node-type=image] image').should('have.attr', 'href').and('match', /^data:image\//);
    cy.prop('w').should('have.value', '1024');
    cy.prop('h').should('have.value', '512');
  });

  it('the Place image shortcut opens the file picker', () => {
    cy.get('[data-testid=image-input]').then(($input) => {
      cy.stub($input[0] as HTMLInputElement, 'click').as('pick');
    });
    cy.pressKey('k', { ...MOD, shiftKey: true, code: 'KeyK' });
    cy.get('@pick').should('have.been.calledOnce');
  });

  it('warns when the document can no longer be saved', () => {
    cy.window().then((win) => {
      cy.stub(win.Storage.prototype, 'setItem').throws(new win.DOMException('full', 'QuotaExceededError'));
    });
    cy.drawShape('rect', [100, 100], [200, 200]);
    cy.get('[data-testid=save-error]').should('be.visible');
  });
});

export {};
