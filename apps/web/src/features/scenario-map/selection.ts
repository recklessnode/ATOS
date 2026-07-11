export type SelectionKind =
  | "tile"
  | "setPiece"
  | "guidewayNode"
  | "guidewayLink"
  | "station"
  | "serviceZone"
  | "electricalNode"
  | "electricalBranch"
  | "electricalSource"
  | "electricalLoad"
  | "guidewayComponent"
  | "diagnostic";

export type ScenarioSelection = {
  kind: SelectionKind;
  id: string;
};

export type SelectionRelationMap = ReadonlyMap<string, readonly ScenarioSelection[]>;

export function selectionKey(selection: ScenarioSelection): string {
  return `${selection.kind}:${selection.id}`;
}

export function sameSelection(left: ScenarioSelection | null, right: ScenarioSelection | null): boolean {
  if (!left || !right) {
    return left === right;
  }
  return left.kind === right.kind && left.id === right.id;
}

export function isSelected(selection: ScenarioSelection | null, candidate: ScenarioSelection): boolean {
  return sameSelection(selection, candidate);
}

export function relatedSelectionKeys(
  selection: ScenarioSelection | null,
  relationMap: SelectionRelationMap,
): Set<string> {
  if (!selection) {
    return new Set();
  }

  return new Set((relationMap.get(selectionKey(selection)) ?? []).map(selectionKey));
}

export function hasRelatedSelection(
  selection: ScenarioSelection | null,
  candidate: ScenarioSelection,
  relationMap: SelectionRelationMap,
): boolean {
  return relatedSelectionKeys(selection, relationMap).has(selectionKey(candidate));
}

export function parseSelectionKey(key: string): ScenarioSelection | null {
  const [kind, ...idParts] = key.split(":");
  const id = idParts.join(":");
  if (!isSelectionKind(kind) || id.length === 0) {
    return null;
  }
  return { kind, id };
}

function isSelectionKind(value: string): value is SelectionKind {
  return [
    "tile",
    "setPiece",
    "guidewayNode",
    "guidewayLink",
    "station",
    "serviceZone",
    "electricalNode",
    "electricalBranch",
    "electricalSource",
    "electricalLoad",
    "guidewayComponent",
    "diagnostic",
  ].includes(value);
}
