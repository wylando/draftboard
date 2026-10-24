const MOD = { metaKey: true, ctrlKey: true };
const tab = (name: string) => cy.get(`[data-board-name="${name}"]`);
const closeButton = (name: string) => cy.get(`[aria-label="Close ${name}"]`);
const activeTab = (name: string) => tab(name).should('have.attr', 'aria-selected', 'true');
const newBoard = () => cy.get('[data-testid=board-new]').click();
// Retries until the tabs match: closes and switches land a render later.
const tabNames = (expected: string[]) =>
  cy.get('[data-board-name]').should(($t) => expect([...$t].map((t) => t.getAttribute('data-board-name'))).to.deep.equal(expected));

interface Saved {
  activeId: string;
  boards: Array<{ id: string; name: string; nodes: Array<{ type: string }> }>;
}
// Saves are debounced, so callers retry until the write has landed.
const savedWorkspace = (check: (w: Saved) => void) =>
  cy.window().should((win) => {
    const raw = win.localStorage.getItem('draftboard:workspace:v1');
    expect(raw).to.be.a('string');
    check(JSON.parse(raw as string) as Saved);
  });

describe('Boards', () => {
  beforeEach(() => {
    cy.visitEmpty();
  });

  it('starts with one board, and a new board is empty and separate from the others', () => {
    activeTab('Board 1').should('not.have.attr', 'aria-controls');
    closeButton('Board 1').should('not.exist');
    cy.drawShape('rect', [100, 100], [200, 200]);

    newBoard();
    activeTab('Board 2');
    cy.get('[data-node-type]').should('not.exist');
    cy.drawShape('ellipse', [300, 100], [400, 200]);
    cy.get('[data-node-type=ellipse]').should('have.length', 1);

    tab('Board 1').click();
    activeTab('Board 1');
    cy.get('[data-node-type=rect]').should('have.length', 1);
    cy.get('[data-node-type=ellipse]').should('not.exist');
    // Panels are remounted per board; a switch must replace them, not add another copy.
    cy.get('[data-testid=layers-panel]').should('have.length', 1);
    cy.get('[data-testid=properties-panel]').should('have.length', 1);
  });

  it('keeps undo history per board', () => {
    cy.drawShape('rect', [100, 100], [200, 200]);
    newBoard();
    cy.drawShape('ellipse', [300, 100], [400, 200]);

    // Board 2 has one step; the second undo must not reach back into Board 1's work.
    cy.pressKey('z', { ...MOD, code: 'KeyZ' });
    cy.get('[data-node-type=ellipse]').should('not.exist');
    cy.pressKey('z', { ...MOD, code: 'KeyZ' });
    tab('Board 1').click();
    cy.get('[data-node-type=rect]').should('have.length', 1);

    cy.pressKey('z', { ...MOD, code: 'KeyZ' });
    cy.get('[data-node-type=rect]').should('not.exist');
  });

  it('copies a layer on one board and pastes it on another', () => {
    cy.drawShape('rect', [100, 100], [200, 200]);
    cy.pressKey('c', { ...MOD, code: 'KeyC' });
    newBoard();
    cy.get('[data-node-type]').should('not.exist');
    cy.pressKey('v', { ...MOD, code: 'KeyV' });
    cy.get('[data-node-type=rect]').should('have.length', 1);
  });

  it('closes an empty board at once, and asks before closing one with layers', () => {
    cy.drawShape('rect', [100, 100], [200, 200]);
    newBoard();
    newBoard();
    tabNames(['Board 1', 'Board 2', 'Board 3']);
    closeButton('Board 3').click();
    tabNames(['Board 1', 'Board 2']);
    activeTab('Board 2');

    tab('Board 1').click();
    closeButton('Board 1').click();
    cy.get('[role=alertdialog]').should('be.visible');
    cy.get('[data-testid=dialog-cancel]').click();
    cy.get('[role=alertdialog]').should('not.exist');
    tab('Board 1').should('exist');

    closeButton('Board 1').click();
    cy.get('[data-testid=dialog-confirm]').click();
    tabNames(['Board 2']);
    activeTab('Board 2');
    closeButton('Board 2').should('not.exist');
  });

  it('closing the active board activates its right neighbour', () => {
    newBoard();
    newBoard();
    tab('Board 2').click();
    closeButton('Board 2').click();
    activeTab('Board 3');
  });

  it('keeps boards, order, the active board and their layers after a reload', () => {
    cy.drawShape('rect', [100, 100], [200, 200]);
    newBoard();
    cy.drawShape('ellipse', [300, 100], [400, 200]);
    newBoard();
    tab('Board 2').click();
    savedWorkspace((w) => {
      expect(w.boards.map((b) => b.name)).to.deep.equal(['Board 1', 'Board 2', 'Board 3']);
      expect(w.boards.map((b) => b.nodes.map((n) => n.type))).to.deep.equal([['rect'], ['ellipse'], []]);
      expect(w.activeId).to.equal(w.boards[1]!.id);
    });

    cy.reload();
    tabNames(['Board 1', 'Board 2', 'Board 3']);
    activeTab('Board 2');
    cy.get('[data-node-type=ellipse]').should('have.length', 1);
    cy.get('[data-node-type=rect]').should('not.exist');
  });

  it('opens a document saved before boards existed as Board 1, leaving the old copy alone', () => {
    const rect = {
      id: 'old-1', type: 'rect', name: 'Rectangle 1', parentId: null, x: 40, y: 40, width: 80, height: 60,
      rotation: 0, fill: '#d9d9d9', stroke: '#000000', strokeWidth: 0, opacity: 1, visible: true, cornerRadius: 0,
    };
    const legacy = JSON.stringify({ version: 1, nodes: [rect] });
    cy.visit('/', {
      onBeforeLoad(win) {
        win.localStorage.clear();
        win.localStorage.setItem('draftboard:document:v1', legacy);
      },
    });
    activeTab('Board 1');
    cy.get('[data-node-id=old-1]').should('exist');
    cy.window().its('localStorage').invoke('getItem', 'draftboard:document:v1').should('equal', legacy);
  });

  it('commits a text being edited into the board it was typed in', () => {
    cy.pressKey('t');
    cy.get('[data-testid=canvas]').should('have.attr', 'data-tool', 'text');
    cy.canvasClick([120, 120]);
    cy.get('[data-testid=text-editor]').should('be.focused').type('Typed on one');

    newBoard();
    cy.get('[data-testid=text-editor]').should('not.exist');
    cy.get('[data-node-type=text]').should('not.exist');
    tab('Board 1').click();
    cy.get('[data-node-type=text]').should('contain.text', 'Typed on one');
  });

  it('moves focus between tabs with the arrow keys without nudging the selection', () => {
    cy.drawShape('rect', [100, 100], [200, 200]);
    newBoard();
    tab('Board 1').click();
    cy.prop('x').should('have.value', '100');

    // After a mouse click the tab gives focus back, so the arrow keys nudge the selection again.
    cy.get('body').type('{rightarrow}');
    cy.prop('x').should('have.value', '101');

    // A keyboard-focused tab keeps the roving arrows, and they don't nudge.
    tab('Board 1').focus().type('{rightarrow}');
    tab('Board 2').should('be.focused');
    cy.prop('x').should('have.value', '101');
  });

  it('leaves Space on a focused tab to the browser, which presses the button', () => {
    newBoard();
    // Cypress's own typing never presses a button with Space, so check what stops it in a browser: a cancelled keydown.
    tab('Board 1').focus().then(($tab) => {
      const win = $tab[0]!.ownerDocument.defaultView!;
      const keydown = new win.KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true });
      $tab[0]!.dispatchEvent(keydown);
      expect(keydown.defaultPrevented).to.equal(false);
    });
  });

  it('keeps the open tab in view when the strip overflows, and scrolls it with the wheel', () => {
    cy.viewport(700, 600);
    for (let i = 0; i < 6; i++) newBoard();
    activeTab('Board 7');
    cy.get('[data-testid=board-tabs]').should(($list) => {
      const list = $list[0]!.getBoundingClientRect();
      const open = $list[0]!.querySelector('[data-board-name="Board 7"]')!.getBoundingClientRect();
      expect(open.left).to.be.at.least(list.left);
      expect(open.right).to.be.at.most(list.right);
    });
    cy.get('[data-testid=board-tabs]').then(($l) => {
      const before = $l[0]!.scrollLeft;
      expect(before).to.be.greaterThan(0);
      cy.wrap($l).trigger('wheel', { deltaY: -200 });
      cy.wrap($l).should(($after) => expect($after[0]!.scrollLeft).to.be.lessThan(before));
    });
  });

  it('keeps an edit made just before a reload', () => {
    cy.drawShape('rect', [100, 100], [200, 200]);
    cy.reload();
    cy.get('[data-node-type=rect]').should('have.length', 1);
  });
});

export {};
