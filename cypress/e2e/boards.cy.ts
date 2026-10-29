import { savedWorkspace } from '../support/workspace';

const MOD = { metaKey: true, ctrlKey: true };
const tab = (name: string) => cy.get(`[data-board-name="${name}"]`);
const closeButton = (name: string) => cy.get(`[aria-label="Close ${name}"]`);
const activeTab = (name: string) => tab(name).should('have.attr', 'aria-selected', 'true');
const newBoard = () => cy.get('[data-testid=board-new]').click();
// Retries until the tabs match: closes and switches land a render later.
const tabNames = (expected: string[]) =>
  cy.get('[data-board-name]').should(($t) => expect([...$t].map((t) => t.getAttribute('data-board-name'))).to.deep.equal(expected));

// At a screen x, not relative to the tab: a held tab moves, so offsets from its centre would drift.
const pointerAt = (el: Element, type: string, x: number | 'center') => {
  const rect = el.getBoundingClientRect();
  const clientX = x === 'center' ? rect.left + rect.width / 2 : x;
  const init = { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1 };
  el.dispatchEvent(new (el.ownerDocument.defaultView!.PointerEvent)(type, { ...init, clientX, clientY: rect.top + rect.height / 2 }));
};

describe('Boards', () => {
  beforeEach(() => {
    cy.visitEmpty();
  });

  it('always shows a 24px close button on the open tab, and hides it on the others until hover', () => {
    newBoard();
    activeTab('Board 2');
    closeButton('Board 2')
      .should('have.css', 'opacity', '1')
      .and(($b) => {
        const { width, height } = $b[0]!.getBoundingClientRect();
        expect(Math.min(width, height), 'close button size').to.be.at.least(24);
      });
    closeButton('Board 1').should('have.css', 'opacity', '0');
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

  it('closes an empty board at once, activating its right neighbour (or the left one when the last tab closes), and asks before closing one with layers', () => {
    cy.drawShape('rect', [100, 100], [200, 200]);
    newBoard();
    newBoard();
    newBoard();
    tabNames(['Board 1', 'Board 2', 'Board 3', 'Board 4']);
    activeTab('Board 4');

    closeButton('Board 4').click();
    tabNames(['Board 1', 'Board 2', 'Board 3']);
    activeTab('Board 3');

    tab('Board 2').click();
    closeButton('Board 2').click();
    tabNames(['Board 1', 'Board 3']);
    activeTab('Board 3');

    tab('Board 1').click();
    closeButton('Board 1').click();
    cy.get('[role=alertdialog]').should('be.visible');
    cy.get('[data-testid=dialog-cancel]').click();
    cy.get('[role=alertdialog]').should('not.exist');
    tab('Board 1').should('exist');

    closeButton('Board 1').click();
    cy.get('[data-testid=dialog-confirm]').click();
    tabNames(['Board 3']);
    activeTab('Board 3');
    closeButton('Board 3').should('not.exist');
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

  it('commits a text being edited into the board it was typed in', () => {
    cy.pressKey('t', { code: 'KeyT' });
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
    // Recorded by a listener that runs after the canvas's own, so the flag is the final verdict on the event.
    let prevented: boolean | undefined;
    cy.window().then((win) => win.addEventListener('keydown', (e) => (prevented = e.defaultPrevented), { once: true }));
    tab('Board 1').focus().then(($tab) => {
      const win = $tab[0]!.ownerDocument.defaultView!;
      $tab[0]!.dispatchEvent(new win.KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true }));
    });
    cy.wrap(null).should(() => expect(prevented).to.equal(false));
  });

  it('keeps the open tab in view when the strip overflows, and scrolls it with the wheel', () => {
    cy.viewport(700, 600);
    for (let i = 0; i < 6; i++) newBoard();
    activeTab('Board 7');
    cy.get('[data-testid=board-tabs]').should(($list) => {
      const list = $list[0]!.getBoundingClientRect();
      const open = $list[0]!.querySelector('[data-board-name="Board 7"]')!.getBoundingClientRect();
      // Within a pixel: layout lands on sub-pixel positions that differ between platforms.
      expect(open.left).to.be.at.least(list.left - 1);
      expect(open.right).to.be.at.most(list.right + 1);
    });
    cy.get('[data-testid=board-tabs]').should(($l) => expect($l[0]!.scrollLeft).to.be.greaterThan(0));
    cy.get('[data-testid=board-tabs]').then(($l) => {
      const before = $l[0]!.scrollLeft;
      cy.wrap($l).trigger('wheel', { deltaY: -200 });
      cy.wrap($l).should(($after) => expect($after[0]!.scrollLeft).to.be.lessThan(before));
    });
  });

  it('renames a tab by double-click: Enter or blur commits, Escape and a taken name keep the old one', () => {
    newBoard();
    tab('Board 2').dblclick();
    // "Plan" is made of tool shortcuts (L, N...); typed into the field they must not switch tools.
    cy.get('[data-testid=board-rename-input]').should('be.focused');
    // The native menu belongs here, not the board menu.
    cy.get('[data-testid=board-rename-input]').rightclick();
    cy.get('[role=menu]').should('not.exist');
    cy.get('[data-testid=board-rename-input]').type('{selectall}Plan{enter}');
    cy.get('[data-testid=board-rename-input]').should('not.exist');
    tabNames(['Board 1', 'Plan']);
    // Keyboard users keep their place.
    tab('Plan').should('be.focused');
    cy.get('[data-testid=canvas]').should('have.attr', 'data-tool', 'select');

    tab('Plan').dblclick();
    cy.get('[data-testid=board-rename-input]').type('{selectall}board 1{enter}');
    tabNames(['Board 1', 'Plan']);

    tab('Plan').dblclick();
    cy.get('[data-testid=board-rename-input]').type('{selectall}Nope{esc}');
    tabNames(['Board 1', 'Plan']);

    tab('Plan').dblclick();
    cy.get('[data-testid=board-rename-input]').type('{selectall}Kept').blur();
    tabNames(['Board 1', 'Kept']);
    savedWorkspace((w) => expect(w.boards.map((b) => b.name)).to.deep.equal(['Board 1', 'Kept']));
  });

  it('drags a tab to reorder, leaving the open board and a plain click alone, and keeps the order after a reload', () => {
    newBoard();
    newBoard();
    activeTab('Board 3');
    // Each step re-queries the tab: it re-renders as it moves, so a held element could be stale.
    tab('Board 3').then(($t) => $t[0]!.getBoundingClientRect().width).then((width) => {
      tab('Board 3').pointer('pointerdown');
      tab('Board 3').pointer('pointermove', [-width, 0]);
      tab('Board 3').pointer('pointermove', [-width * 2.2, 0]);
      tab('Board 3').pointer('pointerup', [-width * 2.2, 0]);
    });
    tabNames(['Board 3', 'Board 1', 'Board 2']);
    activeTab('Board 3');

    // A drag of an inactive tab doesn't open it.
    tab('Board 2').then(($t) => $t[0]!.getBoundingClientRect().width).then((width) => {
      tab('Board 2').pointer('pointerdown');
      tab('Board 2').pointer('pointermove', [-width * 1.2, 0]);
      tab('Board 2').pointer('pointerup', [-width * 1.2, 0]);
    });
    tabNames(['Board 3', 'Board 2', 'Board 1']);
    activeTab('Board 3');

    // A drag cancelled by the browser drops nothing, and must not eat a later keyboard activation.
    tab('Board 2').pointer('pointerdown');
    tab('Board 2').pointer('pointermove', [-60, 0]);
    tab('Board 2').pointer('pointercancel');
    tabNames(['Board 3', 'Board 2', 'Board 1']);
    tab('Board 2').then(($t) => $t[0]!.click());
    activeTab('Board 2');

    tab('Board 1').pointer('pointerdown');
    tab('Board 1').pointer('pointerup');
    tab('Board 1').click();
    activeTab('Board 1');
    tabNames(['Board 3', 'Board 2', 'Board 1']);

    savedWorkspace((w) => expect(w.boards.map((b) => b.name)).to.deep.equal(['Board 3', 'Board 2', 'Board 1']));
    cy.reload();
    tabNames(['Board 3', 'Board 2', 'Board 1']);
  });

  it('keeps a dragged tab inside the strip when every tab fits', () => {
    newBoard();
    newBoard();
    tabNames(['Board 1', 'Board 2', 'Board 3']);
    tab('Board 1').then(($t) => {
      const win = $t[0]!.ownerDocument.defaultView!;
      pointerAt($t[0]!, 'pointerdown', 'center');
      pointerAt($t[0]!, 'pointermove', win.innerWidth - 2);
    });
    // Pinned at the strip's end, not following the pointer to the window edge.
    tab('Board 1')
      .closest('[data-board-tab]')
      .should(($held) => {
        const strip = $held[0]!.ownerDocument.querySelector('[data-testid=board-tabs]')!.getBoundingClientRect();
        expect($held[0]!.getBoundingClientRect().right, 'held tab right edge').to.be.closeTo(strip.right, 1);
      });
    tab('Board 1').then(($t) => pointerAt($t[0]!, 'pointerup', $t[0]!.ownerDocument.defaultView!.innerWidth - 2));
    tabNames(['Board 2', 'Board 3', 'Board 1']);
  });

  it('scrolls an overflowing strip while a dragged tab is held at its edge', () => {
    cy.viewport(700, 600);
    for (let i = 0; i < 6; i++) newBoard();
    activeTab('Board 7');
    cy.get('[data-testid=board-tabs]').then(($l) => ($l[0]!.scrollLeft = 0));
    cy.get('[data-testid=board-tabs]').should(($l) => expect($l[0]!.scrollLeft).to.equal(0));
    tab('Board 1').then(($t) => {
      const strip = $t[0]!.ownerDocument.querySelector('[data-testid=board-tabs]')!.getBoundingClientRect();
      pointerAt($t[0]!, 'pointerdown', 'center');
      pointerAt($t[0]!, 'pointermove', strip.right - 2);
    });
    // Held still at the edge, the strip keeps scrolling until its end shows.
    cy.get('[data-testid=board-tabs]').should(($l) => expect($l[0]!.scrollLeft).to.be.at.least($l[0]!.scrollWidth - $l[0]!.clientWidth - 1));
    tab('Board 1').then(($t) => {
      const strip = $t[0]!.ownerDocument.querySelector('[data-testid=board-tabs]')!.getBoundingClientRect();
      pointerAt($t[0]!, 'pointerup', strip.right - 2);
    });
    tabNames(['Board 2', 'Board 3', 'Board 4', 'Board 5', 'Board 6', 'Board 7', 'Board 1']);
  });

  it('opens a menu on right-click to rename, duplicate or close a board', () => {
    cy.drawShape('rect', [100, 100], [200, 200]);
    tab('Board 1').rightclick();
    cy.get('[data-testid=board-menu-close]').should('have.attr', 'data-disabled');
    cy.get('[data-testid=board-menu-duplicate]').click();
    tabNames(['Board 1', 'Board 2']);
    activeTab('Board 2');
    cy.get('[data-node-type=rect]').should('have.length', 1);
    cy.get('[role=menu]').should('not.exist');

    tab('Board 2').rightclick();
    cy.get('[data-testid=board-menu-rename]').click();
    cy.get('[data-testid=board-rename-input]').should('be.focused').type('{selectall}Copy{enter}');
    tabNames(['Board 1', 'Copy']);

    // The menu owns its keys: an arrow key inside it must not nudge the selected layer.
    cy.get('[data-node-type=rect]').click();
    cy.prop('y').should('have.value', '100');
    tab('Copy').rightclick();
    // Keys go straight to the menu: `type` would click it first, and that click can land on an item.
    cy.get('[role=menu]').trigger('keydown', { key: 'ArrowDown', code: 'ArrowDown' });
    cy.prop('y').should('have.value', '100');
    cy.get('[role=menu]').trigger('keydown', { key: 'Escape', code: 'Escape' });
    cy.get('[role=menu]').should('not.exist');

    tab('Copy').rightclick();
    cy.get('[data-testid=board-menu-close]').click();
    cy.get('[data-testid=dialog-confirm]').click();
    tabNames(['Board 1']);
  });

  it('has keyboard shortcuts to add, cycle through and close boards', () => {
    // A held key repeats keydown; that must not keep adding boards.
    cy.pressKey('n', { altKey: true, code: 'KeyN', repeat: true });
    cy.pressKey('n', { altKey: true, code: 'KeyN' });
    tabNames(['Board 1', 'Board 2']);
    activeTab('Board 2');

    cy.pressKey(']', { altKey: true, code: 'BracketRight' });
    activeTab('Board 1');
    cy.pressKey('[', { altKey: true, code: 'BracketLeft' });
    activeTab('Board 2');

    cy.drawShape('rect', [100, 100], [200, 200]);
    cy.pressKey('w', { altKey: true, code: 'KeyW' });
    cy.get('[role=alertdialog]').should('be.visible');
    cy.get('[data-testid=dialog-cancel]').click();
    tabNames(['Board 1', 'Board 2']);
    cy.pressKey('w', { altKey: true, code: 'KeyW' });
    cy.get('[data-testid=dialog-confirm]').click();
    tabNames(['Board 1']);
  });

  it('keeps an edit made just before a reload', () => {
    cy.drawShape('rect', [100, 100], [200, 200]);
    cy.reload();
    cy.get('[data-node-type=rect]').should('have.length', 1);
  });
});

export {};
