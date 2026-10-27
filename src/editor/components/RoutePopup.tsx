import { css } from 'styled-system/css';
import { popup } from 'styled-system/recipes';
import { CanvasPopup } from '../../design-system';
import { placePopup, rotatedBounds } from '../geometry';
import { cheapestJoinPath, type ById } from '../model/tree';
import type { Box, Viewport } from '../model/types';

type JoinPath = NonNullable<ReturnType<typeof cheapestJoinPath>>;

/** Design choice: screen px kept clear between the popup and the route, so its outline stays readable. */
const ROUTE_GAP = 12;

const routeList = css({ margin: '0', paddingLeft: '0', listStyle: 'none', display: 'grid', gap: '1' });
const routeKind = css({ color: 'text.onToolbarSecondary' });
const noRoute = css({ margin: '0', color: 'text.onToolbarSecondary' });

function RouteSteps({ route, byId, testId }: { route: JoinPath['route']; byId: ById; testId: string }) {
  return (
    // Safari drops list semantics from an unstyled list unless the role is explicit.
    <ol className={routeList} role="list">
      {route.map(({ table, via }) => (
        <li key={table} data-testid={testId}>
          {via && <span aria-hidden="true">→ </span>}
          {byId.get(table)?.name}
          {via && (
            <span className={routeKind}>
              <span aria-hidden="true"> · </span>
              {via.indexed ? 'index lookup' : 'scan'}
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

/** What the popup must not cover, in canvas px: the route's tables (or the two selected ones) and each leg of its links. */
function routeBoxes(path: JoinPath, ends: readonly string[], byId: ById, vp: Viewport): Box[] {
  const toScreen = (b: Box): Box => ({ x: vp.x + b.x * vp.zoom, y: vp.y + b.y * vp.zoom, width: b.width * vp.zoom, height: b.height * vp.zoom });
  const boxes: Box[] = [];
  for (const id of new Set([...ends, ...path.tables])) {
    const node = byId.get(id);
    if (node) boxes.push(toScreen(rotatedBounds(node, node.rotation)));
  }
  // Legs rather than the connector's box: an L-shaped link's box is mostly empty room the popup may use.
  for (const id of path.connectors) {
    const node = byId.get(id);
    if (node?.type !== 'connector') continue;
    for (let i = 1; i < node.points.length; i++) {
      const a = node.points[i - 1]!;
      const b = node.points[i]!;
      const x = Math.min(a.x, b.x);
      const y = Math.min(a.y, b.y);
      boxes.push(toScreen({ x, y, width: Math.max(a.x, b.x) - x, height: Math.max(a.y, b.y) - y }));
    }
  }
  return boxes;
}

/**
 * The estimated fastest route between two selected tables, and the guaranteed one when it differs, in a popup
 * beside the highlighted route. `ends` are the two selected tables.
 */
export function RoutePopup({ path, ends, byId, viewport, onClose }: {
  path: JoinPath;
  ends: readonly string[];
  byId: ById;
  viewport: Viewport;
  onClose: () => void;
}) {
  const classes = popup();
  const guaranteed = cheapestJoinPath(ends, byId, true);
  // Equal-cost ties can make the guaranteed search pick another route, so judge the fastest route itself.
  const showGuaranteed = !!guaranteed?.route.length && path.route.some((s) => s.via && !s.via.guaranteed);
  const avoid = routeBoxes(path, ends, byId, viewport);
  return (
    <CanvasPopup
      title="Estimated fastest route"
      onClose={onClose}
      place={(size, area) => placePopup(avoid, size, area, ROUTE_GAP)}
      testId="route-popup"
    >
      {path.route.length === 0 ? (
        <p className={noRoute} data-testid="join-route-none">No route between these tables.</p>
      ) : (
        <RouteSteps route={path.route} byId={byId} testId="join-route-step" />
      )}
      {showGuaranteed && guaranteed && (
        <section className={classes.section} data-testid="route-popup-guaranteed">
          <h3 className={classes.label}>Guaranteed route</h3>
          <RouteSteps route={guaranteed.route} byId={byId} testId="guaranteed-route-step" />
        </section>
      )}
    </CanvasPopup>
  );
}
