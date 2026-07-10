import type { EdgeIndex } from "./hex";

export type GuidewayConnector = {
  kind: "guideway";
  gauge: "atos-standard" | "maintenance";
  enabled: boolean;
};

export type ElectricalConnector = {
  kind: "electrical";
  voltageClass: "low-voltage-dc" | "logic";
  enabled: boolean;
};

export type TileEdgeDefinition = {
  edge: EdgeIndex;
  guideway?: GuidewayConnector;
  electrical?: ElectricalConnector;
};

export type ConnectorCompatibility = {
  compatible: boolean;
  reason?: string;
};

export function areGuidewayConnectorsCompatible(
  left: GuidewayConnector | undefined,
  right: GuidewayConnector | undefined,
): ConnectorCompatibility {
  if (!left || !right) {
    return { compatible: false, reason: "guideway connector missing" };
  }

  if (!left.enabled || !right.enabled) {
    return { compatible: false, reason: "guideway connector disabled" };
  }

  if (left.gauge !== right.gauge) {
    return { compatible: false, reason: `guideway gauge mismatch: ${left.gauge} != ${right.gauge}` };
  }

  return { compatible: true };
}

export function areElectricalConnectorsCompatible(
  left: ElectricalConnector | undefined,
  right: ElectricalConnector | undefined,
): ConnectorCompatibility {
  if (!left || !right) {
    return { compatible: false, reason: "electrical connector missing" };
  }

  if (!left.enabled || !right.enabled) {
    return { compatible: false, reason: "electrical connector disabled" };
  }

  if (left.voltageClass !== right.voltageClass) {
    return {
      compatible: false,
      reason: `electrical voltage class mismatch: ${left.voltageClass} != ${right.voltageClass}`,
    };
  }

  return { compatible: true };
}
