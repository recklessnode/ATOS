import type { IsoDateTimeString } from "@atos/domain";
import type { SimulationClock, SimulationConfig } from "./types";

export const DEFAULT_SIMULATION_CONFIG: SimulationConfig = {
  tickSeconds: 60,
  playbackSpeed: 1,
  maxEventsPerAdvance: 500,
  formationSeconds: 90,
  splitSeconds: 60,
  baseLoadingSeconds: 45,
  baseUnloadingSeconds: 45,
  passengerLoadSeconds: 6,
  passengerUnloadSeconds: 4,
  cargoKgLoadSeconds: 2,
  cargoKgUnloadSeconds: 2.5,
  dwellSeconds: 30,
  internalLinkTravelSeconds: 28,
  connectionLinkTravelSeconds: 42,
  accelerationAllowanceSeconds: 12,
  chargingPowerWatts: 60,
  maintenanceSeconds: 180,
  minimumBatteryReserveWh: 20,
  propulsionWhPerInternalLink: 8,
  propulsionWhPerConnectionLink: 12,
  serviceEnergyWh: 3,
  conflictRetrySeconds: 30,
};

export function mergeSimulationConfig(config: Partial<SimulationConfig> = {}): SimulationConfig {
  return { ...DEFAULT_SIMULATION_CONFIG, ...config };
}

export function createSimulationClock(
  currentTime: IsoDateTimeString,
  config: SimulationConfig,
): SimulationClock {
  return {
    currentTime,
    status: "paused",
    playbackSpeed: config.playbackSpeed,
    tickSeconds: config.tickSeconds,
    processedEventCount: 0,
    maxEventsPerAdvance: config.maxEventsPerAdvance,
  };
}

export function pauseClock(clock: SimulationClock): SimulationClock {
  return { ...clock, status: clock.status === "completed" ? "completed" : "paused" };
}

export function resumeClock(clock: SimulationClock): SimulationClock {
  return { ...clock, status: clock.status === "completed" ? "completed" : "running" };
}

export function completeClock(clock: SimulationClock): SimulationClock {
  return { ...clock, status: "completed" };
}

export function setPlaybackSpeed(clock: SimulationClock, playbackSpeed: number): SimulationClock {
  return { ...clock, playbackSpeed: Math.max(0.1, playbackSpeed) };
}

export function advanceClockTo(clock: SimulationClock, currentTime: IsoDateTimeString): SimulationClock {
  return { ...clock, currentTime };
}

export function advanceIsoTime(time: IsoDateTimeString, seconds: number): IsoDateTimeString {
  return new Date(Date.parse(time) + seconds * 1000).toISOString();
}

export function secondsBetween(start: IsoDateTimeString, end: IsoDateTimeString): number {
  return Math.max(0, (Date.parse(end) - Date.parse(start)) / 1000);
}
