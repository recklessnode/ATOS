export type Workspace = {
  id: "layout" | "power" | "capacity" | "dispatch" | "simulation" | "operations";
  name: "Layout" | "Power" | "Capacity" | "Dispatch" | "Simulation" | "Operations";
  summary: string;
  status: string;
};

export const WORKSPACES = [
  {
    id: "layout",
    name: "Layout",
    summary: "Interactive hex tile cityscape editing, validation, power preview, and scenario export.",
    status: "Implemented",
  },
  {
    id: "power",
    name: "Power",
    summary: "DC nodal analysis, consumer tiers, shedding, and layout recommendations.",
    status: "Implemented",
  },
  {
    id: "capacity",
    name: "Capacity",
    summary: "Station, guideway, charging, and maintenance constraints.",
    status: "Placeholder",
  },
  {
    id: "dispatch",
    name: "Dispatch",
    summary: "Universal chit queue, worker matching, reservations, mission plans, and deficiency gates.",
    status: "Implemented",
  },
  {
    id: "simulation",
    name: "Simulation",
    summary: "Deterministic event clock, mission execution, occupancy, faults, energy, and replay.",
    status: "Implemented",
  },
  {
    id: "operations",
    name: "Operations",
    summary: "Closed-loop replanning orchestration, plan diffs, incidents, metrics, and operator review.",
    status: "Implemented",
  },
] as const satisfies readonly Workspace[];
