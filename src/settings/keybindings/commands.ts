import type { Binding } from './keys';

export type CommandCategory = 'tools' | 'edit' | 'arrange' | 'view' | 'nudge' | 'boards' | 'app';

export const CATEGORY_LABELS: Record<CommandCategory, string> = {
  tools: 'Tools',
  edit: 'Edit',
  arrange: 'Arrange',
  view: 'View',
  nudge: 'Nudge selection',
  boards: 'Boards',
  app: 'App',
};

export interface CommandDef {
  label: string;
  description: string;
  category: CommandCategory;
  defaults: Binding[];
}

/**
 * Every keyboard-triggerable action, keyed by a stable id. This registry is the
 * single source for the keydown dispatcher, the Settings page, and toolbar
 * tooltips. Add an entry here instead of writing an ad-hoc keydown handler.
 */
export const COMMANDS = {
  'tool.select': { label: 'Move', category: 'tools', defaults: ['V'], description: 'Select, move and resize layers. Drag on empty canvas to box-select.' },
  'tool.frame': { label: 'Frame', category: 'tools', defaults: ['F'], description: 'Draw a frame: a white artboard. Layers drawn or dropped on it go inside it and are clipped to its edges.' },
  'tool.rect': { label: 'Rectangle', category: 'tools', defaults: ['R'], description: 'Draw a rectangle. Hold Shift for a square; click once for a 100×100 default.' },
  'tool.ellipse': { label: 'Ellipse', category: 'tools', defaults: ['O'], description: 'Draw an ellipse. Hold Shift for a circle.' },
  'tool.line': { label: 'Line', category: 'tools', defaults: ['L'], description: 'Draw a straight line. Hold Shift to snap to 45°.' },
  'tool.text': { label: 'Text', category: 'tools', defaults: ['T'], description: 'Click to place a text layer and start typing. Enter finishes; Shift+Enter adds a line.' },
  'tool.table': { label: 'Table', category: 'tools', defaults: ['D'], description: 'Click to place a database table with an id primary key, or drag to set its width. Edit its columns in the Design panel.' },
  'tool.connector': { label: 'Connector', category: 'tools', defaults: ['C'], description: 'Drag from a table row, a table or any shape to another to link them; the line follows them. An end dropped on empty canvas stays loose.' },
  'tool.hand': { label: 'Hand', category: 'tools', defaults: ['H'], description: 'Drag to pan the canvas without selecting anything.' },

  'edit.undo': { label: 'Undo', category: 'edit', defaults: ['Mod+Z'], description: 'Undo the last change to the document.' },
  'edit.redo': { label: 'Redo', category: 'edit', defaults: ['Mod+Shift+Z', 'Mod+Y'], description: 'Redo the last undone change.' },
  'edit.copy': { label: 'Copy', category: 'edit', defaults: ['Mod+C'], description: 'Copy the selected layers, with their children, for pasting.' },
  'edit.cut': { label: 'Cut', category: 'edit', defaults: ['Mod+X'], description: 'Copy the selected layers, then remove them.' },
  'edit.paste': { label: 'Paste', category: 'edit', defaults: ['Mod+V'], description: 'Paste copied layers 10px from where they were copied. Each paste goes 10px further.' },
  'edit.duplicate': { label: 'Duplicate', category: 'edit', defaults: ['Mod+D'], description: 'Copy the selection, offset by 10px.' },
  'edit.delete': { label: 'Delete', category: 'edit', defaults: ['Backspace', 'Delete'], description: 'Remove the selected layers.' },
  'edit.selectAll': { label: 'Select all', category: 'edit', defaults: ['Mod+A'], description: 'Select every visible top-level layer, or every layer beside the current selection inside a frame or group.' },
  'edit.escape': { label: 'Deselect / exit tool', category: 'edit', defaults: ['Escape'], description: 'Return to the Move tool, or clear the selection if already on it.' },

  'arrange.forward': { label: 'Bring forward', category: 'arrange', defaults: ['Mod+]'], description: 'Move the selection one step up in the layer order.' },
  'arrange.backward': { label: 'Send backward', category: 'arrange', defaults: ['Mod+['], description: 'Move the selection one step down in the layer order.' },
  'arrange.front': { label: 'Bring to front', category: 'arrange', defaults: ['Mod+Alt+]'], description: 'Move the selection to the top of the layer order.' },
  'arrange.group': { label: 'Group selection', category: 'arrange', defaults: ['Mod+G'], description: 'Put the selected layers in a new group, which moves and resizes them together.' },
  'arrange.ungroup': { label: 'Ungroup', category: 'arrange', defaults: ['Mod+Shift+G'], description: 'Remove the selected groups and keep their layers where they are.' },
  'arrange.back': { label: 'Send to back', category: 'arrange', defaults: ['Mod+Alt+['], description: 'Move the selection to the bottom of the layer order.' },

  'view.zoomIn': { label: 'Zoom in', category: 'view', defaults: ['Mod+='], description: 'Double the zoom around the canvas center.' },
  'view.zoomOut': { label: 'Zoom out', category: 'view', defaults: ['Mod+-'], description: 'Halve the zoom around the canvas center.' },
  'view.zoom100': { label: 'Zoom to 100%', category: 'view', defaults: ['Shift+0'], description: 'Show the canvas at actual size.' },
  'view.zoomFit': { label: 'Zoom to fit', category: 'view', defaults: ['Shift+1'], description: 'Fit all visible layers on screen.' },

  'nudge.left': { label: 'Nudge left', category: 'nudge', defaults: ['ArrowLeft'], description: 'Move the selection 1px left.' },
  'nudge.right': { label: 'Nudge right', category: 'nudge', defaults: ['ArrowRight'], description: 'Move the selection 1px right.' },
  'nudge.up': { label: 'Nudge up', category: 'nudge', defaults: ['ArrowUp'], description: 'Move the selection 1px up.' },
  'nudge.down': { label: 'Nudge down', category: 'nudge', defaults: ['ArrowDown'], description: 'Move the selection 1px down.' },
  'nudge.leftLarge': { label: 'Nudge left ×10', category: 'nudge', defaults: ['Shift+ArrowLeft'], description: 'Move the selection 10px left.' },
  'nudge.rightLarge': { label: 'Nudge right ×10', category: 'nudge', defaults: ['Shift+ArrowRight'], description: 'Move the selection 10px right.' },
  'nudge.upLarge': { label: 'Nudge up ×10', category: 'nudge', defaults: ['Shift+ArrowUp'], description: 'Move the selection 10px up.' },
  'nudge.downLarge': { label: 'Nudge down ×10', category: 'nudge', defaults: ['Shift+ArrowDown'], description: 'Move the selection 10px down.' },

  // Alt, not Mod: Ctrl/⌘ + N, W and the bracket keys belong to the browser's own windows and tabs.
  'board.new': { label: 'New board', category: 'boards', defaults: ['Alt+N'], description: 'Add an empty board after the last one and open it.' },
  'board.close': { label: 'Close board', category: 'boards', defaults: ['Alt+W'], description: 'Close the open board, asking first if it has layers. The last board stays.' },
  'board.next': { label: 'Next board', category: 'boards', defaults: ['Alt+]'], description: 'Open the board to the right; from the last board, wrap to the first.' },
  'board.previous': { label: 'Previous board', category: 'boards', defaults: ['Alt+['], description: 'Open the board to the left; from the first board, wrap to the last.' },

  // No default: ⌘, is usually taken by the browser's own settings. Use the gear button or bind one.
  'app.openSettings': { label: 'Open settings', category: 'app', defaults: [], description: 'Open this Settings page.' },
  // "?" is Shift+/ on a US layout. Bindings follow the physical key, so useKeyboardShortcuts also accepts the typed "?" for layouts that put it elsewhere.
  'app.gettingStarted': { label: 'Getting started', category: 'app', defaults: ['Shift+/'], description: 'Open the Getting started guide in Settings.' },
  // No defaults: the top bar's Import and Export menus are the main way in; bind one here for a shortcut.
  'file.importSchema': { label: 'Import schema', category: 'app', defaults: [], description: 'Open the schema import dialog (SQL, DBML or a SQLite file).' },
  'file.importBoard': { label: 'Import board file', category: 'app', defaults: [], description: 'Choose a board .json file to load into the open board.' },
  'file.exportSchema': { label: 'Export schema', category: 'app', defaults: [], description: 'Open the schema export dialog (SQL or DBML).' },
  'file.exportBoard': { label: 'Export board file', category: 'app', defaults: [], description: 'Download the open board as a .json file.' },
} as const satisfies Record<string, CommandDef>;

export type CommandId = keyof typeof COMMANDS;

export const COMMAND_IDS = Object.keys(COMMANDS) as CommandId[];

export const isCommandId = (value: string): value is CommandId => Object.hasOwn(COMMANDS, value);

/** Interactions that need a mouse or a held key; listed for reference, not configurable. */
export const FIXED_INTERACTIONS: Array<{ label: string; input: string; description: string }> = [
  { label: 'Pan', input: 'Hold Space + drag', description: 'Temporarily pan with any tool.' },
  { label: 'Pan', input: 'Middle-mouse drag', description: 'Pan with any tool.' },
  { label: 'Scroll canvas', input: 'Mouse wheel / trackpad', description: 'Pan vertically and horizontally.' },
  { label: 'Zoom', input: '⌘/Ctrl + wheel', description: 'Zoom around the pointer.' },
  { label: 'Add to selection', input: 'Shift + click', description: 'Toggle a layer in or out of the selection.' },
  { label: 'Select inside a group', input: 'Double-click a group', description: 'Clicking a grouped layer selects its group; double-click to go one level in.' },
  { label: 'Deep select', input: '⌘/Ctrl + click', description: 'Select the innermost layer under the pointer, even inside groups.' },
  { label: 'Move into a frame', input: 'Drag a layer onto a frame', description: 'Dropping a layer over a frame puts it inside; dropping it outside takes it out.' },
  { label: 'Nest or reorder layers', input: 'Drag in Layers panel', description: 'Drop above or below a layer to reorder, or onto a frame or group to put it inside.' },
  { label: 'Resize a panel', input: 'Drag a panel edge', description: 'Widen or narrow the Layers or Design panel; drag past its narrowest to collapse it. Arrow keys resize a focused edge.' },
  { label: 'Constrain', input: 'Shift while drawing / dragging', description: 'Squares, circles, 45° lines, or lock a move to one axis.' },
  {
    label: 'Skip snapping',
    input: 'Hold ⌘/Ctrl during a drag',
    description:
      'Move, resize or draw without lining up to other layers. Press it after the drag starts: held before the click, it deep-selects as usual. Turn snapping off for good in Settings → Canvas.',
  },
  {
    label: 'Measure distances',
    input: 'Hold Alt/Option over a layer',
    description: 'With a layer selected, shows the distance from it to the layer under the pointer.',
  },
  { label: 'Rotate', input: 'Drag just outside a corner', description: 'Rotate the selected layer about its center. Hold Shift to snap to 15° steps.' },
  { label: 'Edit text', input: 'Double-click a text layer', description: 'Edit its content in place.' },
  {
    label: 'Edit a table',
    input: 'Double-click a table',
    description: 'Edit its name (header), or a column’s name (left half of a row) or type (right half). Tab moves on, Enter on the last row adds a column, Escape cancels.',
  },
  {
    label: 'Re-attach a connector',
    input: 'Drag a selected connector’s end',
    description: 'Drop it on a table row, a table’s header, any layer, or empty canvas to leave it loose. Escape cancels by deselecting.',
  },
  {
    label: 'Change cardinality',
    input: 'Click a connector’s end marker',
    description: 'Cycles that end through one, zero or one, many, one or many, and none. Many-to-many only between whole tables.',
  },
  {
    label: 'Pick or reorder a column',
    input: 'Click a row / drag its grip',
    description: 'In a selected table, click a row to pick that column (Delete removes it), or drag the grip left of a row to move it.',
  },
  { label: 'Rename layer', input: 'Double-click in Layers panel', description: 'Edit the layer name.' },
  {
    label: 'Scrub a value',
    input: 'Drag a field label',
    description: 'Drag a number field’s label sideways to change it. Shift for steps of 10, Alt for 0.1.',
  },
];
