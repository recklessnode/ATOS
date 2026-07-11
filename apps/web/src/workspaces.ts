export type Workspace = {
  id: "layout" | "power" | "capacity" | "dispatch";
  name: "Layout" | "Power" | "Capacity" | "Dispatch";
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
] as const satisfies readonly Workspace[];
