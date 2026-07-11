import { migrateScenarioDocument, serializeScenarioDocument, type ValidationIssue } from "@atos/scenario";
import { rebuildScenarioDocument } from "./rebuild";
import type { ScenarioImportResult } from "./types";
import { slugForId } from "./ids";

export function importScenarioJson(input: string): ScenarioImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch (error) {
    return {
      ok: false,
      errors: [
        {
          path: "$",
          code: "invalid_json",
          message: error instanceof Error ? error.message : "Scenario JSON could not be parsed.",
        },
      ],
    };
  }

  const migrated = migrateScenarioDocument(parsed);
  if (!migrated.ok) {
    return migrated;
  }

  return { ok: true, document: rebuildScenarioDocument(migrated.document) };
}

export function exportScenarioJson(document: Parameters<typeof serializeScenarioDocument>[0]): string {
  return serializeScenarioDocument(rebuildScenarioDocument(document));
}

export function scenarioExportFilename(document: Parameters<typeof serializeScenarioDocument>[0]): string {
  return `${slugForId(document.scenario.title)}-schema-v${document.schemaVersion}.json`;
}

export function validationIssuesToText(errors: readonly ValidationIssue[]): string {
  return errors.map((error) => `${error.path}: ${error.message}`).join("\n");
}
