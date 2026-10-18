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
  'tool.arrow': { label: 'Arrow', category: 'tools', defaults: ['Shift+L'], description: 'Draw a line with an arrowhead at the end. Hold Shift to snap to 45°.' },
  'tool.polygon': { label: 'Polygon', category: 'tools', defaults: ['P'], description: 'Draw a regular polygon (a triangle at first). Change its sides in Properties. Hold Shift to keep it even.' },
  'tool.star': { label: 'Star', category: 'tools', defaults: ['Shift+S'], description: 'Draw a star. Change its points and inner radius in Properties. Hold Shift to keep it even.' },
  'tool.pencil': { label: 'Pencil', category: 'tools', defaults: ['Shift+P'], description: 'Drag to draw a freehand stroke.' },
  'tool.image': { label: 'Place image', category: 'tools', defaults: ['Mod+Shift+K'], description: 'Choose a PNG, JPEG, WebP or GIF file. Images larger than 1024px on a side are scaled down, so documents fit in browser storage.' },
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
  'arrange.alignLeft': { label: 'Align left', category: 'arrange', defaults: ['Alt+A'], description: 'Line up the selected layers on their leftmost edge.' },
  'arrange.alignHCenter': { label: 'Align horizontal centers', category: 'arrange', defaults: ['Alt+H'], description: 'Center the selected layers on one vertical line.' },
  'arrange.alignRight': { label: 'Align right', category: 'arrange', defaults: ['Alt+D'], description: 'Line up the selected layers on their rightmost edge.' },
  'arrange.alignTop': { label: 'Align top', category: 'arrange', defaults: ['Alt+W'], description: 'Line up the selected layers on their top edge.' },
  'arrange.alignVCenter': { label: 'Align vertical centers', category: 'arrange', defaults: ['Alt+V'], description: 'Center the selected layers on one horizontal line.' },
  'arrange.alignBottom': { label: 'Align bottom', category: 'arrange', defaults: ['Alt+S'], description: 'Line up the selected layers on their bottom edge.' },
  'arrange.distributeHorizontal': { label: 'Distribute horizontally', category: 'arrange', defaults: ['Alt+Shift+H'], description: 'Space 3 or more layers evenly from left to right. The outermost two stay put.' },
  'arrange.distributeVertical': { label: 'Distribute vertically', category: 'arrange', defaults: ['Alt+Shift+V'], description: 'Space 3 or more layers evenly from top to bottom. The outermost two stay put.' },
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
  { label: 'Edit text', input: 'Double-click a text layer', description: 'Edit its content in place.' },
  { label: 'Rename layer', input: 'Double-click in Layers panel', description: 'Edit the layer name.' },
];
