export type StableId = string;

export type PowerConsumerTier = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type PowerLoadModel = "constant_power" | "constant_resistance";

export type PowerLoadClass =
  | "braking"
  | "safety"
  | "control"
  | "communications"
  | "sensing"
  | "propulsion"
  | "switching"
  | "charging"
  | "passenger"
  | "cargo"
  | "maintenance"
  | "building"
  | "lighting"
  | "effects"
  | "decorative"
  | string;

export type PowerNetworkNodeInput = {
  id: StableId;
  tileId?: StableId;
  localNodeId?: StableId;
};

export type PowerNetworkBranchInput = {
  id: StableId;
  fromNodeId: StableId;
  toNodeId: StableId;
  resistanceOhms: number;
  currentLimitAmps: number;
  enabled: boolean;
  kind?: string;
};

export type PowerNetworkSourceInput = {
  id: StableId;
  nodeId: StableId;
  nominalVoltage: number;
  maximumWatts: number;
};

export type PowerNetworkLoadInput = {
  id: StableId;
  nodeId: StableId;
  requestedWatts: number;
  minimumVoltage: number;
  loadClass: PowerLoadClass;
  sheddingPriority: number;
  enabled?: boolean;
  model?: PowerLoadModel;
  resistanceOhms?: number;
  consumerTier?: PowerConsumerTier;
};

export type PowerNetworkInput = {
  nodes: readonly PowerNetworkNodeInput[];
  branches: readonly PowerNetworkBranchInput[];
  sources: readonly PowerNetworkSourceInput[];
  loads: readonly PowerNetworkLoadInput[];
};

export type PowerPresetId =
  | "idle"
  | "normal_operations"
  | "simultaneous_station_load"
  | "propulsion_surge"
  | "brownout_stress";

export type NormalizedPowerNode = Required<PowerNetworkNodeInput> & {
  componentId: StableId;
  hasSource: boolean;
};

export type NormalizedPowerBranch = Required<PowerNetworkBranchInput>;

export type NormalizedPowerSource = Required<PowerNetworkSourceInput>;

export type NormalizedPowerLoad = Required<Omit<PowerNetworkLoadInput, "resistanceOhms">> & {
  resistanceOhms?: number;
  consumerTier: PowerConsumerTier;
};

export type PowerValidationIssue = {
  id: StableId;
  severity: "warning" | "error";
  code:
    | "duplicate_id"
    | "missing_node"
    | "invalid_number"
    | "invalid_resistance"
    | "invalid_current_limit"
    | "invalid_source_voltage"
    | "invalid_source_power"
    | "invalid_load"
    | "conflicting_sources";
  message: string;
  affectedIds: StableId[];
};

export type NormalizedPowerNetwork = {
  nodes: NormalizedPowerNode[];
  branches: NormalizedPowerBranch[];
  sources: NormalizedPowerSource[];
  loads: NormalizedPowerLoad[];
  validationIssues: PowerValidationIssue[];
};

export type LoadState = "served" | "undervoltage" | "shed" | "disconnected" | "infeasible";

export type BranchState = "normal" | "near_limit" | "overloaded" | "disabled" | "open";

export type NetworkState =
  | "nominal"
  | "degraded"
  | "brownout"
  | "overloaded"
  | "source_limited"
  | "non_converged"
  | "islanded"
  | "invalid";

export type PowerSolverOptions = {
  maxIterations: number;
  voltageTolerance: number;
  dampingFactor: number;
  regularizationVoltageFloor: number;
  branchNearLimitThreshold: number;
  powerBalanceToleranceWatts: number;
  allowProtectedShedding: boolean;
};

export type NodePowerResult = {
  id: StableId;
  voltage: number;
  componentId: StableId;
  hasSource: boolean;
  connectedBranchIds: StableId[];
  attachedSourceIds: StableId[];
  attachedLoadIds: StableId[];
};

export type BranchPowerResult = {
  id: StableId;
  fromNodeId: StableId;
  toNodeId: StableId;
  currentAmps: number;
  absCurrentAmps: number;
  voltageDrop: number;
  powerLossWatts: number;
  currentLimitAmps: number;
  utilization: number;
  state: BranchState;
  resistanceOhms: number;
  enabled: boolean;
};

export type LoadPowerResult = {
  id: StableId;
  nodeId: StableId;
  requestedWatts: number;
  deliveredWatts: number;
  currentAmps: number;
  voltage: number;
  minimumVoltage: number;
  loadClass: PowerLoadClass;
  consumerTier: PowerConsumerTier;
  sheddingPriority: number;
  model: PowerLoadModel;
  state: LoadState;
  sheddingReason?: string;
};

export type SourcePowerResult = {
  id: StableId;
  nodeId: StableId;
  nominalVoltage: number;
  maximumWatts: number;
  currentAmps: number;
  deliveredWatts: number;
  utilization: number;
  wattageHeadroom: number;
  currentHeadroom: number;
};

export type TierPowerSummary = {
  tier: PowerConsumerTier;
  label: string;
  requestedWatts: number;
  deliveredWatts: number;
  shedWatts: number;
  undervoltageWatts: number;
  loadCount: number;
  servedCount: number;
  shedCount: number;
  undervoltageCount: number;
};

export type SheddingDecision = {
  id: StableId;
  loadId: StableId;
  consumerTier: PowerConsumerTier;
  sheddingPriority: number;
  reasonCode:
    | "source_limit"
    | "branch_overload"
    | "undervoltage"
    | "non_converged"
    | "protected_constraint_violation";
  reason: string;
  blockingIds: StableId[];
};

export type PowerDiagnostic = {
  id: StableId;
  severity: "info" | "warning" | "error";
  code:
    | "source_limit"
    | "branch_overload"
    | "load_undervoltage"
    | "load_shed"
    | "load_disconnected"
    | "islanded"
    | "non_converged"
    | "invalid_network"
    | "power_balance";
  message: string;
  affectedIds: StableId[];
  measured?: number;
  threshold?: number;
  unit?: "V" | "A" | "W" | "%";
};

export type PowerFindingType =
  | "long_radial_feed"
  | "far_end_load_cluster"
  | "source_bottleneck"
  | "ineffective_loop"
  | "islanded_load"
  | "poor_source_placement"
  | "near_source_capacity"
  | "shared_weak_path"
  | "safety_redundancy"
  | "surge_failure";

export type PowerFinding = {
  id: StableId;
  type: PowerFindingType;
  severity: "info" | "warning" | "error";
  label: string;
  explanation: string;
  affectedIds: StableId[];
  targetId?: StableId;
  targetKind?: "node" | "branch" | "source" | "load" | "tile" | "setPiece";
  metrics: Record<string, number>;
  threshold?: number;
};

export type RecommendationType =
  | "add_source"
  | "add_feeder"
  | "move_source"
  | "move_load"
  | "reinforce_branch"
  | "add_storage"
  | "add_tile"
  | "increase_wattage";

export type RecommendationScore = {
  restoredCriticalTier: number;
  brownoutElimination: number;
  overloadElimination: number;
  minimumVoltageImprovement: number;
  branchHeadroomImprovement: number;
  lossReduction: number;
  servedLoadImprovement: number;
  changeCostPenalty: number;
  total: number;
};

export type RecommendationPreview = {
  before: Pick<
    PowerMetrics,
    | "networkState"
    | "minimumNodeVoltage"
    | "worstBranchUtilization"
    | "totalDeliveredLoadWatts"
    | "totalConductorLossWatts"
    | "unservedWatts"
  >;
  after: Pick<
    PowerMetrics,
    | "networkState"
    | "minimumNodeVoltage"
    | "worstBranchUtilization"
    | "totalDeliveredLoadWatts"
    | "totalConductorLossWatts"
    | "unservedWatts"
  >;
};

export type PowerRecommendation = {
  id: StableId;
  type: RecommendationType;
  affectedIds: StableId[];
  targetId?: StableId;
  targetKind?: "node" | "branch" | "source" | "load" | "tile" | "setPiece";
  observedDeficiency: string;
  proposedChange: string;
  preview?: RecommendationPreview;
  score: RecommendationScore;
  confidence: "high" | "medium" | "low";
  applicability: "direct_simulation" | "heuristic";
  costClass: "low" | "medium" | "high";
  tradeoffs: string[];
  explanation: string;
};

export type PowerMetrics = {
  networkState: NetworkState;
  converged: boolean;
  iterationCount: number;
  maxVoltageDelta: number;
  minimumNodeVoltage: number;
  worstVoltageDropPercent: number;
  worstBranchId?: StableId;
  worstBranchUtilization: number;
  totalRequestedLoadWatts: number;
  totalDeliveredLoadWatts: number;
  totalSourceWatts: number;
  totalConductorLossWatts: number;
  conductorLossPercent: number;
  unservedWatts: number;
  powerBalanceResidualWatts: number;
  shedLoadCount: number;
  shedWatts: number;
  undervoltageLoadCount: number;
  undervoltageWatts: number;
  sourceWattageHeadroom: number;
  sourceCurrentHeadroom: number;
  estimatedAdditionalLoadMarginWatts: number;
};

export type PowerAnalysisResult = {
  normalized: NormalizedPowerNetwork;
  nodes: NodePowerResult[];
  branches: BranchPowerResult[];
  loads: LoadPowerResult[];
  sources: SourcePowerResult[];
  diagnostics: PowerDiagnostic[];
  findings: PowerFinding[];
  recommendations: PowerRecommendation[];
  tierSummaries: TierPowerSummary[];
  sheddingDecisions: SheddingDecision[];
  metrics: PowerMetrics;
  safetyPreserved: boolean;
  controlPreserved: boolean;
  mobilityPreserved: boolean;
  highestProtectedTierNotFullyServed?: PowerConsumerTier;
};
