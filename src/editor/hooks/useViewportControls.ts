import { useMemo } from 'react';
import { fitBox, rotatedBounds, unionBoxes, zoomAt } from '../geometry';
import { useEditor } from '../EditorContext';

const ZOOM_STEP = 2;

export function useViewportControls() {
  const { state, dispatch } = useEditor();
  const { viewport, canvasSize, nodes, selection } = state;

  return useMemo(() => {
    const center = { x: canvasSize.width / 2, y: canvasSize.height / 2 };
    const setZoom = (zoom: number) => dispatch({ type: 'setViewport', viewport: zoomAt(viewport, center, zoom) });
    const fit = (ids?: string[]) => {
      const targets = nodes.filter((n) => n.visible && (!ids || ids.includes(n.id)));
      const bounds = unionBoxes(targets.map((n) => rotatedBounds(n, n.rotation)));
      if (bounds) dispatch({ type: 'setViewport', viewport: fitBox(bounds, canvasSize) });
    };
    return {
      zoom: viewport.zoom,
      zoomIn: () => setZoom(viewport.zoom * ZOOM_STEP),
      zoomOut: () => setZoom(viewport.zoom / ZOOM_STEP),
      zoomTo100: () => setZoom(1),
      zoomToFit: () => fit(),
      zoomToSelection: () => fit(selection),
    };
  }, [viewport, canvasSize, nodes, selection, dispatch]);
}
