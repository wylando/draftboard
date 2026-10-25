import { css } from 'styled-system/css';
import { Kbd } from '../design-system';
import { COMMAND_IDS, COMMANDS } from './keybindings/commands';
import { formatBinding } from './keybindings/keys';
import { useKeybindings } from './keybindings/KeybindingsContext';
import { Block, mutedClass, Terms } from './sectionParts';

const listClass = css({ margin: '0', paddingInlineStart: '4', display: 'grid', gap: '1' });

/** Current shortcut for a command, reflecting the user's own bindings. */
function Shortcut({ binding }: { binding: string | undefined }) {
  if (!binding) return <span className={mutedClass}>no shortcut</span>;
  return (
    <Kbd>
      {formatBinding(binding).map((p, i) => (
        <span key={i}>{p}</span>
      ))}
    </Kbd>
  );
}

export function GettingStartedSection() {
  const { bindings } = useKeybindings();
  const toolIds = COMMAND_IDS.filter((id) => COMMANDS[id].category === 'tools');

  return (
    <section data-testid="getting-started-section">
      <h1>Getting started</h1>
      <p className={mutedClass}>
        Draftboard is a small design canvas that runs entirely on your computer. If you have used another design
        tool, most things will feel familiar; if not, start here.
      </p>

      <Block title="The screen" testId="guide-screen">
        <Terms
          items={[
            ['Toolbar (top)', 'Tools on the left, undo/redo in the middle, then Import, Export, zoom and Settings.'],
            ['Layers (left)', 'Every layer as a tree, top layer first; connectors are links between layers, always shown, so they get no row. Layers inside a frame or group are indented under it; click the arrow to fold them away. Click to select, Shift-click to add, double-click to rename, eye icon to hide, drag to reorder or move into a frame or group.'],
            ['Canvas (center)', 'Where you draw. Scroll to pan, ⌘/Ctrl + scroll to zoom. Change the background grid (dots, lines or none) and turn snapping on or off under Settings → Canvas.'],
            ['Design panel (right)', 'Properties of the selected layer. Shows a hint when nothing is selected.'],
            ['Panel size', 'Drag the inner edge of the Layers or Design panel to resize it, or past its narrowest to collapse it. The two panel buttons in the top bar hide and show them. Sizes are remembered.'],
          ]}
        />
      </Block>

      <Block title="Your first design">
        <ol className={listClass}>
          <li>
            Press <Shortcut binding={bindings['tool.rect'][0]} /> (Rectangle) and drag on the canvas.
          </li>
          <li>The new layer is selected: drag it to move it, drag a corner handle to resize, or drag just outside a corner to rotate.</li>
          <li>Draw a second shape and drag it near the first: its edges and centers snap into line, and guide lines show what lined up. Hold ⌘/Ctrl once you’ve started dragging to place it freely.</li>
          <li>With one shape selected, hold Alt/Option and point at the other to see the distance between them.</li>
          <li>Change its color under Fill in the Design panel; type a hex value and press Enter.</li>
          <li>
            Press <Shortcut binding={bindings['tool.text'][0]} /> and click to add text. Type, then press Enter.
          </li>
          <li>
            Made a mistake? <Shortcut binding={bindings['edit.undo'][0]} /> undoes it.
          </li>
        </ol>
      </Block>

      <Block title="Tools" testId="guide-tools">
        <Terms
          items={toolIds.map((id) => [
            <>
              {COMMANDS[id].label} <Shortcut binding={bindings[id][0]} />
            </>,
            COMMANDS[id].description,
          ])}
        />
      </Block>

      <Block title="Design panel options" testId="guide-options">
        <Terms
          items={[
            ['Layer', 'The layer name, as shown in the Layers panel.'],
            ['Position & size', 'X and Y (top-left corner), W and H, rotation in degrees (°), and corner radius (R) for rectangles and frames.'],
            ['Text', 'For text layers: the content and font size.'],
            ['Fill', 'Fill color. Click the swatch for a picker or type a 6-digit hex value.'],
            ['Stroke', 'Outline color and width. Width 0 means no outline (lines always have one).'],
            ['Layer opacity', '0–100% transparency for the whole layer.'],
            ['Arrange', 'Bring to front, send to back, duplicate, zoom to the selection, group, ungroup, or delete. Ordering applies among layers in the same frame or group.'],
          ]}
        />
      </Block>

      <Block title="Frames and groups" testId="guide-nesting">
        <Terms
          items={[
            ['Frames', 'Shapes you draw or drop on a frame go inside it, and the frame hides anything outside its edges. Moving a frame moves its contents; resizing it does not.'],
            [
              <>
                Groups <Shortcut binding={bindings['arrange.group'][0]} />
              </>,
              'Group the selection to move and resize it as one. Clicking a grouped layer selects the whole group; double-click to select inside it, or ⌘/Ctrl-click to go straight to the layer.',
            ],
            [
              <>
                Ungroup <Shortcut binding={bindings['arrange.ungroup'][0]} />
              </>,
              'Removes the group and keeps its layers in place. A group with no layers left is removed automatically.',
            ],
          ]}
        />
      </Block>

      <Block title="Saving your work" testId="guide-saving">
        <Terms
          items={[
            ['Autosave', 'Your design saves in this browser as you work and reopens next time.'],
            ['Export', 'Downloads the design as a .json file, for backups or moving to another computer.'],
            ['Import', 'Opens a previously exported .json file, replacing the current design. If the canvas has anything on it, you are asked first: importing also clears undo history.'],
          ]}
        />
      </Block>

      <Block title="Coming from another design tool?">
        <p className={mutedClass}>
          Tool shortcuts follow common design-tool conventions, and you can change any of them under Keyboard
          shortcuts. Draftboard is intentionally small: there are no components, auto layout, constraints,
          prototyping, comments or multiplayer.
        </p>
      </Block>
    </section>
  );
}
