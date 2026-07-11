import type {
  Bounds,
  Point,
  SetPieceDefinition,
  SetPieceInstance,
  TileDefinition,
} from "@atos/layout";
import {
  axialToPixel,
  boundsFromPoints,
  createDefaultDefinitionRegistry,
  detectDuplicateTileOccupancy,
  edgeAnchorPoint,
  extractElectricalGraph,
  extractGuidewayGraph,
  mapBoundsForTiles,
  mapLocalEdge,
  pointyTopHexPoints,
  polygonPoints,
  tileEdgeAnchorPoint,
} from "@atos/layout";
import { loadSixTileCityFixture, type ScenarioDocumentV1 } from "@atos/scenario";
import type { ServiceZone, StableId, Station } from "@atos/domain";
import type { ScenarioSelection, SelectionRelationMap } from "./selection";
import { selectionKey } from "./selection";

export type ScenarioMapLayerId =
  | "tiles"
  | "tileLabels"
  | "guideway"
  | "stations"
  | "electrical"
  | "diagnostics";

export type ScenarioMapLayers = Record<ScenarioMapLayerId, boolean>;

export const DEFAULT_SCENARIO_MAP_LAYERS: ScenarioMapLayers = {
  tiles: true,
  tileLabels: true,
  guideway: true,
  stations: true,
  electrical: false,
  diagnostics: true,
};

export type RenderTile = {
  selection: ScenarioSelection;
  id: StableId;
  label: string;
  type: StableId;
  coordinateLabel: string;
  orientationLabel: string;
  center: Point;
  points: Point[];
  polygon: string;
  orientationEnd: Point;
  bounds: Bounds;
};

export type RenderLine = {
  selection: ScenarioSelection;
  id: StableId;
  label: string;
  from: Point;
  to: Point;
  kind: string;
  bounds: Bounds;
};

export type RenderPoint = {
  selection: ScenarioSelection;
  id: StableId;
  label: string;
  point: Point;
  kind: string;
  bounds: Bounds;
};

export type DiagnosticSeverity = "ok" | "info" | "warning" | "error";

export type DiagnosticCategory =
  | "duplicateTileOccupancy"
  | "missingDefinition"
  | "openGuidewayEnd"
  | "incompatibleGuidewayConnection"
  | "disconnectedGuidewayComponent"
  | "openElectricalConnector"
  | "incompatibleElectricalConnection"
  | "extractionError";

export type MapDiagnostic = {
  selection: ScenarioSelection;
  category: DiagnosticCategory;
  severity: DiagnosticSeverity;
  label: string;
  message: string;
  action: string;
  target?: ScenarioSelection;
  bounds?: Bounds;
};

export type DiagnosticSummary = Record<DiagnosticCategory, number>;

export type DetailRecord = {
  selection: ScenarioSelection;
  label: string;
  kindLabel: string;
  properties: { label: string; value: string }[];
  related: ScenarioSelection[];
  raw: unknown;
};

export type FocusTargets = {
  all: Bounds;
  station?: ScenarioSelection;
  electricalSource?: ScenarioSelection;
  firstDiagnostic?: ScenarioSelection;
};

export type ScenarioMapRenderModel = {
  document: ScenarioDocumentV1;
  radius: number;
  bounds: Bounds;
  layers: ScenarioMapLayers;
  tiles: RenderTile[];
  guidewayNodes: RenderPoint[];
  guidewayLinks: RenderLine[];
  electricalNodes: RenderPoint[];
  electricalBranches: RenderLine[];
  electricalSources: RenderPoint[];
  electricalLoads: RenderPoint[];
  stations: RenderPoint[];
  serviceZones: RenderPoint[];
  setPieces: RenderPoint[];
  diagnostics: MapDiagnostic[];
  diagnosticSummary: DiagnosticSummary;
  relationMap: SelectionRelationMap;
  detailByKey: ReadonlyMap<string, DetailRecord>;
  boundsByKey: ReadonlyMap<string, Bounds>;
  focusTargets: FocusTargets;
};

type MutableRelationMap = Map<string, ScenarioSelection[]>;

export function buildSixTileScenarioMapModel(): ScenarioMapRenderModel {
  return buildScenarioMapRenderModel(loadSixTileCityFixture());
}

export function buildScenarioMapRenderModel(document: ScenarioDocumentV1): ScenarioMapRenderModel {
  const registry = createDefaultDefinitionRegistry();
  const radius = 82;
  const guideway = extractGuidewayGraph({
    tiles: document.layout.tiles,
    registry,
    stations: document.stations,
    serviceZones: document.serviceZones,
  });
  const electrical = extractElectricalGraph({
    tiles: document.layout.tiles,
    setPieces: document.layout.setPieces,
    registry,
  });

  const tileById = new Map(document.layout.tiles.map((tile) => [tile.id, tile]));
  const setPieceById = new Map(document.layout.setPieces.map((setPiece) => [setPiece.id, setPiece]));
  const stationById = new Map(document.stations.map((station) => [station.id, station]));
  const serviceZoneById = new Map(document.serviceZones.map((serviceZone) => [serviceZone.id, serviceZone]));
  const tileDefinitions = new Map<string, TileDefinition>();
  const setPieceDefinitions = new Map<string, SetPieceDefinition>();
  for (const tile of document.layout.tiles) {
    const definition = registry.getTileDefinition(tile.type, tile.version);
    if (definition) {
      tileDefinitions.set(tile.id, definition);
    }
  }
  for (const setPiece of document.layout.setPieces) {
    const definition = registry.getSetPieceDefinition(setPiece.type, setPiece.version);
    if (definition) {
      setPieceDefinitions.set(setPiece.id, definition);
    }
  }

  const tileCenters = new Map<StableId, Point>(
    document.layout.tiles.map((tile) => [tile.id, axialToPixel(tile.coordinate, radius)]),
  );

  const tiles = document.layout.tiles
    .map((tile): RenderTile => {
      const center = requiredPoint(tileCenters.get(tile.id), tile.id);
      const points = pointyTopHexPoints(center, radius);
      const selection = { kind: "tile", id: tile.id } as const;
      return {
        selection,
        id: tile.id,
        label: tileDefinitions.get(tile.id)?.label ?? tile.type,
        type: tile.type,
        coordinateLabel: `q ${tile.coordinate.q}, r ${tile.coordinate.r}`,
        orientationLabel: `${tile.orientation} steps`,
        center,
        points,
        polygon: polygonPoints(points),
        orientationEnd: edgeAnchorPoint(center, mapLocalEdge(0, tile.orientation), radius, 0.58),
        bounds: boundsFromPoints(points, 10),
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));

  const guidewayNodePoints = new Map<StableId, Point>();
  for (const node of guideway.nodes) {
    const tile = tileById.get(node.tileId);
    const definition = tile ? tileDefinitions.get(tile.id) : undefined;
    if (tile && definition) {
      guidewayNodePoints.set(node.id, localGuidewayNodePoint(tile, definition, node.localNodeId, radius));
    }
  }

  const electricalNodePoints = new Map<StableId, Point>();
  for (const node of electrical.nodes) {
    const tile = tileById.get(node.tileId);
    const definition = tile ? tileDefinitions.get(tile.id) : undefined;
    if (tile && definition) {
      electricalNodePoints.set(node.id, localElectricalNodePoint(tile, definition, node.localNodeId, radius));
    }
  }

  const guidewayNodes = guideway.nodes.map((node) =>
    renderPoint(
      { kind: "guidewayNode", id: node.id },
      node.id,
      `Guideway node ${node.localNodeId}`,
      requiredPoint(guidewayNodePoints.get(node.id), node.id),
      "guideway node",
    ),
  );
  const guidewayLinks = guideway.links.map((link) =>
    renderLine(
      { kind: "guidewayLink", id: link.id },
      link.id,
      link.kind === "tile-connection" ? "Inter-tile guideway connection" : "Internal guideway curve",
      requiredPoint(guidewayNodePoints.get(link.fromNodeId), link.fromNodeId),
      requiredPoint(guidewayNodePoints.get(link.toNodeId), link.toNodeId),
      link.kind,
    ),
  );

  const electricalNodes = electrical.nodes.map((node) =>
    renderPoint(
      { kind: "electricalNode", id: node.id },
      node.id,
      `Electrical node ${node.localNodeId}`,
      requiredPoint(electricalNodePoints.get(node.id), node.id),
      "electrical node",
    ),
  );
  const electricalBranches = electrical.branches.map((branch) =>
    renderLine(
      { kind: "electricalBranch", id: branch.id },
      branch.id,
      branch.kind === "tile-connection" ? "Inter-tile electrical branch" : "Internal electrical branch",
      requiredPoint(electricalNodePoints.get(branch.fromNodeId), branch.fromNodeId),
      requiredPoint(electricalNodePoints.get(branch.toNodeId), branch.toNodeId),
      branch.enabled ? branch.kind : "disabled branch",
    ),
  );
  const electricalSources = electrical.sources.map((source) =>
    renderPoint(
      { kind: "electricalSource", id: source.id },
      source.id,
      `Power source ${source.maximumWatts} W`,
      offsetPoint(requiredPoint(electricalNodePoints.get(source.nodeId), source.nodeId), 0, -18),
      "source",
    ),
  );
  const electricalLoads = electrical.loads.map((load, index) =>
    renderPoint(
      { kind: "electricalLoad", id: load.id },
      load.id,
      `${load.loadClass} load ${load.requestedWatts} W`,
      offsetPoint(requiredPoint(electricalNodePoints.get(load.nodeId), load.nodeId), (index % 2) * 12 - 6, 18),
      "load",
    ),
  );

  const stations = document.stations.map((station) =>
    renderPoint(
      { kind: "station", id: station.id },
      station.id,
      station.label,
      stationPoint(station, guidewayNodePoints),
      "station",
      18,
    ),
  );
  const serviceZones = document.serviceZones.map((serviceZone, index) =>
    renderPoint(
      { kind: "serviceZone", id: serviceZone.id },
      serviceZone.id,
      serviceZone.label,
      offsetPoint(serviceZonePoint(serviceZone, guidewayNodePoints), (index - 1) * 16, 20),
      serviceZone.type,
      16,
    ),
  );
  const setPieces = document.layout.setPieces.map((setPiece, index) => {
    const definition = setPieceDefinitions.get(setPiece.id);
    const point =
      setPiece.localGuidewayNodeId && guidewayNodePoints.has(`${setPiece.tileId}:${setPiece.localGuidewayNodeId}`)
        ? requiredPoint(guidewayNodePoints.get(`${setPiece.tileId}:${setPiece.localGuidewayNodeId}`), setPiece.id)
        : requiredPoint(tileCenters.get(setPiece.tileId), setPiece.id);

    return renderPoint(
      { kind: "setPiece", id: setPiece.id },
      setPiece.id,
      definition?.visual.label ?? setPiece.type,
      offsetPoint(point, 0, -22 - index),
      definition?.visual.category ?? "set piece",
      12,
    );
  });

  const diagnostics = buildDiagnostics({
    document,
    registry,
    guideway,
    electrical,
    tileById,
    guidewayNodePoints,
    electricalNodePoints,
  });

  const relationMap = buildRelations({
    document,
    guideway,
    electrical,
    setPieceById,
    setPieceDefinitions,
    serviceZoneById,
    stationById,
  });
  const boundsByKey = new Map<string, Bounds>();
  for (const item of [
    ...tiles,
    ...guidewayNodes,
    ...guidewayLinks,
    ...electricalNodes,
    ...electricalBranches,
    ...electricalSources,
    ...electricalLoads,
    ...stations,
    ...serviceZones,
    ...setPieces,
  ]) {
    boundsByKey.set(selectionKey(item.selection), item.bounds);
  }
  for (const component of guideway.disconnectedComponents) {
    const points = component.nodeIds
      .map((nodeId) => guidewayNodePoints.get(nodeId))
      .filter((point): point is Point => Boolean(point));
    boundsByKey.set(selectionKey({ kind: "guidewayComponent", id: component.id }), boundsFromPoints(points, 32));
  }
  for (const diagnostic of diagnostics) {
    if (diagnostic.bounds) {
      boundsByKey.set(selectionKey(diagnostic.selection), diagnostic.bounds);
    }
  }

  const detailByKey = buildDetails({
    document,
    guideway,
    electrical,
    tiles,
    stations,
    serviceZones,
    setPieces,
    diagnostics,
    relationMap,
    tileDefinitions,
    setPieceDefinitions,
  });

  return {
    document,
    radius,
    bounds: mapBoundsForTiles(document.layout.tiles, radius, 72),
    layers: DEFAULT_SCENARIO_MAP_LAYERS,
    tiles,
    guidewayNodes,
    guidewayLinks,
    electricalNodes,
    electricalBranches,
    electricalSources,
    electricalLoads,
    stations,
    serviceZones,
    setPieces,
    diagnostics,
    diagnosticSummary: summarizeDiagnostics(diagnostics),
    relationMap,
    detailByKey,
    boundsByKey,
    focusTargets: {
      all: mapBoundsForTiles(document.layout.tiles, radius, 72),
      station: document.stations[0] ? { kind: "station", id: document.stations[0].id } : undefined,
      electricalSource: electrical.sources[0]
        ? { kind: "electricalSource", id: electrical.sources[0].id }
        : undefined,
      firstDiagnostic: diagnostics.find((diagnostic) => diagnostic.severity !== "ok")?.selection,
    },
  };
}

function localGuidewayNodePoint(
  tile: ScenarioDocumentV1["layout"]["tiles"][number],
  definition: TileDefinition,
  localNodeId: StableId,
  radius: number,
): Point {
  const ports = definition.guideway.edgePorts.filter((port) => port.nodeId === localNodeId);
  if (ports.length === 0) {
    return axialToPixel(tile.coordinate, radius);
  }
  return averagePoints(ports.map((port) => tileEdgeAnchorPoint(tile, port.edge, radius, 0.58)));
}

function localElectricalNodePoint(
  tile: ScenarioDocumentV1["layout"]["tiles"][number],
  definition: TileDefinition,
  localNodeId: StableId,
  radius: number,
): Point {
  const ports = definition.electrical.edgePorts.filter((port) => port.nodeId === localNodeId);
  if (ports.length === 0) {
    return axialToPixel(tile.coordinate, radius);
  }
  return averagePoints(ports.map((port) => tileEdgeAnchorPoint(tile, port.edge, radius, 0.38)));
}

function stationPoint(station: Station, guidewayNodePoints: ReadonlyMap<StableId, Point>): Point {
  return requiredPoint(
    guidewayNodePoints.get(`${station.guidewayAttachment.tileId}:${station.guidewayAttachment.localGuidewayNodeId}`),
    station.id,
  );
}

function serviceZonePoint(
  serviceZone: ServiceZone,
  guidewayNodePoints: ReadonlyMap<StableId, Point>,
): Point {
  return requiredPoint(
    guidewayNodePoints.get(
      `${serviceZone.guidewayAttachment.tileId}:${serviceZone.guidewayAttachment.localGuidewayNodeId}`,
    ),
    serviceZone.id,
  );
}

function renderPoint(
  selection: ScenarioSelection,
  id: StableId,
  label: string,
  point: Point,
  kind: string,
  hitRadius = 10,
): RenderPoint {
  return {
    selection,
    id,
    label,
    point,
    kind,
    bounds: boundsFromPoints([point], hitRadius),
  };
}

function renderLine(
  selection: ScenarioSelection,
  id: StableId,
  label: string,
  from: Point,
  to: Point,
  kind: string,
): RenderLine {
  return {
    selection,
    id,
    label,
    from,
    to,
    kind,
    bounds: boundsFromPoints([from, to], 18),
  };
}

function buildRelations(input: {
  document: ScenarioDocumentV1;
  guideway: ReturnType<typeof extractGuidewayGraph>;
  electrical: ReturnType<typeof extractElectricalGraph>;
  setPieceById: ReadonlyMap<StableId, SetPieceInstance>;
  setPieceDefinitions: ReadonlyMap<StableId, SetPieceDefinition>;
  serviceZoneById: ReadonlyMap<StableId, ServiceZone>;
  stationById: ReadonlyMap<StableId, Station>;
}): SelectionRelationMap {
  const relations: MutableRelationMap = new Map();

  for (const tile of input.document.layout.tiles) {
    const tileSelection = { kind: "tile", id: tile.id } as const;
    for (const node of input.guideway.nodes.filter((node) => node.tileId === tile.id)) {
      addBidirectionalRelation(relations, tileSelection, { kind: "guidewayNode", id: node.id });
    }
    for (const node of input.electrical.nodes.filter((node) => node.tileId === tile.id)) {
      addBidirectionalRelation(relations, tileSelection, { kind: "electricalNode", id: node.id });
    }
    for (const setPiece of input.document.layout.setPieces.filter((setPiece) => setPiece.tileId === tile.id)) {
      addBidirectionalRelation(relations, tileSelection, { kind: "setPiece", id: setPiece.id });
    }
  }

  for (const link of input.guideway.links) {
    const linkSelection = { kind: "guidewayLink", id: link.id } as const;
    addBidirectionalRelation(relations, linkSelection, { kind: "guidewayNode", id: link.fromNodeId });
    addBidirectionalRelation(relations, linkSelection, { kind: "guidewayNode", id: link.toNodeId });
  }

  for (const branch of input.electrical.branches) {
    const branchSelection = { kind: "electricalBranch", id: branch.id } as const;
    addBidirectionalRelation(relations, branchSelection, { kind: "electricalNode", id: branch.fromNodeId });
    addBidirectionalRelation(relations, branchSelection, { kind: "electricalNode", id: branch.toNodeId });
  }

  for (const source of input.electrical.sources) {
    addBidirectionalRelation(relations, { kind: "electricalSource", id: source.id }, { kind: "electricalNode", id: source.nodeId });
  }

  for (const load of input.electrical.loads) {
    const loadSelection = { kind: "electricalLoad", id: load.id } as const;
    addBidirectionalRelation(relations, loadSelection, { kind: "electricalNode", id: load.nodeId });
    const setPieceId = load.id.split(":")[0] ?? "";
    const setPiece = input.setPieceById.get(setPieceId);
    if (setPiece) {
      addBidirectionalRelation(relations, loadSelection, { kind: "setPiece", id: setPiece.id });
      addBidirectionalRelation(relations, loadSelection, { kind: "tile", id: setPiece.tileId });
    }
  }

  for (const station of input.document.stations) {
    const stationSelection = { kind: "station", id: station.id } as const;
    addBidirectionalRelation(relations, stationSelection, { kind: "tile", id: station.tileId });
    addBidirectionalRelation(relations, stationSelection, {
      kind: "guidewayNode",
      id: `${station.guidewayAttachment.tileId}:${station.guidewayAttachment.localGuidewayNodeId}`,
    });
    for (const serviceZoneId of station.serviceZoneIds) {
      addBidirectionalRelation(relations, stationSelection, { kind: "serviceZone", id: serviceZoneId });
    }
  }

  for (const serviceZone of input.document.serviceZones) {
    const serviceZoneSelection = { kind: "serviceZone", id: serviceZone.id } as const;
    addBidirectionalRelation(relations, serviceZoneSelection, { kind: "station", id: serviceZone.stationId });
    addBidirectionalRelation(relations, serviceZoneSelection, { kind: "tile", id: serviceZone.guidewayAttachment.tileId });
    addBidirectionalRelation(relations, serviceZoneSelection, {
      kind: "guidewayNode",
      id: `${serviceZone.guidewayAttachment.tileId}:${serviceZone.guidewayAttachment.localGuidewayNodeId}`,
    });
    const setPiece = findSetPieceForServiceZone(input.document.layout.setPieces, input.setPieceDefinitions, serviceZone);
    if (setPiece) {
      addBidirectionalRelation(relations, serviceZoneSelection, { kind: "setPiece", id: setPiece.id });
      for (const load of input.electrical.loads.filter((load) => load.id.startsWith(`${setPiece.id}:`))) {
        addBidirectionalRelation(relations, serviceZoneSelection, { kind: "electricalLoad", id: load.id });
      }
    }
  }

  for (const component of input.guideway.disconnectedComponents) {
    const componentSelection = { kind: "guidewayComponent", id: component.id } as const;
    for (const nodeId of component.nodeIds) {
      addRelation(relations, componentSelection, { kind: "guidewayNode", id: nodeId });
    }
    for (const link of input.guideway.links.filter(
      (link) => component.nodeIds.includes(link.fromNodeId) && component.nodeIds.includes(link.toNodeId),
    )) {
      addRelation(relations, componentSelection, { kind: "guidewayLink", id: link.id });
    }
  }

  return relations;
}

function buildDiagnostics(input: {
  document: ScenarioDocumentV1;
  registry: ReturnType<typeof createDefaultDefinitionRegistry>;
  guideway: ReturnType<typeof extractGuidewayGraph>;
  electrical: ReturnType<typeof extractElectricalGraph>;
  tileById: ReadonlyMap<StableId, ScenarioDocumentV1["layout"]["tiles"][number]>;
  guidewayNodePoints: ReadonlyMap<StableId, Point>;
  electricalNodePoints: ReadonlyMap<StableId, Point>;
}): MapDiagnostic[] {
  const diagnostics: MapDiagnostic[] = [];

  for (const duplicate of detectDuplicateTileOccupancy(input.document.layout.tiles)) {
    diagnostics.push({
      selection: { kind: "diagnostic", id: `duplicate-tile:${duplicate.key}` },
      category: "duplicateTileOccupancy",
      severity: "error",
      label: `Duplicate tile occupancy ${duplicate.key}`,
      message: `Tiles ${duplicate.tileIds.join(", ")} occupy coordinate ${duplicate.key}.`,
      action: "Move or remove one tile when editing exists. This inspector is read-only.",
      target: { kind: "tile", id: duplicate.tileIds[0] ?? "" },
    });
  }

  for (const tile of input.document.layout.tiles) {
    if (!input.registry.getTileDefinition(tile.type, tile.version)) {
      diagnostics.push({
        selection: { kind: "diagnostic", id: `missing-tile-definition:${tile.id}` },
        category: "missingDefinition",
        severity: "error",
        label: `Missing tile definition for ${tile.id}`,
        message: `${tile.type}@${tile.version} is not registered.`,
        action: "Add the tile definition to the registry or update the fixture type.",
        target: { kind: "tile", id: tile.id },
      });
    }
  }
  for (const setPiece of input.document.layout.setPieces) {
    if (!input.registry.getSetPieceDefinition(setPiece.type, setPiece.version)) {
      diagnostics.push({
        selection: { kind: "diagnostic", id: `missing-set-piece-definition:${setPiece.id}` },
        category: "missingDefinition",
        severity: "error",
        label: `Missing set-piece definition for ${setPiece.id}`,
        message: `${setPiece.type}@${setPiece.version} is not registered.`,
        action: "Add the set-piece definition to the registry or update the fixture type.",
        target: { kind: "setPiece", id: setPiece.id },
      });
    }
  }

  for (const openEnd of input.guideway.openEnds) {
    const id = `open-guideway:${openEnd.tileId}:${openEnd.edge}`;
    diagnostics.push({
      selection: { kind: "diagnostic", id },
      category: "openGuidewayEnd",
      severity: "warning",
      label: `Open guideway edge ${openEnd.edge}`,
      message: `Guideway port ${openEnd.nodeId} on ${openEnd.tileId} has ${openEnd.reason}.`,
      action: "Inspect the adjacent tile or add terminus metadata when intentional end caps are modeled.",
      target: { kind: "guidewayNode", id: openEnd.nodeId },
      bounds: boundsFromPoints([requiredPoint(input.guidewayNodePoints.get(openEnd.nodeId), openEnd.nodeId)], 24),
    });
  }

  for (const incompatible of input.guideway.incompatibleConnections) {
    const id = `incompatible-guideway:${incompatible.tileId}:${incompatible.neighborTileId}:${incompatible.edge}`;
    diagnostics.push({
      selection: { kind: "diagnostic", id },
      category: "incompatibleGuidewayConnection",
      severity: "error",
      label: `Incompatible guideway connection`,
      message: `${incompatible.tileId} edge ${incompatible.edge} cannot connect to ${incompatible.neighborTileId}: ${incompatible.reason}.`,
      action: "Use compatible tile definitions or rotate one of the facing tiles.",
      target: { kind: "tile", id: incompatible.tileId },
    });
  }

  const disconnectedComponents = input.guideway.disconnectedComponents.slice(1);
  for (const component of disconnectedComponents) {
    const points = component.nodeIds
      .map((nodeId) => input.guidewayNodePoints.get(nodeId))
      .filter((point): point is Point => Boolean(point));
    diagnostics.push({
      selection: { kind: "diagnostic", id: `disconnected-guideway:${component.id}` },
      category: "disconnectedGuidewayComponent",
      severity: "warning",
      label: `Disconnected guideway component ${component.id}`,
      message: `${component.nodeIds.length} guideway nodes are isolated from the primary component.`,
      action: "Inspect connector compatibility and missing links between components.",
      target: { kind: "guidewayComponent", id: component.id },
      bounds: boundsFromPoints(points, 32),
    });
  }

  for (const openConnector of input.electrical.openConnectors) {
    const id = `open-electrical:${openConnector.tileId}:${openConnector.edge}`;
    diagnostics.push({
      selection: { kind: "diagnostic", id },
      category: "openElectricalConnector",
      severity: "warning",
      label: `Open electrical edge ${openConnector.edge}`,
      message: `Electrical port ${openConnector.nodeId} on ${openConnector.tileId} has ${openConnector.reason}.`,
      action: "Inspect the adjacent tile or add intentional terminus metadata when supported.",
      target: { kind: "electricalNode", id: openConnector.nodeId },
      bounds: boundsFromPoints([requiredPoint(input.electricalNodePoints.get(openConnector.nodeId), openConnector.nodeId)], 24),
    });
  }

  for (const incompatible of input.electrical.incompatibleConnections) {
    const id = `incompatible-electrical:${incompatible.tileId}:${incompatible.neighborTileId}:${incompatible.edge}`;
    diagnostics.push({
      selection: { kind: "diagnostic", id },
      category: "incompatibleElectricalConnection",
      severity: "error",
      label: `Incompatible electrical connection`,
      message: `${incompatible.tileId} edge ${incompatible.edge} cannot connect to ${incompatible.neighborTileId}: ${incompatible.reason}.`,
      action: "Use matching electrical voltage classes or rotate one of the facing tiles.",
      target: { kind: "tile", id: incompatible.tileId },
    });
  }

  for (const [index, error] of [...input.guideway.errors, ...input.electrical.errors].entries()) {
    diagnostics.push({
      selection: { kind: "diagnostic", id: `extraction-error:${index}` },
      category: "extractionError",
      severity: "error",
      label: "Extraction error",
      message: error,
      action: "Fix the scenario fixture or registry so extraction can complete without errors.",
    });
  }

  return diagnostics.sort((left, right) => selectionKey(left.selection).localeCompare(selectionKey(right.selection)));
}

function summarizeDiagnostics(diagnostics: readonly MapDiagnostic[]): DiagnosticSummary {
  return {
    duplicateTileOccupancy: diagnostics.filter((diagnostic) => diagnostic.category === "duplicateTileOccupancy").length,
    missingDefinition: diagnostics.filter((diagnostic) => diagnostic.category === "missingDefinition").length,
    openGuidewayEnd: diagnostics.filter((diagnostic) => diagnostic.category === "openGuidewayEnd").length,
    incompatibleGuidewayConnection: diagnostics.filter((diagnostic) => diagnostic.category === "incompatibleGuidewayConnection").length,
    disconnectedGuidewayComponent: diagnostics.filter((diagnostic) => diagnostic.category === "disconnectedGuidewayComponent").length,
    openElectricalConnector: diagnostics.filter((diagnostic) => diagnostic.category === "openElectricalConnector").length,
    incompatibleElectricalConnection: diagnostics.filter((diagnostic) => diagnostic.category === "incompatibleElectricalConnection").length,
    extractionError: diagnostics.filter((diagnostic) => diagnostic.category === "extractionError").length,
  };
}

function buildDetails(input: {
  document: ScenarioDocumentV1;
  guideway: ReturnType<typeof extractGuidewayGraph>;
  electrical: ReturnType<typeof extractElectricalGraph>;
  tiles: RenderTile[];
  stations: RenderPoint[];
  serviceZones: RenderPoint[];
  setPieces: RenderPoint[];
  diagnostics: MapDiagnostic[];
  relationMap: SelectionRelationMap;
  tileDefinitions: ReadonlyMap<StableId, TileDefinition>;
  setPieceDefinitions: ReadonlyMap<StableId, SetPieceDefinition>;
}): ReadonlyMap<string, DetailRecord> {
  const details = new Map<string, DetailRecord>();
  const relatedFor = (selection: ScenarioSelection) => [...(input.relationMap.get(selectionKey(selection)) ?? [])];

  for (const tile of input.document.layout.tiles) {
    const selection = { kind: "tile", id: tile.id } as const;
    const definition = input.tileDefinitions.get(tile.id);
    details.set(selectionKey(selection), {
      selection,
      label: definition?.label ?? tile.type,
      kindLabel: "Tile instance",
      properties: [
        { label: "Type", value: `${tile.type}@${tile.version}` },
        { label: "Coordinate", value: `q ${tile.coordinate.q}, r ${tile.coordinate.r}` },
        { label: "Orientation", value: `${tile.orientation} 60-degree steps` },
      ],
      related: relatedFor(selection),
      raw: tile,
    });
  }
  for (const node of input.guideway.nodes) {
    const selection = { kind: "guidewayNode", id: node.id } as const;
    details.set(selectionKey(selection), {
      selection,
      label: `Guideway node ${node.localNodeId}`,
      kindLabel: "Guideway node",
      properties: [
        { label: "Tile", value: node.tileId },
        { label: "Coordinate", value: node.coordinateKey },
      ],
      related: relatedFor(selection),
      raw: node,
    });
  }
  for (const link of input.guideway.links) {
    const selection = { kind: "guidewayLink", id: link.id } as const;
    details.set(selectionKey(selection), {
      selection,
      label: link.kind === "tile-connection" ? "Inter-tile guideway connection" : "Internal guideway link",
      kindLabel: "Guideway link",
      properties: [
        { label: "Kind", value: link.kind },
        { label: "From", value: link.fromNodeId },
        { label: "To", value: link.toNodeId },
      ],
      related: relatedFor(selection),
      raw: link,
    });
  }
  for (const component of input.guideway.disconnectedComponents) {
    const selection = { kind: "guidewayComponent", id: component.id } as const;
    details.set(selectionKey(selection), {
      selection,
      label: component.id,
      kindLabel: "Guideway component",
      properties: [
        { label: "Nodes", value: String(component.nodeIds.length) },
        { label: "State", value: input.guideway.disconnectedComponents.length === 1 ? "single connected component" : "part of disconnected topology" },
      ],
      related: relatedFor(selection),
      raw: component,
    });
  }
  for (const station of input.document.stations) {
    const selection = { kind: "station", id: station.id } as const;
    details.set(selectionKey(selection), {
      selection,
      label: station.label,
      kindLabel: "Station",
      properties: [
        { label: "Tile", value: station.tileId },
        { label: "Service zones", value: station.serviceZoneIds.join(", ") },
        { label: "Guideway attachment", value: `${station.guidewayAttachment.tileId}:${station.guidewayAttachment.localGuidewayNodeId}` },
      ],
      related: relatedFor(selection),
      raw: station,
    });
  }
  for (const serviceZone of input.document.serviceZones) {
    const selection = { kind: "serviceZone", id: serviceZone.id } as const;
    details.set(selectionKey(selection), {
      selection,
      label: serviceZone.label,
      kindLabel: "Service zone",
      properties: [
        { label: "Type", value: serviceZone.type },
        { label: "Station", value: serviceZone.stationId },
        { label: "Capacity", value: String(serviceZone.capacity) },
        { label: "Guideway attachment", value: `${serviceZone.guidewayAttachment.tileId}:${serviceZone.guidewayAttachment.localGuidewayNodeId}` },
      ],
      related: relatedFor(selection),
      raw: serviceZone,
    });
  }
  for (const setPiece of input.document.layout.setPieces) {
    const selection = { kind: "setPiece", id: setPiece.id } as const;
    const definition = input.setPieceDefinitions.get(setPiece.id);
    details.set(selectionKey(selection), {
      selection,
      label: definition?.visual.label ?? setPiece.type,
      kindLabel: "Set piece",
      properties: [
        { label: "Type", value: `${setPiece.type}@${setPiece.version}` },
        { label: "Tile", value: setPiece.tileId },
        { label: "Category", value: definition?.visual.category ?? "unknown" },
      ],
      related: relatedFor(selection),
      raw: setPiece,
    });
  }
  for (const node of input.electrical.nodes) {
    const selection = { kind: "electricalNode", id: node.id } as const;
    details.set(selectionKey(selection), {
      selection,
      label: `Electrical node ${node.localNodeId}`,
      kindLabel: "Electrical node",
      properties: [
        { label: "Tile", value: node.tileId },
        { label: "Local node", value: node.localNodeId },
      ],
      related: relatedFor(selection),
      raw: node,
    });
  }
  for (const branch of input.electrical.branches) {
    const selection = { kind: "electricalBranch", id: branch.id } as const;
    details.set(selectionKey(selection), {
      selection,
      label: branch.kind === "tile-connection" ? "Inter-tile electrical branch" : "Internal electrical branch",
      kindLabel: "Electrical branch",
      properties: [
        { label: "Kind", value: branch.kind },
        { label: "From", value: branch.fromNodeId },
        { label: "To", value: branch.toNodeId },
        { label: "Resistance", value: `${branch.resistanceOhms} ohms` },
        { label: "Current limit", value: `${branch.currentLimitAmps} A` },
        { label: "Enabled", value: branch.enabled ? "yes" : "no" },
      ],
      related: relatedFor(selection),
      raw: branch,
    });
  }
  for (const source of input.electrical.sources) {
    const selection = { kind: "electricalSource", id: source.id } as const;
    details.set(selectionKey(selection), {
      selection,
      label: "Nominal power source",
      kindLabel: "Electrical source",
      properties: [
        { label: "Node", value: source.nodeId },
        { label: "Nominal voltage", value: `${source.nominalVoltage} V` },
        { label: "Maximum power", value: `${source.maximumWatts} W` },
      ],
      related: relatedFor(selection),
      raw: source,
    });
  }
  for (const load of input.electrical.loads) {
    const selection = { kind: "electricalLoad", id: load.id } as const;
    details.set(selectionKey(selection), {
      selection,
      label: `${load.loadClass} load`,
      kindLabel: "Electrical load",
      properties: [
        { label: "Node", value: load.nodeId },
        { label: "Requested power", value: `${load.requestedWatts} W` },
        { label: "Minimum voltage", value: `${load.minimumVoltage} V` },
        { label: "Load class", value: load.loadClass },
        { label: "Shedding priority", value: String(load.sheddingPriority) },
      ],
      related: relatedFor(selection),
      raw: load,
    });
  }
  for (const diagnostic of input.diagnostics) {
    details.set(selectionKey(diagnostic.selection), {
      selection: diagnostic.selection,
      label: diagnostic.label,
      kindLabel: `${diagnostic.severity} diagnostic`,
      properties: [
        { label: "Category", value: diagnostic.category },
        { label: "Message", value: diagnostic.message },
        { label: "Action", value: diagnostic.action },
      ],
      related: diagnostic.target ? [diagnostic.target] : [],
      raw: diagnostic,
    });
  }

  return details;
}

function addBidirectionalRelation(
  relations: MutableRelationMap,
  left: ScenarioSelection,
  right: ScenarioSelection,
): void {
  addRelation(relations, left, right);
  addRelation(relations, right, left);
}

function addRelation(
  relations: MutableRelationMap,
  source: ScenarioSelection,
  related: ScenarioSelection,
): void {
  const sourceKey = selectionKey(source);
  const current = relations.get(sourceKey) ?? [];
  if (!current.some((item) => selectionKey(item) === selectionKey(related))) {
    current.push(related);
  }
  relations.set(sourceKey, current);
}

function findSetPieceForServiceZone(
  setPieces: readonly SetPieceInstance[],
  definitions: ReadonlyMap<StableId, SetPieceDefinition>,
  serviceZone: ServiceZone,
): SetPieceInstance | undefined {
  return setPieces.find((setPiece) => {
    const definition = definitions.get(setPiece.id);
    return (
      setPiece.tileId === serviceZone.guidewayAttachment.tileId &&
      definition?.service?.serviceZoneType === serviceZone.type
    );
  });
}

function averagePoints(points: readonly Point[]): Point {
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
}

function offsetPoint(point: Point, x: number, y: number): Point {
  return { x: point.x + x, y: point.y + y };
}

function requiredPoint(point: Point | undefined, id: string): Point {
  if (!point) {
    throw new Error(`Missing render point for ${id}`);
  }
  return point;
}
