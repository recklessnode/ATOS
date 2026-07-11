import type { ScenarioMapLayerId, ScenarioMapLayers } from "./render-model";

const LAYERS: { id: ScenarioMapLayerId; label: string }[] = [
  { id: "tiles", label: "Hex tiles" },
  { id: "tileLabels", label: "Tile labels" },
  { id: "guideway", label: "Guideway" },
  { id: "stations", label: "Stations and service zones" },
  { id: "electrical", label: "Electrical network" },
  { id: "diagnostics", label: "Diagnostics" },
];

export function ScenarioMapLayersControl({
  layers,
  onToggle,
}: {
  layers: ScenarioMapLayers;
  onToggle: (layer: ScenarioMapLayerId) => void;
}) {
  return (
    <fieldset className="scenario-map-layers" aria-label="Scenario map layers">
      <legend>Layers</legend>
      {LAYERS.map((layer) => (
        <label key={layer.id}>
          <input
            checked={layers[layer.id]}
            onChange={() => onToggle(layer.id)}
            type="checkbox"
          />
          <span>{layer.label}</span>
        </label>
      ))}
    </fieldset>
  );
}
