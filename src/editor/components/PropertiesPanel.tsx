import { useState } from 'react';
import { css } from 'styled-system/css';
import { Button, ColorInput, IconButton, icons, NumberInput, Panel, Section, TextInput } from '../../design-system';
import type { CommandId } from '../../settings/keybindings/commands';
import { useCommandTitle } from '../../settings/keybindings/useCommandTitle';
import { useEditor, useSelectedNodes } from '../EditorContext';
import { useViewportControls } from '../hooks/useViewportControls';
import { nameTaken } from '../model/names';
import { minSizeFor } from '../model/nodes';
import { byIdOf, topLevelIds } from '../model/tree';
import type { Box, DesignNode, NodePatch } from '../model/types';
import { useSectionFold } from '../SectionFoldsContext';
import { emptyHint, sidebar, twoColumnGrid } from '../styles';
import { CANVAS_FONT_FAMILY, measureText } from '../textMetrics';
import { ConnectorProperties } from './ConnectorProperties';
import { TableProperties } from './TableProperties';

function SingleNodeProperties({ node }: { node: DesignNode }) {
  const { state, dispatch } = useEditor();
  const [nameError, setNameError] = useState<string | null>(null);
  const fold = useSectionFold();
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
  // A table's height follows its rows and it never rotates, like a group's box follows its children.
  const isTable = node.type === 'table';
  const isConnector = node.type === 'connector';
  const hasFill = node.type !== 'line' && !isGroup && !isConnector;
  const hasRadius = node.type === 'rect' || node.type === 'frame';

  return (
    <>
      <Section title="Layer" testId="section-layer" {...fold('layer')}>
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
        {/* A connector's place and size come from its ends. */}
        {!isConnector && (
          <div className={twoColumnGrid}>
            <NumberInput label="X" name="X" value={node.x} {...edits((x) => transform({ x }))} testId="prop-x" />
            <NumberInput label="Y" name="Y" value={node.y} {...edits((y) => transform({ y }))} testId="prop-y" />
            <NumberInput label="W" name="Width" value={node.width} min={minSizeFor(node.type).width} {...edits((width) => transform({ width }))} testId="prop-w" />
            {!isTable && (
              <NumberInput label="H" name="Height" value={node.height} min={minSizeFor(node.type).height} {...edits((height) => transform({ height }))} testId="prop-h" />
            )}
            {/* A group's box is derived from its children, so it has no rotation of its own. */}
            {!isGroup && !isTable && (
              <NumberInput label="°" name="Rotation" value={node.rotation} {...edits((rotation) => transform({ rotation }))} testId="prop-rotation" />
            )}
            {hasRadius && (
              <NumberInput label="R" name="Corner radius" value={node.cornerRadius} min={0} {...edits((cornerRadius) => patch({ cornerRadius }))} testId="prop-radius" />
            )}
          </div>
        )}
      </Section>

      {node.type === 'table' && <TableProperties table={node} />}
      {node.type === 'connector' && <ConnectorProperties connector={node} />}

      {node.type === 'text' && (
        <Section title="Text" {...fold('text')}>
          <TextInput
            value={node.text}
            testId="prop-text"
            onCommit={(text) => update({ text, ...measureText(text, node.fontSize, CANVAS_FONT_FAMILY) })}
          />
          <NumberInput
            label="Size"
            name="Font size"
            value={node.fontSize}
            min={1}
            testId="prop-font-size"
            {...edits((fontSize) => patch({ fontSize, ...measureText(node.text, fontSize, CANVAS_FONT_FAMILY) }))}
          />
        </Section>
      )}

      <Section title="Appearance" {...fold('appearance')}>
        {hasFill && <ColorInput label="Fill" value={node.fill} onCommit={(fill) => update({ fill })} testId="prop-fill" />}
        {!isGroup && (
          <div className={twoColumnGrid}>
            <ColorInput label="Stroke" value={node.stroke} onCommit={(stroke) => update({ stroke })} testId="prop-stroke" />
            <NumberInput
              label={<icons.strokeWidth />}
              name="Stroke width"
              value={node.strokeWidth}
              min={0}
              {...edits((strokeWidth) => patch({ strokeWidth }))}
              testId="prop-stroke-width"
            />
          </div>
        )}
        <NumberInput
          label={<icons.opacity />}
          name="Opacity"
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

const buttonRow = css({ display: 'flex', flexWrap: 'wrap', gap: '1' });

/** The shared value of `pick` over the layers, or `mixed` when they differ. */
function shared<T>(nodes: DesignNode[], pick: (n: DesignNode) => T): { value: T; mixed: boolean } {
  const first = pick(nodes[0] as DesignNode);
  return { value: first, mixed: nodes.some((n) => pick(n) !== first) };
}

/** Align and distribute for the whole selection, then the Appearance fields every selected layer has. */
function MultiProperties({ nodes }: { nodes: DesignNode[] }) {
  const { state, dispatch } = useEditor();
  const title = useCommandTitle();
  const fold = useSectionFold();
  // Connectors take no part in aligning, so they don't count toward the minimums.
  const movable = topLevelIds(byIdOf(state.nodes), state.selection).filter((id) => byIdOf(state.nodes).get(id)?.type !== 'connector').length;
  const aligns: Array<[CommandId, string, 'left' | 'centerX' | 'right' | 'top' | 'centerY' | 'bottom', keyof typeof icons]> = [
    ['arrange.alignLeft', 'align-left', 'left', 'alignLeft'],
    ['arrange.alignCenterX', 'align-center-x', 'centerX', 'alignCenterX'],
    ['arrange.alignRight', 'align-right', 'right', 'alignRight'],
    ['arrange.alignTop', 'align-top', 'top', 'alignTop'],
    ['arrange.alignCenterY', 'align-center-y', 'centerY', 'alignCenterY'],
    ['arrange.alignBottom', 'align-bottom', 'bottom', 'alignBottom'],
  ];
  const distributes: Array<[CommandId, string, 'horizontal' | 'vertical', keyof typeof icons]> = [
    ['arrange.distributeH', 'distribute-h', 'horizontal', 'distributeH'],
    ['arrange.distributeV', 'distribute-v', 'vertical', 'distributeV'],
  ];

  // One undo step for an edit across all layers, like a single layer's.
  const patchAll = (p: NodePatch) => dispatch({ type: 'updateNodes', patches: Object.fromEntries(nodes.map((n) => [n.id, p])) });
  const updateAll = (p: NodePatch) => {
    dispatch({ type: 'checkpoint' });
    patchAll(p);
  };
  const hasFill = nodes.every((n) => n.type !== 'line' && n.type !== 'group' && n.type !== 'connector');
  const hasStroke = nodes.every((n) => n.type !== 'group');
  const fill = shared(nodes, (n) => n.fill);
  const stroke = shared(nodes, (n) => n.stroke);
  const strokeWidth = shared(nodes, (n) => n.strokeWidth);
  const opacity = shared(nodes, (n) => Math.round(n.opacity * 100));
  // A scrub starts from one value, so it is only offered when the layers agree.
  const scrubs = (field: { mixed: boolean }, apply: (value: number) => void) => ({
    onCommit: (value: number) => {
      dispatch({ type: 'checkpoint' });
      apply(value);
    },
    ...(field.mixed ? {} : { onScrubStart: () => dispatch({ type: 'checkpoint' }), onScrubChange: apply }),
  });

  return (
    <>
      <Section title={`${nodes.length} layers selected`}>
        <div className={buttonRow} role="group" aria-label="Align and distribute">
          {aligns.map(([id, testId, align, icon]) => {
            const Glyph = icons[icon];
            return (
              <IconButton
                key={id}
                label={title(id)}
                icon={<Glyph />}
                data-testid={testId}
                disabled={movable < 2}
                onClick={() => dispatch({ type: 'alignSelection', align })}
              />
            );
          })}
          {distributes.map(([id, testId, axis, icon]) => {
            const Glyph = icons[icon];
            return (
              <IconButton
                key={id}
                label={title(id)}
                icon={<Glyph />}
                data-testid={testId}
                disabled={movable < 3}
                onClick={() => dispatch({ type: 'distributeSelection', axis })}
              />
            );
          })}
        </div>
      </Section>
      <Section title="Appearance" {...fold('appearance')}>
        {hasFill && <ColorInput label="Fill" value={fill.value} mixed={fill.mixed} onCommit={(v) => updateAll({ fill: v })} testId="prop-fill" />}
        {hasStroke && (
          <div className={twoColumnGrid}>
            <ColorInput label="Stroke" value={stroke.value} mixed={stroke.mixed} onCommit={(v) => updateAll({ stroke: v })} testId="prop-stroke" />
            <NumberInput
              label={<icons.strokeWidth />}
              name="Stroke width"
              value={strokeWidth.value}
              mixed={strokeWidth.mixed}
              min={0}
              {...scrubs(strokeWidth, (v) => patchAll({ strokeWidth: v }))}
              testId="prop-stroke-width"
            />
          </div>
        )}
        <NumberInput
          label={<icons.opacity />}
          name="Opacity"
          value={opacity.value}
          mixed={opacity.mixed}
          min={0}
          max={100}
          {...scrubs(opacity, (pct) => patchAll({ opacity: pct / 100 }))}
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
  const fold = useSectionFold();
  const title = useCommandTitle();
  const single = selected.length === 1 ? selected[0] : undefined;
  const hasGroup = selected.some((n) => n.type === 'group');

  return (
    <Panel className={sidebar} data-testid="properties-panel">
      {selected.length === 0 && (
        <Section>
          <p className={emptyHint}>Select a layer to edit its properties.</p>
        </Section>
      )}
      {single && <SingleNodeProperties key={single.id} node={single} />}
      {selected.length > 1 && <MultiProperties nodes={selected} />}
      {selected.length > 0 && (
        <Section title="Arrange" {...fold('arrange')}>
          <div className={buttonRow}>
            <IconButton
              label={title('arrange.front')}
              icon={<icons.bringToFront />}
              data-testid="bring-to-front"
              onClick={() => dispatch({ type: 'reorderSelection', direction: 'front' })}
            />
            <IconButton
              label={title('arrange.back')}
              icon={<icons.sendToBack />}
              data-testid="send-to-back"
              onClick={() => dispatch({ type: 'reorderSelection', direction: 'back' })}
            />
            <IconButton label={title('edit.duplicate')} icon={<icons.duplicate />} data-testid="duplicate-selection" onClick={() => dispatch({ type: 'duplicateSelection' })} />
            <IconButton label={title('arrange.group')} icon={<icons.group />} data-testid="group-selection" onClick={() => dispatch({ type: 'groupSelection' })} />
            <IconButton
              label={title('arrange.ungroup')}
              icon={<icons.ungroup />}
              data-testid="ungroup-selection"
              disabled={!hasGroup}
              onClick={() => dispatch({ type: 'ungroupSelection' })}
            />
            <IconButton label={title('edit.delete')} icon={<icons.trash />} data-testid="delete-selection" onClick={() => dispatch({ type: 'deleteSelection' })} />
          </div>
          <Button onClick={zoomToSelection}>Zoom to selection</Button>
        </Section>
      )}
    </Panel>
  );
}
