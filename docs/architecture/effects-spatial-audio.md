# Effects and Spatial Audio

## Effects are state projections

Light, motion, and audio communicate authoritative world state. They do not independently create that state.

Examples:

- an empty house selects a dark scene
- partial occupancy selects one or two room lights
- full occupancy permits broader interior activity
- a working factory enables furnace light, machinery motion, and ambient sound
- a power-starved factory enters a dormant scene while its inventories remain intact

Presentation is declarative: entity state selects a scene, and the runtime renders that scene through available endpoints.

## Effect channels

### Light

Address semantic zones such as `kitchen`, `platform_edge`, `furnace`, or `status`, not raw LED numbers. Scene definitions map semantics to hardware channels.

### Motion

Motion endpoints declare range, speed, duty-cycle, peak power, safe position, and whether interruption is allowed. Crossing gates and track switches have stronger safety requirements than decorative conveyors.

### Audio

Audio is a first-class structural capability. An entity may contain a speaker, request rendering through the supporting tile, or combine both.

Recommended rendering layers:

1. **structure-local speaker** — bells, announcements, machinery, voices
2. **tile speaker or surface exciter** — localized track sound and district ambience
3. **shared under-table low-frequency channel** — rumble and nonlocal bass

## Logical emitters

The simulation creates logical audio emitters with identity, position, sound profile, motion, and lifecycle.

```yaml
emitter_id: train-17-guideway
asset: audio.train.maglev_hum.02
position_source: train-17
loop: true
priority: mobility
```

The rendering system decides which physical speakers reproduce the emitter. A train sound is not owned by one tile; it migrates across nearby tiles as the train moves.

## Local synthesis over continuous streaming

For recurring effects, distribute sound assets and synthesis definitions ahead of time. Runtime messages carry compact parameters:

- asset or synthesis profile
- synchronized start tick
- gain and pitch
- position and velocity
- loop and envelope state
- priority and cancellation token

This avoids network jitter and reduces bus bandwidth. Streaming remains available for speech, user recordings, and uncommon content.

## Shared clock

All tile audio nodes participate in a synchronized clock. Track route reservations allow the system to schedule sound before the train arrives.

Engineering targets for prototypes:

- clock agreement: approximately 1 ms or better
- local scheduled-event start error: under 2 ms
- unscheduled event response: under 20 ms
- train-position update interval: 5–10 ms where practical
- audio trajectory scheduled 100–500 ms ahead on reserved track

Exact targets should be validated through listening tests, not accepted only from instrumentation.

## Moving sound handoff

For a train crossing tiles A, B, and C, the audio engine calculates overlapping gains from distance and direction. Neighboring tiles render the same synchronized source with different gain and filtering.

The source should crossfade continuously rather than stop on one tile and start on another. Pitch may follow speed and acceleration; optional Doppler should be subtle at model scale.

Tile-local rendering must remain stable if one control packet is delayed. Each tile follows the scheduled trajectory until it receives an update or timeout policy applies.

## Track-event sound

Track can produce several layered emitters:

- continuous vehicle or guideway hum tied to position
- entry transient as a car enters a segment
- junction or coupling sounds tied to physical events
- braking and acceleration layers tied to dynamics
- station arrival and crossing warnings tied to movement authority

Local sensors can correct predicted timing. The central route controller provides intent; the tile provides the last-meter synchronization.

## Ambience

Tiles may render district ambience based on group identity and simulation state:

- residential evening
- active industrial district
- station crowd
- rain or weather
- church bells
- market activity

Ambience uses lower priority than safety alerts and train-localization sounds. The mixer reserves headroom for high-priority transients.

## Power-aware rendering

Every scene declares power cost and degradation options. Under pressure, the runtime may:

- reduce amplifier gain
- remove low-priority voices
- lower LED brightness
- stop decorative motors
- preserve warning tones and status lights

Audio restoration should be staged to avoid abrupt cacophony when power returns.

## Structure-local versus tile-local choice

Use structure-local speakers when height, enclosure resonance, or semantic origin matters: a steeple bell or station announcement.

Use tile-local audio when sound follows moving objects, when payload size is constrained, or when reusable ambience is desired.

A payload advertises both its available endpoints and whether tile rendering is permitted. A scene may route different layers to different endpoints.

## Asset management

Audio assets are content-addressed and versioned. Tiles maintain a cache containing common train, city, and interaction sounds. The runtime prefetches missing assets before enabling a scene or route when possible.

A fallback synthesizer should provide basic hums, tones, alarms, and envelopes when a sample is unavailable.

## Validation

Tests should include:

- train passing at several speeds without audible speaker hopping
- route replanning without orphaned audio
- payload removal cancelling local scenes safely
- degraded network operation using scheduled trajectories
- load shedding that preserves critical alerts
- calibration across mixed tile hardware revisions
