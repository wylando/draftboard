import { describe, expect, it } from 'vitest';
import { contrastRatio, semanticColor } from '../design-system/theme/contrast';
import { INK_DARK_BACKGROUND, INK_LIGHT_BACKGROUND, defaultInk } from './ink';
import { createNode } from './model/nodes';
import type { DesignNode } from './model/types';

const frame = (fill: string, x = 0): DesignNode => ({ ...createNode('frame', { x, y: 0, width: 200, height: 200 }, []), fill });

describe('default ink for new text and lines', () => {
  it('is black on a light canvas and the light ink on a dark one', () => {
    expect(defaultInk([], { x: 10, y: 10 }, false)).toBe(INK_LIGHT_BACKGROUND);
    expect(defaultInk([], { x: 10, y: 10 }, true)).toBe(INK_DARK_BACKGROUND);
  });

  it('follows the fill of the frame under the point, not the canvas', () => {
    const nodes = [frame('#ffffff')];
    expect(defaultInk(nodes, { x: 50, y: 50 }, true)).toBe(INK_LIGHT_BACKGROUND);
    expect(defaultInk([frame('#1e1e1e')], { x: 50, y: 50 }, false)).toBe(INK_DARK_BACKGROUND);
  });

  it('uses the canvas outside every frame', () => {
    expect(defaultInk([frame('#ffffff')], { x: 900, y: 900 }, true)).toBe(INK_DARK_BACKGROUND);
  });

  it('holds 4.5:1 on the dark canvas and on a dark frame fill', () => {
    expect(contrastRatio(INK_DARK_BACKGROUND, semanticColor('bg.canvas', 'dark'))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(INK_DARK_BACKGROUND, '#1e1e1e')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(INK_LIGHT_BACKGROUND, '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });
});

describe('createNode ink', () => {
  const box = { x: 0, y: 0, width: 100, height: 20 };

  it('colours text and lines with the ink, and defaults to black', () => {
    for (const type of ['text', 'line'] as const) {
      const node = createNode(type, box, [], 'uuid', '#e6e6e6');
      expect([node.fill, node.stroke]).toEqual(['#e6e6e6', '#e6e6e6']);
      const plain = createNode(type, box, []);
      expect([plain.fill, plain.stroke]).toEqual(['#000000', '#000000']);
    }
  });

  it('leaves other shapes alone', () => {
    const rect = createNode('rect', box, [], 'uuid', '#e6e6e6');
    expect([rect.fill, rect.stroke]).toEqual(['#d9d9d9', '#000000']);
    expect(createNode('frame', box, [], 'uuid', '#e6e6e6').fill).toBe('#ffffff');
  });
});
