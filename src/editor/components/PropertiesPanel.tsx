import { Button, ColorInput, NumberInput, Panel, Section, TextInput } from '../../design-system';
import { useEditor, useSelectedNodes } from '../EditorContext';
import { useViewportControls } from '../hooks/useViewportControls';
import type { DesignNode, NodePatch } from '../model/types';
import { emptyHint, sidebarRight, twoColumnGrid } from '../styles';
import { CANVAS_FONT_FAMILY, measureText } from '../textMetrics';

function useUpdate(node: DesignNode) {
  const { dispatch } = useEditor();
  return (patch: NodePatch) => {
    dispatch({ type: 'checkpoint' });
    dispatch({ type: 'updateNodes', patches: { [node.id]: patch } });
  };
}

function SingleNodeProperties({ node }: { node: DesignNode }) {
  const update = useUpdate(node);
  const hasFill = node.type !== 'line';
  const hasRadius = node.type === 'rect' || node.type === 'frame';

  return (
    <>
      <Section title="Layer" testId="section-layer">
        <TextInput value={node.name} onCommit={(name) => update({ name })} testId="prop-name" />
      </Section>

      <Section title="Position & size">
        <div className={twoColumnGrid}>
          <NumberInput label="X" value={node.x} onCommit={(x) => update({ x })} testId="prop-x" />
          <NumberInput label="Y" value={node.y} onCommit={(y) => update({ y })} testId="prop-y" />
          <NumberInput label="W" value={node.width} min={node.type === 'line' ? 0 : 1} onCommit={(width) => update({ width })} testId="prop-w" />
          <NumberInput label="H" value={node.height} min={node.type === 'line' ? 0 : 1} onCommit={(height) => update({ height })} testId="prop-h" />
          <NumberInput label="°" value={node.rotation} onCommit={(rotation) => update({ rotation })} testId="prop-rotation" />
          {hasRadius && (
            <NumberInput label="R" value={node.cornerRadius} min={0} onCommit={(cornerRadius) => update({ cornerRadius })} testId="prop-radius" />
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
            onCommit={(fontSize) => update({ fontSize, ...measureText(node.text, fontSize, CANVAS_FONT_FAMILY) })}
          />
        </Section>
      )}

      {hasFill && (
        <Section title="Fill">
          <ColorInput value={node.fill} onCommit={(fill) => update({ fill })} testId="prop-fill" />
        </Section>
      )}

      <Section title="Stroke">
        <div className={twoColumnGrid}>
          <ColorInput value={node.stroke} onCommit={(stroke) => update({ stroke })} testId="prop-stroke" />
          <NumberInput label="W" value={node.strokeWidth} min={0} onCommit={(strokeWidth) => update({ strokeWidth })} testId="prop-stroke-width" />
        </div>
      </Section>

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
          </div>
          <Button data-testid="delete-selection" onClick={() => dispatch({ type: 'deleteSelection' })}>
            Delete
          </Button>
        </Section>
      )}
    </Panel>
  );
}
