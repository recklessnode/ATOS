import type { AxialCoordinate, EdgeIndex, ElectricalExtractionResult, GuidewayExtractionResult } from "@atos/layout";
import type {
  PowerAnalysisResult,
  PowerPresetId,
  PowerRecommendation,
} from "@atos/power";
import type { ScenarioDocumentV1, ValidationIssue } from "@atos/scenario";

export const DEFAULT_EDITOR_HISTORY_LIMIT = 80;

export type EditorTargetKind =
  | "tile"
  | "setPiece"
  | "coordinate"
  | "guidewayNode"
  | "guidewayLink"
  | "electricalNode"
  | "electricalBranch"
  | "electricalSource"
  | "electricalLoad"
  | "station"
  | "serviceZone"
  | "recommendation"
  | "scenario";

export type EditorTarget = {
  kind: EditorTargetKind;
  id: string;
  coordinate?: AxialCoordinate;
};

export type EditorSelection = EditorTarget | null;

export type EditorDiagnosticCategory =
  | "placement"
  | "guideway"
  | "electrical"
  | "stationService"
  | "power"
  | "recommendation"
  | "schema";

export type EditorDiagnostic = {
  id: string;
  severity: "info" | "warning" | "error";
  category: EditorDiagnosticCategory;
  code: string;
  message: string;
  remediation: string;
  blocking: boolean;
  target?: EditorTarget;
  affectedIds: string[];
};

export type EditorValidationState = "valid" | "warning" | "invalid";

export type EditorDerivedState = {
  guideway: GuidewayExtractionResult;
  electrical: ElectricalExtractionResult;
  powerAnalysis: PowerAnalysisResult;
  diagnostics: EditorDiagnostic[];
  validationState: EditorValidationState;
};

export type EditorSnapshot = {
  draft: ScenarioDocumentV1;
  selection: EditorSelection;
  powerPresetId: PowerPresetId;
};

export type EditorHistory = {
  undoStack: EditorSnapshot[];
  redoStack: EditorSnapshot[];
  limit: number;
};

export type EditorPreview = {
  id: string;
  recommendationId?: string;
  label: string;
  document: ScenarioDocumentV1;
  powerAnalysis: PowerAnalysisResult;
  comparison: ScenarioComparison;
  diagnostics: EditorDiagnostic[];
  executable: boolean;
  reason?: string;
};

export type ScenarioComparisonMetric = {
  id: string;
  label: string;
  before: number | string | undefined;
  after: number | string | undefined;
  delta?: number;
  unit?: string;
};

export type ScenarioComparison = {
  metrics: ScenarioComparisonMetric[];
  changedTiles: string[];
  changedSetPieces: string[];
  changedSources: string[];
  changedBranches: string[];
  changedLoads: string[];
};

export type EditorState = {
  canonical: ScenarioDocumentV1;
  draft: ScenarioDocumentV1;
  preview?: EditorPreview;
  lastExported?: ScenarioDocumentV1;
  selection: EditorSelection;
  activePlacement?: PlacementDraft;
  powerPresetId: PowerPresetId;
  derived: EditorDerivedState;
  history: EditorHistory;
  dirty: boolean;
};

export type PlacementDraft =
  | {
      kind: "tile";
      type: string;
      version: number;
      orientation: EdgeIndex;
    }
  | {
      kind: "setPiece";
      type: string;
      version: number;
      tileId?: string;
    };

export type EditorCommand =
  | { type: "tile.add"; tileType: string; version?: number; coordinate: AxialCoordinate; orientation?: number; id?: string; commitWarnings?: boolean }
  | { type: "tile.move"; tileId: string; coordinate: AxialCoordinate; commitWarnings?: boolean }
  | { type: "tile.rotate"; tileId: string; steps: number; commitWarnings?: boolean }
  | { type: "tile.duplicate"; tileId: string; coordinate?: AxialCoordinate; id?: string; commitWarnings?: boolean }
  | { type: "tile.remove"; tileId: string; commitWarnings?: boolean }
  | { type: "setPiece.add"; setPieceType: string; version?: number; tileId: string; localGuidewayNodeId?: string; localElectricalNodeId?: string; id?: string; commitWarnings?: boolean }
  | { type: "setPiece.move"; setPieceId: string; tileId: string; localGuidewayNodeId?: string; localElectricalNodeId?: string; commitWarnings?: boolean }
  | { type: "setPiece.reassignHost"; setPieceId: string; tileId: string; localGuidewayNodeId?: string; localElectricalNodeId?: string; commitWarnings?: boolean }
  | { type: "setPiece.rotate"; setPieceId: string; steps: number }
  | { type: "setPiece.duplicate"; setPieceId: string; tileId?: string; id?: string; commitWarnings?: boolean }
  | { type: "setPiece.remove"; setPieceId: string; commitWarnings?: boolean }
  | { type: "scenario.updateMetadata"; title?: string; description?: string; randomSeed?: string; commitWarnings?: boolean }
  | { type: "power.setPreset"; presetId: PowerPresetId }
  | { type: "powerRecommendation.preview"; recommendationId: string }
  | { type: "powerRecommendation.acceptPreview" }
  | { type: "powerRecommendation.rejectPreview" }
  | { type: "import.replaceDraft"; document: ScenarioDocumentV1; commitWarnings?: boolean }
  | { type: "draft.resetToCanonical" }
  | { type: "history.undo" }
  | { type: "history.redo" };

export type EditorEvent = {
  id: string;
  message: string;
  target?: EditorTarget;
};

export type EditorCommandFailure = {
  id: string;
  code: string;
  message: string;
  diagnostics: EditorDiagnostic[];
  target?: EditorTarget;
};

export type EditorCommandResult =
  | { ok: true; state: EditorState; event: EditorEvent }
  | { ok: false; failure: EditorCommandFailure };

export type EditorCatalogTile = {
  type: string;
  version: number;
  label: string;
  tags: string[];
  guidewayConnectors: string;
  electricalConnectors: string;
  builtInPower: string;
  allowedSetPieces: string[];
  constraints: string[];
};

export type EditorCatalogSetPiece = {
  type: string;
  version: number;
  label: string;
  category: string;
  tags: string[];
  electricalContribution: string;
  serviceContribution: string;
  dispatchContribution: string;
  constraints: string[];
};

export type RecommendationExecution =
  | { executable: true; command: EditorCommand; rationale: string }
  | { executable: false; reason: string };

export type ScenarioImportResult =
  | { ok: true; document: ScenarioDocumentV1 }
  | { ok: false; errors: ValidationIssue[] };

export type EditorAutosaveRecord = {
  kind: "atos-editor-autosave";
  version: 1;
  schemaVersion: number;
  savedAt: string;
  draft: ScenarioDocumentV1;
  selection: EditorSelection;
  powerPresetId: PowerPresetId;
};

export type RecommendationPreviewInput = {
  recommendation: PowerRecommendation;
  state: EditorState;
};
