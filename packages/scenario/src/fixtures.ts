import sixTileCity from "../fixtures/six-tile-city-v1.json";
import { parseScenarioDocument } from "./parser";
import type { ScenarioDocumentV1, ScenarioSummary } from "./v1";
import { summarizeScenarioDocument } from "./v1";

export const sixTileCityFixture = sixTileCity as unknown;

export function loadSixTileCityFixture(): ScenarioDocumentV1 {
  const result = parseScenarioDocument(sixTileCityFixture);
  if (!result.ok) {
    throw new Error(result.errors.map((error) => error.message).join("\n"));
  }
  return result.document;
}

export function getSixTileCitySummary(): ScenarioSummary {
  return summarizeScenarioDocument(loadSixTileCityFixture());
}
