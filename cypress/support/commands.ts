/**
 * Canvas helpers. They dispatch real PointerEvents at whatever element is
 * under the point (document.elementFromPoint), which matches how a real
 * pointer hits SVG shapes, handles, or empty canvas.
 */

type Pt = [number, number];

interface PointerOpts {
  shiftKey?: boolean;
  /** Pass both metaKey and ctrlKey for "Mod": the app accepts either, so tests pass on macOS and Linux. */
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  button?: number;
  /** Buttons held during the event; defaults to the pressed `button` (none for pointerup). Pass 0 to hover. */
  buttons?: number;
}

declare global {
  namespace Cypress {
    interface Chainable {
      /** Fresh editor with empty storage. */
      visitEmpty(): Chainable<void>;
      /** Dispatch a pointer event at canvas-relative coordinates. */
      canvasPointer(type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel', at: Pt, opts?: PointerOpts): Chainable<void>;
      /** Press and release at one point without moving. */
      canvasClick(at: Pt, opts?: PointerOpts): Chainable<void>;
      /** Dispatch a dblclick at canvas-relative coordinates. */
      canvasDblClick(at: Pt): Chainable<void>;
      /** Press at `from`, move in steps to `to`, release. */
      canvasDrag(from: Pt, to: Pt, opts?: PointerOpts): Chainable<void>;
      /** Select a tool via its toolbar button, then drag on the canvas. */
      drawShape(tool: string, from: Pt, to: Pt): Chainable<void>;
      /** Dispatch a keydown (and keyup) on the window. */
      pressKey(key: string, opts?: { code?: string; shiftKey?: boolean; metaKey?: boolean; altKey?: boolean; repeat?: boolean }): Chainable<void>;
      /** Read a node's committed property value from the properties panel. */
      prop(name: string): Chainable<JQuery<HTMLInputElement>>;
      /** Dispatch a pointer event at the subject's center, offset by `by` pixels. */
      pointer(type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel', by?: Pt, opts?: PointerOpts): Chainable<JQuery<HTMLElement>>;
    }
  }
}

Cypress.Commands.add('visitEmpty', () => {
  cy.visit('/', { onBeforeLoad: (win) => win.localStorage.clear() });
  cy.get('[data-testid=canvas]').should('be.visible');
});

function dispatchPointer(target: Element, type: string, clientX: number, clientY: number, opts: PointerOpts) {
  const button = opts.button ?? 0;
  target.dispatchEvent(
    new target.ownerDocument.defaultView!.PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX,
      clientY,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      button,
      buttons: opts.buttons ?? (type === 'pointerup' ? 0 : 1 << button),
      shiftKey: opts.shiftKey ?? false,
      metaKey: opts.metaKey ?? false,
      ctrlKey: opts.ctrlKey ?? false,
      altKey: opts.altKey ?? false,
    }),
  );
}

Cypress.Commands.add('canvasPointer', (type, at, opts = {}) => {
  cy.get('[data-testid=canvas]').then(($canvas) => {
    const rect = $canvas[0]!.getBoundingClientRect();
    const clientX = rect.left + at[0];
    const clientY = rect.top + at[1];
    const target = $canvas[0]!.ownerDocument.elementFromPoint(clientX, clientY) ?? $canvas[0]!;
    dispatchPointer(target, type, clientX, clientY, opts);
  });
});

Cypress.Commands.add('pointer', { prevSubject: 'element' }, (subject, type, by: Pt = [0, 0], opts = {}) => {
  const rect = subject[0]!.getBoundingClientRect();
  dispatchPointer(subject[0]!, type, rect.left + rect.width / 2 + by[0], rect.top + rect.height / 2 + by[1], opts);
  return cy.wrap(subject, { log: false });
});

Cypress.Commands.add('canvasClick', (at, opts = {}) => {
  cy.canvasPointer('pointerdown', at, opts);
  cy.canvasPointer('pointerup', at, opts);
});

Cypress.Commands.add('canvasDblClick', (at) => {
  cy.get('[data-testid=canvas]').then(($canvas) => {
    const rect = $canvas[0]!.getBoundingClientRect();
    const clientX = rect.left + at[0];
    const clientY = rect.top + at[1];
    const doc = $canvas[0]!.ownerDocument;
    const target = doc.elementFromPoint(clientX, clientY) ?? $canvas[0]!;
    target.dispatchEvent(new doc.defaultView!.MouseEvent('dblclick', { bubbles: true, cancelable: true, clientX, clientY, detail: 2 }));
  });
});

Cypress.Commands.add('canvasDrag', (from, to, opts = {}) => {
  const steps = 4;
  cy.canvasPointer('pointerdown', from, opts);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    cy.canvasPointer('pointermove', [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t], opts);
  }
  cy.canvasPointer('pointerup', to, opts);
});

Cypress.Commands.add('drawShape', (tool, from, to) => {
  cy.get(`[data-testid=tool-${tool}]`).click();
  cy.get('[data-testid=canvas]').should('have.attr', 'data-tool', tool);
  cy.canvasDrag(from, to);
  // Creation and the switch back to Move render together, so this also
  // guarantees the new node (and its properties panel) is on screen.
  cy.get('[data-testid=canvas]').should('have.attr', 'data-tool', 'select');
});

Cypress.Commands.add('pressKey', (key, opts = {}) => {
  cy.window().then((win) => {
    const init = { key, code: opts.code ?? '', bubbles: true, cancelable: true, ...opts };
    win.document.body.dispatchEvent(new win.KeyboardEvent('keydown', init));
    win.document.body.dispatchEvent(new win.KeyboardEvent('keyup', init));
  });
});

Cypress.Commands.add('prop', (name) => cy.get<HTMLInputElement>(`[data-testid=prop-${name}]`));

export {};
