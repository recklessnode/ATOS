import type { StableId } from "@atos/domain";
import type { PowerAnalysisResult } from "@atos/power";
import type { DispatchAsset, PowerLaunchGate } from "./types";

export function evaluatePowerLaunchGate(
  power: PowerAnalysisResult,
  assets: readonly DispatchAsset[],
): PowerLaunchGate {
  const reasonCodes = power.diagnostics.map((diagnostic) => diagnostic.code).sort();
  const affectedPowerIds = uniqueSorted(power.diagnostics.flatMap((diagnostic) => diagnostic.affectedIds));
  const supportAssetIds = assets
    .filter((asset) =>
      asset.state === "available" &&
      (asset.vehicleClass === "battery-support" || asset.kind === "charger" || asset.kind === "power-source")
    )
    .map((asset) => asset.id)
    .sort();

  if (
    !power.safetyPreserved ||
    !power.controlPreserved ||
    !power.mobilityPreserved ||
    power.metrics.networkState === "invalid" ||
    power.metrics.networkState === "islanded" ||
    power.metrics.networkState === "non_converged"
  ) {
    return {
      status: "blocked",
      message: "Launch blocked because protected safety, control, or mobility power is not preserved.",
      reasonCodes: uniqueSorted(["protected_power_not_preserved", ...reasonCodes]),
      networkState: power.metrics.networkState,
      affectedPowerIds,
      supportAssetIds,
    };
  }

  if (
    power.metrics.networkState === "brownout" ||
    power.metrics.networkState === "overloaded" ||
    power.metrics.networkState === "source_limited" ||
    power.diagnostics.some((diagnostic) => diagnostic.severity === "error")
  ) {
    return {
      status: "delayed",
      message: "Launch delayed until the power workspace clears the brownout, overload, or source limit.",
      reasonCodes: uniqueSorted(["power_margin_insufficient", ...reasonCodes]),
      networkState: power.metrics.networkState,
      affectedPowerIds,
      supportAssetIds,
    };
  }

  if (power.metrics.networkState === "degraded") {
    return {
      status: "delayed",
      message: "Launch delayed for operator review because the power network is degraded.",
      reasonCodes: uniqueSorted(["degraded_power_review", ...reasonCodes]),
      networkState: power.metrics.networkState,
      affectedPowerIds,
      supportAssetIds,
    };
  }

  return {
    status: "allowed",
    message: "Launch allowed by the current deterministic power analysis.",
    reasonCodes,
    networkState: power.metrics.networkState,
    affectedPowerIds,
    supportAssetIds,
  };
}

function uniqueSorted(values: readonly StableId[]): StableId[] {
  return [...new Set(values)].sort();
}
