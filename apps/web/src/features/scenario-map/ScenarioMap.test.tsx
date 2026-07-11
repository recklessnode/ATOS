import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { loadSixTileCityFixture } from "@atos/scenario";
import { buildScenarioMapRenderModel } from "./render-model";
import { ScenarioMap } from "./ScenarioMap";

describe("ScenarioMap", () => {
  it("renders the six-tile fixture and default layers", () => {
    render(<ScenarioMap />);

    expect(screen.getByTestId("scenario-map-svg")).toBeInTheDocument();
    expect(screen.getByTestId("tile-tile-power")).toBeInTheDocument();
    expect(screen.getByTestId("tile-tile-platform")).toBeInTheDocument();
    expect(screen.getByTestId("tile-tile-cargo")).toBeInTheDocument();
    expect(screen.getByTestId("tile-tile-charging")).toBeInTheDocument();
    expect(screen.getByLabelText("Electrical network")).not.toBeChecked();
    expect(screen.queryByTestId("electricalSource-tile-power:source")).not.toBeInTheDocument();
  });

  it("selects and clears tiles with stable IDs", () => {
    render(<ScenarioMap />);

    fireEvent.click(screen.getByTestId("tile-tile-power"));
    expect(screen.getByRole("heading", { name: "Power injection curve" })).toBeInTheDocument();
    expect(screen.getAllByText("tile-power").length).toBeGreaterThan(0);

    fireEvent.keyDown(screen.getByTestId("scenario-map-svg"), { key: "Escape" });
    expect(screen.getByRole("heading", { name: "No object selected" })).toBeInTheDocument();
  });

  it("selects guideway nodes and links", () => {
    render(<ScenarioMap />);

    fireEvent.click(screen.getByTestId("guidewayNode-tile-platform:guideway-b"));
    expect(screen.getByRole("heading", { name: "Guideway node guideway-b" })).toBeInTheDocument();

    fireEvent.click(
      screen.getByTestId("guidewayLink-connection:tile-platform:guideway-b:tile-power:guideway-a"),
    );
    expect(screen.getByRole("heading", { name: "Inter-tile guideway connection" })).toBeInTheDocument();
    expect(screen.getByText("tile-platform:guideway-b")).toBeInTheDocument();
  });

  it("enables electrical overlay and selects sources and loads", () => {
    render(<ScenarioMap />);

    fireEvent.click(screen.getByLabelText("Electrical network"));
    fireEvent.click(screen.getByTestId("electricalSource-tile-power:source"));
    expect(screen.getByRole("heading", { name: "Nominal power source" })).toBeInTheDocument();
    expect(screen.getByText("100 W")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("electricalLoad-sp-charging-siding:charger"));
    expect(screen.getByRole("heading", { name: "charging load" })).toBeInTheDocument();
    expect(screen.getByText("20 W")).toBeInTheDocument();
  });

  it("highlights related objects for service-zone selection", () => {
    render(<ScenarioMap />);

    fireEvent.click(screen.getByTestId("serviceZone-zone-passenger"));
    expect(screen.getByTestId("tile-tile-platform")).toHaveClass("is-related");
    expect(screen.getByTestId("guidewayNode-tile-platform:guideway-b")).toHaveClass("is-related");
  });

  it("preserves view transform across layer toggles", () => {
    render(<ScenarioMap />);
    const svg = screen.getByTestId("scenario-map-svg");
    const transformedGroup = () => svg.querySelector("g[transform]")?.getAttribute("transform");

    fireEvent.wheel(svg, { deltaY: -120, clientX: 200, clientY: 200 });
    const zoomedTransform = transformedGroup();
    fireEvent.click(screen.getByLabelText("Electrical network"));

    expect(transformedGroup()).toBe(zoomedTransform);
  });

  it("navigates actionable diagnostics and enables the relevant layer", () => {
    const document = loadSixTileCityFixture();
    const diagnosticModel = buildScenarioMapRenderModel({
      ...document,
      layout: {
        ...document.layout,
        tiles: [document.layout.tiles[0] as (typeof document.layout.tiles)[number]],
        setPieces: [],
      },
      stations: [],
      serviceZones: [],
    });

    render(<ScenarioMap model={diagnosticModel} />);
    fireEvent.click(screen.getByRole("button", { name: /Open guideway ends: 2/i }));

    expect(screen.getByRole("heading", { name: /Open guideway edge/i })).toBeInTheDocument();
    expect(screen.getAllByText(/Inspect the adjacent tile/).length).toBeGreaterThan(0);
  });

  it("keeps details usable in the responsive panel structure", () => {
    render(<ScenarioMap />);

    const shell = screen.getByLabelText("Layout workspace");
    const details = within(shell).getByLabelText("Selection details");

    expect(details).toHaveClass("scenario-map-details");
    expect(screen.getByRole("group", { name: "Scenario map layers" })).toBeInTheDocument();
  });
});
