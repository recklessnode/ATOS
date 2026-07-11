import { loadSixTileCityFixture } from "@atos/scenario";
import { createDispatchPlannerInput, planDispatch } from "./planner";
import type { DispatchPlannerOptions, DispatchPlannerResult } from "./types";

export function planSixTileCityDispatch(
  options: DispatchPlannerOptions = {},
): DispatchPlannerResult {
  return planDispatch(createDispatchPlannerInput(loadSixTileCityFixture(), options));
}
