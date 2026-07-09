# ATOS: Autonomous Transportation Operating System

ATOS is an open engineering notebook and prototype software stack for a modular miniature maglev transportation system.

The project begins in simulation before hardware. The goal is to model stateful demand, modular assets, autonomous stations, software-defined consists, energy logistics, dispatch optimization, and failure-aware operations.

## Core doctrine

- Design around the smallest atomic unit of failure.
- Everything is a test.
- Fail fast, fail cheap, fail often.
- Design from first principles around the most elegant approach.
- Minimize mechanically moving parts.
- Prefer software-defined routing, consists, and dispatch over fixed trainsets.

## System model

ATOS does not begin with trains. It begins with stateful contracts.

Contracts describe desired outcomes. Chits normalize the atomic work required to satisfy those outcomes. Workers are assets that can perform work. Transient super workers are temporary coalitions of assets, such as a software-defined train consist, a depot unload team, or a battery support mission.

A train is not a permanent object. A train is a temporary mission bundle assembled from available cars, energy assets, station capacity, and route opportunity.

## Initial repository structure

```text
docs/
  adr/
    0001-project-doctrine.md
    0002-autonomous-transportation-operating-system.md
    0003-universal-chit-schema.md
    0004-software-defined-consists.md
    0005-station-as-router.md
    0006-deficiency-gates.md
    0007-energy-logistics.md
schema/
  universal_chit.sql
```

## ADRs

Architecture Decision Records are stored in [`docs/adr`](docs/adr/).

Start with [`docs/adr/0000-index.md`](docs/adr/0000-index.md).
