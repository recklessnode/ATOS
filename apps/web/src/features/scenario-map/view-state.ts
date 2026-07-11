import type { Bounds, Point, ViewportSize, ViewTransform } from "@atos/layout";
import { fitBoundsToViewport, panBy, zoomAtPoint } from "@atos/layout";

export const DEFAULT_VIEWPORT: ViewportSize = {
  width: 960,
  height: 620,
};

export type ScenarioMapViewState = ViewTransform;

export type ViewAction =
  | { type: "fit"; bounds: Bounds; viewport: ViewportSize }
  | { type: "focus"; bounds: Bounds; viewport: ViewportSize }
  | { type: "reset"; initial: ScenarioMapViewState }
  | { type: "pan"; delta: Point }
  | { type: "zoom"; viewportPoint: Point; scaleMultiplier: number };

export function initialViewState(bounds: Bounds, viewport: ViewportSize = DEFAULT_VIEWPORT): ScenarioMapViewState {
  return fitBoundsToViewport(bounds, viewport, 44);
}

export function reduceViewState(state: ScenarioMapViewState, action: ViewAction): ScenarioMapViewState {
  switch (action.type) {
    case "fit":
      return fitBoundsToViewport(action.bounds, action.viewport, 44);
    case "focus":
      return fitBoundsToViewport(action.bounds, action.viewport, 120);
    case "reset":
      return action.initial;
    case "pan":
      return panBy(state, action.delta);
    case "zoom":
      return zoomAtPoint(state, action.viewportPoint, action.scaleMultiplier);
  }
}

export function svgTransform(state: ScenarioMapViewState): string {
  return `translate(${round(state.translateX)} ${round(state.translateY)}) scale(${round(state.scale)})`;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
