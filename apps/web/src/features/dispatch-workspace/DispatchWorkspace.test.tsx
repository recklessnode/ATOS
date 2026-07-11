import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { loadSixTileCityFixture } from "@atos/scenario";
import { DispatchWorkspace } from "./DispatchWorkspace";

describe("DispatchWorkspace", () => {
  it("renders the deterministic dispatch planning workspace", () => {
    render(<DispatchWorkspace />);

    const workspace = screen.getByRole("region", { name: "Dispatch workspace" });
    expect(within(workspace).getByRole("heading", { name: "Dispatch Planning Core" })).toBeInTheDocument();
    expect(within(workspace).getByRole("region", { name: "Dispatch summary" })).toBeInTheDocument();
    expect(within(workspace).getByRole("region", { name: "Universal chit queue" })).toBeInTheDocument();
    expect(within(workspace).getByRole("region", { name: "Persistent asset inventory" })).toBeInTheDocument();
    expect(within(workspace).getByRole("region", { name: "Dispatch worker pool" })).toBeInTheDocument();
    expect(within(workspace).getByRole("region", { name: "Transient super-workers" })).toBeInTheDocument();
    expect(within(workspace).getByRole("region", { name: "Mission plans" })).toBeInTheDocument();
    expect(within(workspace).getByRole("region", { name: "Dispatch reservations" })).toBeInTheDocument();
    expect(within(workspace).getByRole("region", { name: "Deficiency gates" })).toBeInTheDocument();
    expect(within(workspace).getByRole("region", { name: "Infrastructure recommendations" })).toBeInTheDocument();
    expect(within(workspace).getByRole("region", { name: "Dispatch score breakdown" })).toBeInTheDocument();
    expect(within(workspace).getByRole("region", { name: "Seeded demand preview" })).toBeInTheDocument();
    expect(screen.getByTestId("dispatch-mission-chit-express")).toBeInTheDocument();
  });

  it("focuses a mission target on the scenario map", () => {
    render(<DispatchWorkspace />);

    fireEvent.click(screen.getByRole("button", { name: "Focus mission chit-commuter" }));

    const details = screen.getByLabelText("Selection details");
    expect(details).not.toHaveTextContent("No object selected");
    expect(details).toHaveTextContent("connection:tile-cargo:guideway-b:tile-platform:guideway-a");
  });

  it("surfaces deficiency gates and focuses related assets", () => {
    const document = freshScenario();
    const commuter = document.chits.find((chit) => chit.id === "chit-commuter");
    if (!commuter) {
      throw new Error("fixture missing commuter chit");
    }
    document.chits = [
      { ...commuter, id: "chit-commuter-a" },
      { ...commuter, id: "chit-commuter-b", priority: commuter.priority - 1 },
    ];
    document.inventory.vehicles = document.inventory.vehicles.filter(
      (vehicle) => vehicle.id === "vehicle-commuter-1",
    );

    render(<DispatchWorkspace documentOverride={document} />);

    const deficiencies = screen.getByRole("region", { name: "Deficiency gates" });
    expect(within(deficiencies).getByText("reservation conflict")).toBeInTheDocument();

    fireEvent.click(within(deficiencies).getByRole("button", { name: /Focus deficiency/ }));

    const details = screen.getByLabelText("Selection details");
    expect(details).not.toHaveTextContent("No object selected");
    expect(details).toHaveTextContent("tile-platform");
  });

  it("does not mutate the six-tile fixture while planning", () => {
    const document = freshScenario();
    const before = JSON.stringify(document);

    render(<DispatchWorkspace documentOverride={document} />);

    expect(JSON.stringify(document)).toBe(before);
  });

  it("keeps the Dispatch workspace operable at phone width", () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    window.dispatchEvent(new Event("resize"));

    render(<DispatchWorkspace />);

    const workspace = screen.getByRole("region", { name: "Dispatch workspace" });
    expect(within(workspace).getByRole("region", { name: "Dispatch summary" })).toBeInTheDocument();
    expect(within(workspace).getByLabelText("Dispatch scenario map")).toBeInTheDocument();
    expect(within(workspace).getByRole("region", { name: "Mission plans" })).toBeInTheDocument();

    Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
  });
});

function freshScenario() {
  return structuredClone(loadSixTileCityFixture());
}
