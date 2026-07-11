import type { AxialCoordinate, EdgeIndex, PlacedTile } from "./hex";
import { EDGE_INDEXES, mapLocalEdge } from "./hex";

export type Point = {
  x: number;
  y: number;
};

export type Bounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export type ViewTransform = {
  scale: number;
  translateX: number;
  translateY: number;
};

export type ViewportSize = {
  width: number;
  height: number;
};

export const MIN_VIEW_SCALE = 0.35;
export const MAX_VIEW_SCALE = 5;

// Projection convention: pointy-top axial coordinates, origin at q=0/r=0,
// x positive east, y positive south in SVG screen space.
export function axialToPixel(coordinate: AxialCoordinate, radius: number): Point {
  return {
    x: Math.sqrt(3) * radius * (coordinate.q + coordinate.r / 2),
    y: 1.5 * radius * coordinate.r,
  };
}

export function pointyTopHexPoints(center: Point, radius: number): Point[] {
  return [0, 1, 2, 3, 4, 5].map((index) => {
    const angleRadians = ((-90 + index * 60) * Math.PI) / 180;
    return {
      x: center.x + radius * Math.cos(angleRadians),
      y: center.y + radius * Math.sin(angleRadians),
    };
  });
}

export function polygonPoints(points: readonly Point[]): string {
  return points.map((point) => `${round(point.x)},${round(point.y)}`).join(" ");
}

export function edgeAnchorPoint(center: Point, edge: EdgeIndex, radius: number, inset = 0.72): Point {
  const angleRadians = (-edge * 60 * Math.PI) / 180;
  return {
    x: center.x + radius * inset * Math.cos(angleRadians),
    y: center.y + radius * inset * Math.sin(angleRadians),
  };
}

export function tileEdgeAnchorPoint(
  tile: Pick<PlacedTile, "coordinate" | "orientation">,
  localEdge: EdgeIndex,
  radius: number,
  inset = 0.72,
): Point {
  return edgeAnchorPoint(
    axialToPixel(tile.coordinate, radius),
    mapLocalEdge(localEdge, tile.orientation),
    radius,
    inset,
  );
}

export function boundsFromPoints(points: readonly Point[], padding = 0): Bounds {
  if (points.length === 0) {
    return { minX: -padding, minY: -padding, maxX: padding, maxY: padding };
  }

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    minX: Math.min(...xs) - padding,
    minY: Math.min(...ys) - padding,
    maxX: Math.max(...xs) + padding,
    maxY: Math.max(...ys) + padding,
  };
}

export function mapBoundsForTiles(
  tiles: readonly Pick<PlacedTile, "coordinate">[],
  radius: number,
  padding = radius * 0.5,
): Bounds {
  const points = tiles.flatMap((tile) => pointyTopHexPoints(axialToPixel(tile.coordinate, radius), radius));
  return boundsFromPoints(points, padding);
}

export function mergeBounds(bounds: readonly Bounds[]): Bounds {
  if (bounds.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }

  return {
    minX: Math.min(...bounds.map((bound) => bound.minX)),
    minY: Math.min(...bounds.map((bound) => bound.minY)),
    maxX: Math.max(...bounds.map((bound) => bound.maxX)),
    maxY: Math.max(...bounds.map((bound) => bound.maxY)),
  };
}

export function clampScale(scale: number): number {
  if (!Number.isFinite(scale)) {
    return 1;
  }
  return Math.min(MAX_VIEW_SCALE, Math.max(MIN_VIEW_SCALE, scale));
}

export function fitBoundsToViewport(
  bounds: Bounds,
  viewport: ViewportSize,
  padding = 32,
): ViewTransform {
  const boundedWidth = Math.max(1, bounds.maxX - bounds.minX);
  const boundedHeight = Math.max(1, bounds.maxY - bounds.minY);
  const availableWidth = Math.max(1, viewport.width - padding * 2);
  const availableHeight = Math.max(1, viewport.height - padding * 2);
  const scale = clampScale(Math.min(availableWidth / boundedWidth, availableHeight / boundedHeight));
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;

  return {
    scale,
    translateX: viewport.width / 2 - centerX * scale,
    translateY: viewport.height / 2 - centerY * scale,
  };
}

export function zoomAtPoint(
  transform: ViewTransform,
  viewportPoint: Point,
  scaleMultiplier: number,
): ViewTransform {
  const nextScale = clampScale(transform.scale * scaleMultiplier);
  const worldX = (viewportPoint.x - transform.translateX) / transform.scale;
  const worldY = (viewportPoint.y - transform.translateY) / transform.scale;

  return {
    scale: nextScale,
    translateX: viewportPoint.x - worldX * nextScale,
    translateY: viewportPoint.y - worldY * nextScale,
  };
}

export function panBy(transform: ViewTransform, delta: Point): ViewTransform {
  return {
    scale: clampScale(transform.scale),
    translateX: finiteOr(delta.x + transform.translateX, transform.translateX),
    translateY: finiteOr(delta.y + transform.translateY, transform.translateY),
  };
}

export function edgeAnchorPointsByLocalEdge(
  center: Point,
  orientation: number,
  radius: number,
): Record<EdgeIndex, Point> {
  return Object.fromEntries(
    EDGE_INDEXES.map((localEdge) => [
      localEdge,
      edgeAnchorPoint(center, mapLocalEdge(localEdge, orientation), radius),
    ]),
  ) as Record<EdgeIndex, Point>;
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
