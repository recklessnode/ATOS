import { SCENARIO_SCHEMA_VERSION, type ValidationIssue } from "@atos/scenario";
import { importScenarioJson } from "./import-export";
import type { EditorAutosaveRecord, EditorSelection } from "./types";

export type AutosaveParseResult =
  | { ok: true; record: EditorAutosaveRecord }
  | { ok: false; errors: ValidationIssue[] };

export function createAutosaveRecord(input: {
  draft: EditorAutosaveRecord["draft"];
  selection: EditorSelection;
  powerPresetId: EditorAutosaveRecord["powerPresetId"];
  savedAt: string;
}): EditorAutosaveRecord {
  return {
    kind: "atos-editor-autosave",
    version: 1,
    schemaVersion: input.draft.schemaVersion,
    savedAt: input.savedAt,
    draft: input.draft,
    selection: input.selection,
    powerPresetId: input.powerPresetId,
  };
}

export function serializeAutosaveRecord(record: EditorAutosaveRecord): string {
  return `${JSON.stringify(record, null, 2)}\n`;
}

export function parseAutosaveRecord(input: string): AutosaveParseResult {
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
          message: error instanceof Error ? error.message : "Autosave JSON could not be parsed.",
        },
      ],
    };
  }

  if (!isAutosaveRecordShape(parsed)) {
    return {
      ok: false,
      errors: [{ path: "$", code: "invalid_autosave", message: "Autosave record is not an ATOS editor autosave." }],
    };
  }
  if (parsed.version !== 1) {
    return {
      ok: false,
      errors: [{ path: "$.version", code: "unsupported_autosave_version", message: `Autosave version ${parsed.version} is not supported.` }],
    };
  }
  if (parsed.schemaVersion !== SCENARIO_SCHEMA_VERSION) {
    return {
      ok: false,
      errors: [
        {
          path: "$.schemaVersion",
          code: "unsupported_schema_version",
          message: `Autosave schema version ${parsed.schemaVersion} is not supported.`,
        },
      ],
    };
  }

  const imported = importScenarioJson(JSON.stringify(parsed.draft));
  if (!imported.ok) {
    return { ok: false, errors: imported.errors };
  }

  return {
    ok: true,
    record: {
      ...parsed,
      draft: imported.document,
    },
  };
}

function isAutosaveRecordShape(value: unknown): value is EditorAutosaveRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (value as { kind?: unknown }).kind === "atos-editor-autosave" &&
    typeof (value as { version?: unknown }).version === "number" &&
    typeof (value as { schemaVersion?: unknown }).schemaVersion === "number" &&
    typeof (value as { savedAt?: unknown }).savedAt === "string" &&
    typeof (value as { draft?: unknown }).draft === "object" &&
    typeof (value as { powerPresetId?: unknown }).powerPresetId === "string"
  );
}
