import { Button, ColorInput, NumberInput, Panel, Section, TextInput } from '../../design-system';
import { useEditor, useSelectedNodes } from '../EditorContext';
import { useViewportControls } from '../hooks/useViewportControls';
import { minSizeFor } from '../model/nodes';
import type { Box, DesignNode, NodePatch } from '../model/types';
import { emptyHint, sidebarRight, twoColumnGrid } from '../styles';
import { CANVAS_FONT_FAMILY, measureText } from '../textMetrics';

function useUpdate(node: DesignNode) {
  const { dispatch } = useEditor();
  return (patch: NodePatch) => {
    dispatch({ type: 'checkpoint' });
    dispatch({ type: 'updateNodes', patches: { [node.id]: patch } });
  };
}

/** Position and size go through transformNode so a frame's or group's children follow. */
function useUpdateBox(node: DesignNode) {
  const { dispatch } = useEditor();
  return (box: Partial<Box & { rotation: number }>) => {
    dispatch({ type: 'checkpoint' });
    dispatch({ type: 'transformNode', id: node.id, box });
  };
}

function SingleNodeProperties({ node }: { node: DesignNode }) {
  const update = useUpdate(node);
  const updateBox = useUpdateBox(node);
  const isGroup = node.type === 'group';
  // Lines, arrows and strokes are drawn with their stroke color only.
  const hasFill = !['line', 'arrow', 'path', 'image', 'group'].includes(node.type);
  const hasStroke = node.type !== 'group' && node.type !== 'image';
  const hasRadius = node.type === 'rect' || node.type === 'frame';
  const minSize = minSizeFor(node.type);

  return (
    <>
      <Section title="Layer" testId="section-layer">
        <TextInput value={node.name} onCommit={(name) => update({ name })} testId="prop-name" />
      </Section>

      <Section title="Position & size">
        <div className={twoColumnGrid}>
          <NumberInput label="X" value={node.x} onCommit={(x) => updateBox({ x })} testId="prop-x" />
          <NumberInput label="Y" value={node.y} onCommit={(y) => updateBox({ y })} testId="prop-y" />
          <NumberInput label="W" value={node.width} min={minSize} onCommit={(width) => updateBox({ width })} testId="prop-w" />
          <NumberInput label="H" value={node.height} min={minSize} onCommit={(height) => updateBox({ height })} testId="prop-h" />
          {/* A group's box is derived from its children, so it has no rotation of its own. */}
          {!isGroup && (
            <NumberInput label="°" value={node.rotation} onCommit={(rotation) => updateBox({ rotation })} testId="prop-rotation" />
          )}
          {hasRadius && (
            <NumberInput label="R" value={node.cornerRadius} min={0} onCommit={(cornerRadius) => update({ cornerRadius })} testId="prop-radius" />
          )}
        </div>
      </Section>

      {node.type === 'polygon' && (
        <Section title="Polygon">
          <NumberInput label="Sides" value={node.sides} min={3} max={60} onCommit={(sides) => update({ sides: Math.round(sides) })} testId="prop-sides" />
        </Section>
      )}

      {node.type === 'star' && (
        <Section title="Star">
          <div className={twoColumnGrid}>
            <NumberInput label="Points" value={node.points} min={3} max={60} onCommit={(points) => update({ points: Math.round(points) })} testId="prop-points" />
            <NumberInput
              label="Inner %"
              value={Math.round(node.innerRatio * 100)}
              min={1}
              max={99}
              onCommit={(pct) => update({ innerRatio: pct / 100 })}
              testId="prop-inner"
            />
          </div>
        </Section>
      )}

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
            onCommit={(fontSize) => update({ fontSize, ...measureText(node.text, fontSize, CANVAS_FONT_FAMILY) })}
          />
        </Section>
      )}

      {hasFill && (
        <Section title="Fill">
          <ColorInput value={node.fill} onCommit={(fill) => update({ fill })} testId="prop-fill" />
        </Section>
      )}

      {hasStroke && (
        <Section title="Stroke">
          <div className={twoColumnGrid}>
            <ColorInput value={node.stroke} onCommit={(stroke) => update({ stroke })} testId="prop-stroke" />
            <NumberInput label="W" value={node.strokeWidth} min={0} onCommit={(strokeWidth) => update({ strokeWidth })} testId="prop-stroke-width" />
          </div>
        </Section>
      )}

      <Section title="Layer opacity">
        <NumberInput
          label="%"
          value={Math.round(node.opacity * 100)}
          min={0}
          max={100}
          onCommit={(pct) => update({ opacity: pct / 100 })}
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
