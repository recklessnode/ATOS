import type { ScenarioSelection } from "./selection";

export function describeSelection(selection: ScenarioSelection, label: string): string {
  return `${humanizeKind(selection.kind)} ${label}, stable ID ${selection.id}`;
}

export function humanizeKind(kind: ScenarioSelection["kind"]): string {
  return kind
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (letter) => letter.toUpperCase());
}

export function diagnosticLabel(label: string, severity: string, detail: string): string {
  return `${severity} diagnostic: ${label}. ${detail}`;
}
