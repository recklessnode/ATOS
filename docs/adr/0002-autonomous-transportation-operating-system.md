# ADR 0002: Autonomous Transportation Operating System

- Status: Accepted
- Date: 2026-07-10

## Context

The system is not fundamentally a collection of fixed trains. It is a network of stateful demands, modular assets, intelligent stations, and guideway infrastructure.

## Decision

Model ATOS as an Autonomous Transportation Operating System with three primary tracks:

- Design strategy: doctrine, first principles, trade studies, and ADRs.
- Hardware architecture: vehicles, guideway, stations, power, sensing, and physical experiments.
- Software environment: contracts, chits, workers, dispatch, routing, maintenance, energy, simulation, and telemetry.

Verification spans all three tracks.

## Consequences

- A physical train is treated as a temporary execution structure rather than a permanent domain object.
- The software model is developed before the hardware layer.
- Hardware components eventually become clients of the same state and dispatch model used by the simulator.
- Each major feature should be explainable from strategy, hardware, software, and verification perspectives.

## Validation

The architecture is successful when simulated and physical assets can participate in the same contract, chit, state, dispatch, and telemetry model.