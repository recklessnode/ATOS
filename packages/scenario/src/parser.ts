import { detectDuplicateTileOccupancy } from "@atos/layout";
import { SCENARIO_SCHEMA_VERSION, type ScenarioDocumentV1 } from "./v1";

export type ValidationIssue = {
  path: string;
  code: string;
  message: string;
};

export type ScenarioParseResult =
  | { ok: true; document: ScenarioDocumentV1 }
  | { ok: false; errors: ValidationIssue[] };

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function valueAt(record: JsonRecord, key: string): unknown {
  return record[key];
}

function requireRecord(value: unknown, path: string, errors: ValidationIssue[]): JsonRecord | undefined {
  if (!isRecord(value)) {
    errors.push({ path, code: "expected_object", message: `${path} must be an object.` });
    return undefined;
  }
  return value;
}

function requireArray(value: unknown, path: string, errors: ValidationIssue[]): unknown[] | undefined {
  if (!Array.isArray(value)) {
    errors.push({ path, code: "expected_array", message: `${path} must be an array.` });
    return undefined;
  }
  return value;
}

function requireString(record: JsonRecord, key: string, path: string, errors: ValidationIssue[]): void {
  if (typeof valueAt(record, key) !== "string") {
    errors.push({
      path: `${path}.${key}`,
      code: "expected_string",
      message: `${path}.${key} must be a string.`,
    });
  }
}

function requireNumber(record: JsonRecord, key: string, path: string, errors: ValidationIssue[]): void {
  if (typeof valueAt(record, key) !== "number" || Number.isNaN(valueAt(record, key))) {
    errors.push({
      path: `${path}.${key}`,
      code: "expected_number",
      message: `${path}.${key} must be a number.`,
    });
  }
}

function requireBoolean(record: JsonRecord, key: string, path: string, errors: ValidationIssue[]): void {
  if (typeof valueAt(record, key) !== "boolean") {
    errors.push({
      path: `${path}.${key}`,
      code: "expected_boolean",
      message: `${path}.${key} must be a boolean.`,
    });
  }
}

function validateUniqueIds(records: unknown[], path: string, errors: ValidationIssue[]): void {
  const seen = new Map<string, number>();
  records.forEach((item, index) => {
    if (!isRecord(item) || typeof item.id !== "string") {
      errors.push({
        path: `${path}[${index}].id`,
        code: "missing_id",
        message: `${path}[${index}].id must be a stable string identifier.`,
      });
      return;
    }
    const previousIndex = seen.get(item.id);
    if (previousIndex !== undefined) {
      errors.push({
        path: `${path}[${index}].id`,
        code: "duplicate_id",
        message: `${path}[${index}].id duplicates ${path}[${previousIndex}].id.`,
      });
    }
    seen.set(item.id, index);
  });
}

function validatePlacedTiles(tiles: unknown[], path: string, errors: ValidationIssue[]): void {
  validateUniqueIds(tiles, path, errors);
  for (const [index, item] of tiles.entries()) {
    const tile = requireRecord(item, `${path}[${index}]`, errors);
    if (!tile) {
      continue;
    }
    requireString(tile, "type", `${path}[${index}]`, errors);
    requireNumber(tile, "version", `${path}[${index}]`, errors);
    requireNumber(tile, "orientation", `${path}[${index}]`, errors);
    const coordinate = requireRecord(tile.coordinate, `${path}[${index}].coordinate`, errors);
    if (coordinate) {
      requireNumber(coordinate, "q", `${path}[${index}].coordinate`, errors);
      requireNumber(coordinate, "r", `${path}[${index}].coordinate`, errors);
      if (!Number.isInteger(coordinate.q)) {
        errors.push({
          path: `${path}[${index}].coordinate.q`,
          code: "expected_integer",
          message: `${path}[${index}].coordinate.q must be an integer.`,
        });
      }
      if (!Number.isInteger(coordinate.r)) {
        errors.push({
          path: `${path}[${index}].coordinate.r`,
          code: "expected_integer",
          message: `${path}[${index}].coordinate.r must be an integer.`,
        });
      }
    }
  }

  const validTiles = tiles.filter(isRecord).filter((tile) => {
    const coordinate = tile.coordinate;
    return (
      typeof tile.id === "string" &&
      isRecord(coordinate) &&
      Number.isInteger(coordinate.q) &&
      Number.isInteger(coordinate.r)
    );
  });

  for (const duplicate of detectDuplicateTileOccupancy(
    validTiles.map((tile) => ({
      id: tile.id as string,
      coordinate: (tile.coordinate as { q: number; r: number }),
    })),
  )) {
    errors.push({
      path: "layout.tiles",
      code: "duplicate_tile_occupancy",
      message: `Tile coordinate ${duplicate.key} is occupied by ${duplicate.tileIds.join(", ")}.`,
    });
  }
}

function validateGraph(records: unknown[], path: string, errors: ValidationIssue[]): void {
  validateUniqueIds(records, path, errors);
}

export function validateScenarioDocumentV1(input: unknown): ValidationIssue[] {
  const errors: ValidationIssue[] = [];
  const root = requireRecord(input, "$", errors);
  if (!root) {
    return errors;
  }

  if (root.schemaVersion !== SCENARIO_SCHEMA_VERSION) {
    errors.push({
      path: "$.schemaVersion",
      code: "unsupported_schema_version",
      message: `Only scenario schema version ${SCENARIO_SCHEMA_VERSION} is supported.`,
    });
    return errors;
  }

  const scenario = requireRecord(root.scenario, "$.scenario", errors);
  if (scenario) {
    requireString(scenario, "id", "$.scenario", errors);
    requireString(scenario, "title", "$.scenario", errors);
    requireString(scenario, "description", "$.scenario", errors);
    requireString(scenario, "createdAt", "$.scenario", errors);
    requireString(scenario, "updatedAt", "$.scenario", errors);
  }
  requireString(root, "randomSeed", "$", errors);

  const layout = requireRecord(root.layout, "$.layout", errors);
  if (layout) {
    const hex = requireRecord(layout.hex, "$.layout.hex", errors);
    if (hex) {
      requireString(hex, "orientation", "$.layout.hex", errors);
      requireNumber(hex, "radiusMm", "$.layout.hex", errors);
      requireNumber(hex, "edgeLengthMm", "$.layout.hex", errors);
    }
    const tiles = requireArray(layout.tiles, "$.layout.tiles", errors);
    if (tiles) {
      validatePlacedTiles(tiles, "$.layout.tiles", errors);
    }
    const setPieces = requireArray(layout.setPieces, "$.layout.setPieces", errors);
    if (setPieces) {
      validateUniqueIds(setPieces, "$.layout.setPieces", errors);
    }
  }

  const guideway = requireRecord(root.guideway, "$.guideway", errors);
  if (guideway) {
    for (const key of [
      "nodes",
      "links",
      "openEnds",
      "incompatibleConnections",
      "disconnectedComponents",
      "serviceAttachments",
    ]) {
      const records = requireArray(guideway[key], `$.guideway.${key}`, errors);
      if (records && (key === "nodes" || key === "links" || key === "disconnectedComponents")) {
        validateGraph(records, `$.guideway.${key}`, errors);
      }
    }
  }

  const electrical = requireRecord(root.electrical, "$.electrical", errors);
  if (electrical) {
    for (const key of ["nodes", "branches", "sources", "loads", "openConnectors", "incompatibleConnections"]) {
      const records = requireArray(electrical[key], `$.electrical.${key}`, errors);
      if (records && (key === "nodes" || key === "branches" || key === "sources" || key === "loads")) {
        validateGraph(records, `$.electrical.${key}`, errors);
      }
    }
  }

  for (const [path, key] of [
    ["$.stations", "stations"],
    ["$.serviceZones", "serviceZones"],
    ["$.contracts", "contracts"],
    ["$.chits", "chits"],
  ] as const) {
    const records = requireArray(root[key], path, errors);
    if (records) {
      validateUniqueIds(records, path, errors);
    }
  }

  const inventory = requireRecord(root.inventory, "$.inventory", errors);
  if (inventory) {
    const vehicles = requireArray(inventory.vehicles, "$.inventory.vehicles", errors);
    if (vehicles) {
      validateUniqueIds(vehicles, "$.inventory.vehicles", errors);
    }
  }

  const simulation = requireRecord(root.simulation, "$.simulation", errors);
  if (simulation) {
    requireString(simulation, "currentTime", "$.simulation", errors);
    requireNumber(simulation, "tickSeconds", "$.simulation", errors);
    requireNumber(simulation, "speedMultiplier", "$.simulation", errors);
    requireBoolean(simulation, "paused", "$.simulation", errors);
  }

  return errors;
}

export function parseScenarioDocument(input: unknown): ScenarioParseResult {
  const errors = validateScenarioDocumentV1(input);
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, document: input as ScenarioDocumentV1 };
}
