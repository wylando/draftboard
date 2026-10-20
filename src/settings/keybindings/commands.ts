import type { Binding } from './keys';

export type CommandCategory = 'tools' | 'edit' | 'arrange' | 'view' | 'nudge' | 'app';

export const CATEGORY_LABELS: Record<CommandCategory, string> = {
  tools: 'Tools',
  edit: 'Edit',
  arrange: 'Arrange',
  view: 'View',
  nudge: 'Nudge selection',
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

  // No default: ⌘, is usually taken by the browser's own settings. Use the gear button or bind one.
  'app.openSettings': { label: 'Open settings', category: 'app', defaults: [], description: 'Open this Settings page.' },
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
  { label: 'Rename layer', input: 'Double-click in Layers panel', description: 'Edit the layer name.' },
  {
    label: 'Scrub a value',
    input: 'Drag a field label',
    description: 'Drag a number field’s label sideways to change it. Shift for steps of 10, Alt for 0.1.',
  },
];
