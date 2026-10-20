import { useState } from 'react';
import { Button, ColorInput, NumberInput, Panel, Section, TextInput } from '../../design-system';
import { useEditor, useSelectedNodes } from '../EditorContext';
import { useViewportControls } from '../hooks/useViewportControls';
import { nameTaken } from '../model/nodes';
import type { Box, DesignNode, NodePatch } from '../model/types';
import { emptyHint, sidebarRight, twoColumnGrid } from '../styles';
import { CANVAS_FONT_FAMILY, measureText } from '../textMetrics';

function SingleNodeProperties({ node }: { node: DesignNode }) {
  const { state, dispatch } = useEditor();
  const [nameError, setNameError] = useState<string | null>(null);
  const patch = (p: NodePatch) => dispatch({ type: 'updateNodes', patches: { [node.id]: p } });
  const update = (p: NodePatch) => {
    dispatch({ type: 'checkpoint' });
    patch(p);
  };
  // Position and size go through transformNode so a frame's or group's children follow.
  const transform = (box: Partial<Box & { rotation: number }>) => dispatch({ type: 'transformNode', id: node.id, box });
  // A typed number checkpoints before applying. A scrub checkpoints once when it
  // starts and applies every tick transiently, so it is one undo step as well.
  const edits = (apply: (value: number) => void) => ({
    onCommit: (value: number) => {
      dispatch({ type: 'checkpoint' });
      apply(value);
    },
    onScrubStart: () => dispatch({ type: 'checkpoint' }),
    onScrubChange: apply,
  });
  const isGroup = node.type === 'group';
  const hasFill = node.type !== 'line' && !isGroup;
  const hasRadius = node.type === 'rect' || node.type === 'frame';

  return (
    <>
      <Section title="Layer" testId="section-layer">
        <TextInput
          value={node.name}
          testId="prop-name"
          error={nameError !== null ? `Another layer is already named “${nameError}”.` : undefined}
          onCommit={(value) => {
            const name = value.trim();
            if (nameTaken(state.nodes, name, node.id)) {
              setNameError(name);
              return;
            }
            setNameError(null);
            dispatch({ type: 'renameNode', id: node.id, name });
          }}
        />
      </Section>

      <Section title="Position & size">
        <div className={twoColumnGrid}>
          <NumberInput label="X" value={node.x} {...edits((x) => transform({ x }))} testId="prop-x" />
          <NumberInput label="Y" value={node.y} {...edits((y) => transform({ y }))} testId="prop-y" />
          <NumberInput label="W" value={node.width} min={node.type === 'line' ? 0 : 1} {...edits((width) => transform({ width }))} testId="prop-w" />
          <NumberInput label="H" value={node.height} min={node.type === 'line' ? 0 : 1} {...edits((height) => transform({ height }))} testId="prop-h" />
          {/* A group's box is derived from its children, so it has no rotation of its own. */}
          {!isGroup && (
            <NumberInput label="°" value={node.rotation} {...edits((rotation) => transform({ rotation }))} testId="prop-rotation" />
          )}
          {hasRadius && (
            <NumberInput label="R" value={node.cornerRadius} min={0} {...edits((cornerRadius) => patch({ cornerRadius }))} testId="prop-radius" />
          )}
        </div>
      </Section>

      {node.type === 'text' && (
        <Section title="Text">
          <TextInput
            value={node.text}
            testId="prop-text"
            onCommit={(text) => update({ text, ...measureText(text, node.fontSize, CANVAS_FONT_FAMILY) })}
          />
          <NumberInput
            label="Size"
            value={node.fontSize}
            min={1}
            testId="prop-font-size"
            {...edits((fontSize) => patch({ fontSize, ...measureText(node.text, fontSize, CANVAS_FONT_FAMILY) }))}
          />
        </Section>
      )}

      {hasFill && (
        <Section title="Fill">
          <ColorInput value={node.fill} onCommit={(fill) => update({ fill })} testId="prop-fill" />
        </Section>
      )}

      {!isGroup && (
        <Section title="Stroke">
          <div className={twoColumnGrid}>
            <ColorInput value={node.stroke} onCommit={(stroke) => update({ stroke })} testId="prop-stroke" />
            <NumberInput label="W" value={node.strokeWidth} min={0} {...edits((strokeWidth) => patch({ strokeWidth }))} testId="prop-stroke-width" />
          </div>
        </Section>
      )}

      <Section title="Layer opacity">
        <NumberInput
          label="%"
          value={Math.round(node.opacity * 100)}
          min={0}
          max={100}
          {...edits((pct) => patch({ opacity: pct / 100 }))}
          testId="prop-opacity"
        />
      </Section>
    </>
  );
}

export function PropertiesPanel() {
  const { dispatch } = useEditor();
  const selected = useSelectedNodes();
  const { zoomToSelection } = useViewportControls();
  const single = selected.length === 1 ? selected[0] : undefined;
  const hasGroup = selected.some((n) => n.type === 'group');

  return (
    <Panel className={sidebarRight} data-testid="properties-panel">
      {selected.length === 0 && (
        <Section title="Design">
          <p className={emptyHint}>Select a layer to edit its properties.</p>
        </Section>
      )}
      {single && <SingleNodeProperties key={single.id} node={single} />}
      {selected.length > 1 && (
        <Section title={`${selected.length} layers selected`}>
          <p className={emptyHint}>Drag to move them together, or use ⌘D / Delete.</p>
        </Section>
      )}
      {selected.length > 0 && (
        <Section title="Arrange">
          <div className={twoColumnGrid}>
            <Button onClick={() => dispatch({ type: 'reorderSelection', direction: 'front' })}>Bring to front</Button>
            <Button onClick={() => dispatch({ type: 'reorderSelection', direction: 'back' })}>Send to back</Button>
            <Button onClick={() => dispatch({ type: 'duplicateSelection' })}>Duplicate</Button>
            <Button onClick={zoomToSelection}>Zoom to</Button>
            <Button data-testid="group-selection" onClick={() => dispatch({ type: 'groupSelection' })}>
              Group
            </Button>
            <Button data-testid="ungroup-selection" disabled={!hasGroup} onClick={() => dispatch({ type: 'ungroupSelection' })}>
              Ungroup
            </Button>
          </div>
          <Button data-testid="delete-selection" onClick={() => dispatch({ type: 'deleteSelection' })}>
            Delete
          </Button>
        </Section>
      )}
    </Panel>
  );
}
