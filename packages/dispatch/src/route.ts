import type { ContractEndpoint, StableId } from "@atos/domain";
import type { GuidewayLink, GuidewayNode, GuidewayServiceAttachment } from "@atos/layout";
import type { GuidewayRoute } from "./types";

export type DispatchGuidewayGraph = {
  nodes: readonly GuidewayNode[];
  links: readonly GuidewayLink[];
  serviceAttachments: readonly GuidewayServiceAttachment[];
};

export function routeBetweenEndpoints(
  graph: DispatchGuidewayGraph,
  origin: ContractEndpoint,
  destination: ContractEndpoint,
): GuidewayRoute {
  const originNodeId = attachmentNodeId(graph.serviceAttachments, origin);
  const destinationNodeId = attachmentNodeId(graph.serviceAttachments, destination);
  if (!originNodeId || !destinationNodeId) {
    return unreachableRoute(originNodeId ?? "missing-origin", destinationNodeId ?? "missing-destination");
  }
  return shortestGuidewayRoute(graph, originNodeId, destinationNodeId);
}

export function shortestGuidewayRoute(
  graph: DispatchGuidewayGraph,
  originNodeId: StableId,
  destinationNodeId: StableId,
): GuidewayRoute {
  if (originNodeId === destinationNodeId) {
    return {
      originNodeId,
      destinationNodeId,
      pathNodeIds: [originNodeId],
      linkIds: [],
      hopCount: 0,
      cost: 0,
      reachable: true,
    };
  }

  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  if (!nodeIds.has(originNodeId) || !nodeIds.has(destinationNodeId)) {
    return unreachableRoute(originNodeId, destinationNodeId);
  }

  const adjacency = buildAdjacency(graph.links);
  const distances = new Map<StableId, number>([[originNodeId, 0]]);
  const previous = new Map<StableId, { nodeId: StableId; linkId: StableId }>();
  const unsettled = new Set<StableId>(nodeIds);

  while (unsettled.size > 0) {
    const current = nextUnsettled(unsettled, distances);
    if (!current) {
      break;
    }
    unsettled.delete(current);
    if (current === destinationNodeId) {
      break;
    }

    for (const edge of adjacency.get(current) ?? []) {
      if (!unsettled.has(edge.toNodeId)) {
        continue;
      }
      const nextDistance = (distances.get(current) ?? Number.POSITIVE_INFINITY) + edge.cost;
      const previousDistance = distances.get(edge.toNodeId) ?? Number.POSITIVE_INFINITY;
      if (
        nextDistance < previousDistance ||
        (nextDistance === previousDistance && edge.linkId < (previous.get(edge.toNodeId)?.linkId ?? "\uffff"))
      ) {
        distances.set(edge.toNodeId, nextDistance);
        previous.set(edge.toNodeId, { nodeId: current, linkId: edge.linkId });
      }
    }
  }

  if (!previous.has(destinationNodeId)) {
    return unreachableRoute(originNodeId, destinationNodeId);
  }

  const pathNodeIds = [destinationNodeId];
  const linkIds: StableId[] = [];
  let cursor = destinationNodeId;
  while (cursor !== originNodeId) {
    const step = previous.get(cursor);
    if (!step) {
      return unreachableRoute(originNodeId, destinationNodeId);
    }
    linkIds.push(step.linkId);
    pathNodeIds.push(step.nodeId);
    cursor = step.nodeId;
  }

  pathNodeIds.reverse();
  linkIds.reverse();
  return {
    originNodeId,
    destinationNodeId,
    pathNodeIds,
    linkIds,
    hopCount: linkIds.length,
    cost: round(distances.get(destinationNodeId) ?? linkIds.length),
    reachable: true,
  };
}

function attachmentNodeId(
  attachments: readonly GuidewayServiceAttachment[],
  endpoint: ContractEndpoint,
): StableId | undefined {
  const byZone = endpoint.serviceZoneId
    ? attachments.find((attachment) => attachment.serviceZoneId === endpoint.serviceZoneId)
    : undefined;
  const byStation = attachments.find(
    (attachment) => attachment.stationId === endpoint.stationId && !attachment.serviceZoneId,
  );
  return byZone?.nodeId ?? byStation?.nodeId;
}

function buildAdjacency(links: readonly GuidewayLink[]): Map<StableId, { toNodeId: StableId; linkId: StableId; cost: number }[]> {
  const adjacency = new Map<StableId, { toNodeId: StableId; linkId: StableId; cost: number }[]>();
  for (const link of [...links].sort((left, right) => left.id.localeCompare(right.id))) {
    const cost = link.kind === "tile-connection" ? 1 : 0.5;
    const forward = { toNodeId: link.toNodeId, linkId: link.id, cost };
    const backward = { toNodeId: link.fromNodeId, linkId: link.id, cost };
    adjacency.set(link.fromNodeId, [...(adjacency.get(link.fromNodeId) ?? []), forward]);
    adjacency.set(link.toNodeId, [...(adjacency.get(link.toNodeId) ?? []), backward]);
  }
  for (const [nodeId, edges] of adjacency) {
    adjacency.set(
      nodeId,
      edges.sort((left, right) => {
        const costCompare = left.cost - right.cost;
        if (costCompare !== 0) {
          return costCompare;
        }
        const nodeCompare = left.toNodeId.localeCompare(right.toNodeId);
        return nodeCompare === 0 ? left.linkId.localeCompare(right.linkId) : nodeCompare;
      }),
    );
  }
  return adjacency;
}

function nextUnsettled(
  unsettled: ReadonlySet<StableId>,
  distances: ReadonlyMap<StableId, number>,
): StableId | undefined {
  return [...unsettled]
    .filter((nodeId) => distances.has(nodeId))
    .sort((left, right) => {
      const distanceCompare = (distances.get(left) ?? 0) - (distances.get(right) ?? 0);
      return distanceCompare === 0 ? left.localeCompare(right) : distanceCompare;
    })[0];
}

function unreachableRoute(originNodeId: StableId, destinationNodeId: StableId): GuidewayRoute {
  return {
    originNodeId,
    destinationNodeId,
    pathNodeIds: [],
    linkIds: [],
    hopCount: 0,
    cost: Number.POSITIVE_INFINITY,
    reachable: false,
  };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
