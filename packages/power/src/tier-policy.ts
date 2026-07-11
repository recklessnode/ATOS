import type { PowerConsumerTier, PowerLoadClass } from "./types";

export const POWER_TIER_LABELS: Record<PowerConsumerTier, string> = {
  0: "Tier 0 - Safety critical",
  1: "Tier 1 - Control critical",
  2: "Tier 2 - Mobility critical",
  3: "Tier 3 - Mission support",
  4: "Tier 4 - Operational convenience",
  5: "Tier 5 - Amenity",
  6: "Tier 6 - Decorative",
};

export const PROTECTED_CONSUMER_TIERS = [0, 1, 2] as const satisfies readonly PowerConsumerTier[];

export function consumerTierForLoadClass(loadClass: PowerLoadClass): PowerConsumerTier {
  switch (loadClass) {
    case "braking":
    case "safety":
      return 0;
    case "control":
    case "communications":
    case "sensing":
      return 1;
    case "propulsion":
    case "switching":
      return 2;
    case "charging":
    case "passenger":
    case "cargo":
    case "maintenance":
      return 3;
    case "building":
      return 4;
    case "lighting":
      return 5;
    case "effects":
    case "decorative":
      return 6;
    default:
      return 4;
  }
}

export function isProtectedTier(tier: PowerConsumerTier): boolean {
  return (PROTECTED_CONSUMER_TIERS as readonly PowerConsumerTier[]).includes(tier);
}
