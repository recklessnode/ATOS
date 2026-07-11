import type { PowerNetworkInput } from "./types";

export function oneSourceOneResistorLoadFixture(): PowerNetworkInput {
  return {
    nodes: [{ id: "source" }, { id: "load" }],
    branches: [
      {
        id: "feed",
        fromNodeId: "source",
        toNodeId: "load",
        resistanceOhms: 1,
        currentLimitAmps: 5,
        enabled: true,
      },
    ],
    sources: [{ id: "supply", nodeId: "source", nominalVoltage: 24, maximumWatts: 200 }],
    loads: [
      {
        id: "resistor",
        nodeId: "load",
        requestedWatts: 115.2,
        minimumVoltage: 18,
        loadClass: "building",
        sheddingPriority: 40,
        model: "constant_resistance",
        resistanceOhms: 4,
      },
    ],
  };
}

export function seriesSegmentsFixture(): PowerNetworkInput {
  return {
    nodes: [{ id: "source" }, { id: "mid" }, { id: "load" }],
    branches: [
      { id: "feed-a", fromNodeId: "source", toNodeId: "mid", resistanceOhms: 0.5, currentLimitAmps: 5, enabled: true },
      { id: "feed-b", fromNodeId: "mid", toNodeId: "load", resistanceOhms: 0.5, currentLimitAmps: 5, enabled: true },
    ],
    sources: [{ id: "supply", nodeId: "source", nominalVoltage: 24, maximumWatts: 200 }],
    loads: [
      {
        id: "resistor",
        nodeId: "load",
        requestedWatts: 115.2,
        minimumVoltage: 18,
        loadClass: "building",
        sheddingPriority: 40,
        model: "constant_resistance",
        resistanceOhms: 4,
      },
    ],
  };
}

export function parallelLoadsFixture(): PowerNetworkInput {
  return {
    nodes: [{ id: "source" }, { id: "load-a" }, { id: "load-b" }],
    branches: [
      { id: "feed-a", fromNodeId: "source", toNodeId: "load-a", resistanceOhms: 0.25, currentLimitAmps: 5, enabled: true },
      { id: "feed-b", fromNodeId: "source", toNodeId: "load-b", resistanceOhms: 0.5, currentLimitAmps: 5, enabled: true },
    ],
    sources: [{ id: "supply", nodeId: "source", nominalVoltage: 24, maximumWatts: 200 }],
    loads: [
      { id: "load-a", nodeId: "load-a", requestedWatts: 24, minimumVoltage: 18, loadClass: "passenger", sheddingPriority: 20 },
      { id: "load-b", nodeId: "load-b", requestedWatts: 12, minimumVoltage: 18, loadClass: "cargo", sheddingPriority: 30 },
    ],
  };
}

export function islandedLoadFixture(): PowerNetworkInput {
  return {
    nodes: [{ id: "source" }, { id: "island" }],
    branches: [],
    sources: [{ id: "supply", nodeId: "source", nominalVoltage: 24, maximumWatts: 100 }],
    loads: [{ id: "island-load", nodeId: "island", requestedWatts: 10, minimumVoltage: 20, loadClass: "control", sheddingPriority: 1 }],
  };
}

export function overloadedBranchFixture(): PowerNetworkInput {
  return {
    nodes: [{ id: "source" }, { id: "load" }],
    branches: [{ id: "weak-feed", fromNodeId: "source", toNodeId: "load", resistanceOhms: 0.05, currentLimitAmps: 1, enabled: true }],
    sources: [{ id: "supply", nodeId: "source", nominalVoltage: 24, maximumWatts: 200 }],
    loads: [{ id: "large-load", nodeId: "load", requestedWatts: 80, minimumVoltage: 20, loadClass: "building", sheddingPriority: 40 }],
  };
}

export function sourceLimitedFixture(): PowerNetworkInput {
  return {
    nodes: [{ id: "source" }],
    branches: [],
    sources: [{ id: "supply", nodeId: "source", nominalVoltage: 24, maximumWatts: 30 }],
    loads: [
      { id: "critical", nodeId: "source", requestedWatts: 20, minimumVoltage: 20, loadClass: "control", sheddingPriority: 1 },
      { id: "decorative", nodeId: "source", requestedWatts: 40, minimumVoltage: 20, loadClass: "effects", sheddingPriority: 80 },
    ],
  };
}

export function constantPowerBrownoutFixture(): PowerNetworkInput {
  return {
    nodes: [{ id: "source" }, { id: "load" }],
    branches: [{ id: "long-feed", fromNodeId: "source", toNodeId: "load", resistanceOhms: 4, currentLimitAmps: 5, enabled: true }],
    sources: [{ id: "supply", nodeId: "source", nominalVoltage: 24, maximumWatts: 200 }],
    loads: [{ id: "unstable-load", nodeId: "load", requestedWatts: 80, minimumVoltage: 20, loadClass: "building", sheddingPriority: 40 }],
  };
}

export function loadSheddingFixture(): PowerNetworkInput {
  return {
    nodes: [{ id: "source" }],
    branches: [],
    sources: [{ id: "supply", nodeId: "source", nominalVoltage: 24, maximumWatts: 50 }],
    loads: [
      { id: "safety", nodeId: "source", requestedWatts: 18, minimumVoltage: 20, loadClass: "safety", sheddingPriority: 0 },
      { id: "control", nodeId: "source", requestedWatts: 18, minimumVoltage: 20, loadClass: "control", sheddingPriority: 1 },
      { id: "lighting", nodeId: "source", requestedWatts: 24, minimumVoltage: 20, loadClass: "lighting", sheddingPriority: 50 },
      { id: "decorative", nodeId: "source", requestedWatts: 24, minimumVoltage: 20, loadClass: "effects", sheddingPriority: 80 },
    ],
  };
}
