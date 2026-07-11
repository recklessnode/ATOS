import type { PowerNetworkInput, PowerNetworkLoadInput, PowerPresetId } from "./types";

export type PowerPresetDefinition = {
  id: PowerPresetId;
  label: string;
  description: string;
};

export const POWER_PRESETS: readonly PowerPresetDefinition[] = [
  {
    id: "idle",
    label: "Idle",
    description: "Control systems and low standby loads only.",
  },
  {
    id: "normal_operations",
    label: "Normal operations",
    description: "Use the canonical six-tile fixture load levels.",
  },
  {
    id: "simultaneous_station_load",
    label: "Simultaneous station load",
    description: "Passenger, cargo, charging, and station systems operate together.",
  },
  {
    id: "propulsion_surge",
    label: "Propulsion surge",
    description: "Adds a short mobility-critical feeder surge near the station throat.",
  },
  {
    id: "brownout_stress",
    label: "Brownout stress",
    description: "Stress case for source limiting, branch pressure, tier shedding, and recommendations.",
  },
];

export function applyPowerPreset(input: PowerNetworkInput, presetId: PowerPresetId): PowerNetworkInput {
  const clone = cloneNetwork(input);
  switch (presetId) {
    case "idle":
      return {
        ...clone,
        loads: clone.loads.map((load) => ({
          ...load,
          requestedWatts: load.loadClass === "control" ? load.requestedWatts : round(load.requestedWatts * 0.25),
        })),
      };
    case "normal_operations":
      return clone;
    case "simultaneous_station_load":
      return {
        ...clone,
        loads: clone.loads.map((load) => ({
          ...load,
          requestedWatts: round(load.requestedWatts * (load.loadClass === "effects" ? 1.5 : 1.8)),
        })),
      };
    case "propulsion_surge":
      return {
        ...clone,
        loads: [
          ...clone.loads,
          surgeLoad("preset:propulsion-surge:station-throat", "tile-station:bus-a", 42),
        ],
      };
    case "brownout_stress":
      return {
        ...clone,
        loads: [
          ...clone.loads.map((load) => ({
            ...load,
            requestedWatts: round(load.requestedWatts * (load.loadClass === "control" ? 1.2 : 2.8)),
          })),
          surgeLoad("preset:propulsion-surge:station-throat", "tile-station:bus-a", 70),
          surgeLoad("preset:propulsion-surge:platform", "tile-platform:bus-a", 38),
        ],
      };
  }
}

function cloneNetwork(input: PowerNetworkInput): PowerNetworkInput {
  return {
    nodes: input.nodes.map((node) => ({ ...node })),
    branches: input.branches.map((branch) => ({ ...branch })),
    sources: input.sources.map((source) => ({ ...source })),
    loads: input.loads.map((load) => ({ ...load })),
  };
}

function surgeLoad(id: string, nodeId: string, requestedWatts: number): PowerNetworkLoadInput {
  return {
    id,
    nodeId,
    requestedWatts,
    minimumVoltage: 21,
    loadClass: "propulsion",
    sheddingPriority: 2,
    model: "constant_power",
    consumerTier: 2,
  };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
