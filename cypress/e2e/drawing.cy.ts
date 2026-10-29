describe('Drawing shapes', () => {
  beforeEach(() => cy.visitEmpty());

  it('draws a rectangle by dragging and selects it', () => {
    cy.drawShape('rect', [100, 100], [300, 200]);

    cy.get('[data-node-type=rect]').should('have.length', 1);
    cy.prop('x').should('have.value', '100');
    cy.prop('y').should('have.value', '100');
    cy.prop('w').should('have.value', '200');
    cy.prop('h').should('have.value', '100');
    cy.get('[data-testid=layers-panel]').should('contain', 'Rectangle 1');
    // drawShape already waits for data-tool=select; this checks the toolbar follows.
    cy.get('[data-testid=tool-select]').should('have.attr', 'aria-checked', 'true');
    cy.get('[data-testid=tool-rect]').should('have.attr', 'aria-checked', 'false');
  });

  it('places a default-size shape on click using a keyboard shortcut', () => {
    cy.pressKey('o');
    cy.get('[data-testid=canvas]').should('have.attr', 'data-tool', 'ellipse');
    cy.canvasClick([200, 200]);

    cy.get('[data-node-type=ellipse]').should('have.length', 1);
    cy.prop('w').should('have.value', '100');
    cy.prop('h').should('have.value', '100');
  });

  it('draws frames, lines and auto-numbers layers', () => {
    cy.drawShape('frame', [40, 40], [400, 300]);
    cy.drawShape('line', [450, 50], [600, 150]);
    cy.drawShape('rect', [500, 300], [550, 350]);
    cy.drawShape('rect', [600, 300], [650, 350]);

    cy.get('[data-node-type=frame]').should('have.length', 1);
    cy.get('[data-node-type=line]').should('have.length', 1);
    cy.get('[data-testid=layers-panel]').should('contain', 'Frame 1').and('contain', 'Rectangle 2');

    // A freed number is reused; counting layers instead would give a second "Rectangle 2".
    cy.canvasClick([525, 325]);
    cy.prop('name').should('have.value', 'Rectangle 1');
    cy.pressKey('Backspace');
    cy.drawShape('rect', [500, 400], [550, 450]);
    cy.prop('name').should('have.value', 'Rectangle 1');
  });

  it('creates and edits text', () => {
    cy.pressKey('t');
    cy.get('[data-testid=canvas]').should('have.attr', 'data-tool', 'text');
    cy.canvasClick([120, 120]);

    cy.get('[data-testid=text-editor]').should('be.focused').type('Hello canvas{enter}');
    cy.get('[data-testid=text-editor]').should('not.exist');
    cy.get('[data-node-type=text]').should('contain.text', 'Hello canvas');
  });
  describe('default ink for new text and lines', () => {
    // Saves are debounced, so this retries until the write has landed.
    const savedInk = (type: string, expected: string) =>
      cy.window().should((win) => {
        const saved = JSON.parse(win.localStorage.getItem('draftboard:workspace:v1') ?? '{}') as {
          boards?: Array<{ nodes: Array<{ type: string; fill: string; stroke: string }> }>;
        };
        const node = saved.boards?.[0]?.nodes.find((n) => n.type === type);
        expect(node, `saved ${type}`).to.not.equal(undefined);
        expect([node!.fill, node!.stroke]).to.deep.equal([expected, expected]);
      });

    it('is black on the light canvas', () => {
      cy.drawShape('line', [100, 100], [300, 100]);
      cy.drawShape('text', [100, 200], [300, 240]);
      savedInk('line', '#000000');
      savedInk('text', '#000000');
    });

    it('is a light grey on the dark canvas', () => {
      cy.colorScheme('dark');
      cy.drawShape('line', [100, 100], [300, 100]);
      cy.drawShape('text', [100, 200], [300, 240]);
      savedInk('line', '#e6e6e6');
      savedInk('text', '#e6e6e6');
    });

    it('follows the frame a text lands in, not the OS theme', () => {
      cy.colorScheme('dark');
      cy.drawShape('frame', [400, 100], [800, 400]);
      cy.drawShape('text', [450, 150], [650, 190]);
      savedInk('text', '#000000');
    });
  });
});
