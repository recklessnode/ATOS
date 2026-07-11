import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { loadSixTileCityFixture } from "@atos/scenario";
import { PowerWorkspace } from "./PowerWorkspace";

describe("PowerWorkspace", () => {
  it("renders deterministic power summary, tiers, and result tables", () => {
    render(<PowerWorkspace />);

    const workspace = screen.getByRole("region", { name: "Power workspace" });
    expect(within(workspace).getByRole("heading", { name: "DC Power Integrity" })).toBeInTheDocument();
    expect(within(workspace).getByLabelText("Operating preset")).toHaveValue("normal_operations");
    expect(within(workspace).getByRole("region", { name: "Power integrity summary" })).toBeInTheDocument();
    expect(within(workspace).getByRole("region", { name: "Consumer tier summary" })).toBeInTheDocument();
    expect(within(workspace).getByRole("region", { name: "Node voltage table" })).toBeInTheDocument();
    expect(within(workspace).getByRole("region", { name: "Branch current table" })).toBeInTheDocument();
    expect(within(workspace).getByText(/Tier 6 - Decorative/)).toBeInTheDocument();
  });

  it("switches PCB overlay modes", () => {
    render(<PowerWorkspace />);

    fireEvent.click(screen.getByLabelText("Current"));

    expect(screen.getByLabelText("Power current overlay")).toBeInTheDocument();
    expect(screen.getAllByTestId(/power-branch-/).length).toBeGreaterThan(0);
  });

  it("shows stress findings and focuses recommendation targets on the map", () => {
    render(<PowerWorkspace />);

    fireEvent.change(screen.getByLabelText("Operating preset"), {
      target: { value: "brownout_stress" },
    });

    const recommendations = screen.getByRole("region", { name: "Ranked power recommendations" });
    expect(within(recommendations).getAllByRole("button", { name: "Focus affected object" }).length).toBeGreaterThan(0);

    fireEvent.click(within(recommendations).getAllByRole("button", { name: "Focus affected object" })[0] as HTMLElement);

    expect(screen.getByLabelText("Selection details")).not.toHaveTextContent("No object selected");
  });

  it("does not mutate the six-tile fixture when switching presets", () => {
    const document = loadSixTileCityFixture();
    const before = JSON.stringify(document);
    render(<PowerWorkspace />);

    fireEvent.change(screen.getByLabelText("Operating preset"), {
      target: { value: "propulsion_surge" },
    });

    expect(JSON.stringify(document)).toBe(before);
  });
});
