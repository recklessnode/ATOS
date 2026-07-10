import { parseScenarioDocument, type ScenarioParseResult } from "./parser";
import { SCENARIO_SCHEMA_VERSION } from "./v1";

export function migrateScenarioDocument(input: unknown): ScenarioParseResult {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return {
      ok: false,
      errors: [{ path: "$", code: "expected_object", message: "Scenario input must be an object." }],
    };
  }

  const schemaVersion = (input as { schemaVersion?: unknown }).schemaVersion;
  if (typeof schemaVersion !== "number") {
    return {
      ok: false,
      errors: [
        {
          path: "$.schemaVersion",
          code: "missing_schema_version",
          message: "Scenario input must include a numeric schemaVersion.",
        },
      ],
    };
  }

  if (schemaVersion > SCENARIO_SCHEMA_VERSION) {
    return {
      ok: false,
      errors: [
        {
          path: "$.schemaVersion",
          code: "unsupported_future_schema_version",
          message: `Scenario schema version ${schemaVersion} is newer than supported version ${SCENARIO_SCHEMA_VERSION}.`,
        },
      ],
    };
  }

  return parseScenarioDocument(input);
}
